#!/bin/bash

################################################################################
# Deployment Status Summary Script
# Provides detailed status of blue and green environments
################################################################################

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

BLUE_CONTAINER="mexc-sniper-blue"
GREEN_CONTAINER="mexc-sniper-green"

print_header() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

print_section() {
    echo ""
    echo -e "${BLUE}--- $1 ---${NC}"
}

get_container_status() {
    local container_name=$1
    docker ps -a --filter "name=^${container_name}$" --format "{{.Status}}" 2>/dev/null || echo "NOT FOUND"
}

get_container_image() {
    local container_name=$1
    docker inspect "$container_name" --format '{{.Config.Image}}' 2>/dev/null || echo "N/A"
}

get_container_created() {
    local container_name=$1
    docker inspect "$container_name" --format '{{.Created}}' 2>/dev/null || echo "N/A"
}

get_container_uptime() {
    local container_name=$1
    local created=$(docker inspect "$container_name" --format '{{.State.StartedAt}}' 2>/dev/null)
    if [ -n "$created" ] && [ "$created" != "N/A" ]; then
        local created_seconds=$(date -d "$created" +%s 2>/dev/null || echo "0")
        local now_seconds=$(date +%s)
        local uptime_seconds=$((now_seconds - created_seconds))
        
        local days=$((uptime_seconds / 86400))
        local hours=$(( (uptime_seconds % 86400) / 3600 ))
        local minutes=$(( (uptime_seconds % 3600) / 60 ))
        
        if [ $days -gt 0 ]; then
            echo "${days}d ${hours}h ${minutes}m"
        elif [ $hours -gt 0 ]; then
            echo "${hours}h ${minutes}m"
        else
            echo "${minutes}m"
        fi
    else
        echo "N/A"
    fi
}

check_health_endpoint() {
    local port=$1
    local endpoint="http://localhost:${port}/health"
    
    if curl -f -s -m 3 "$endpoint" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ HEALTHY${NC}"
        return 0
    else
        echo -e "${RED}✗ UNHEALTHY${NC}"
        return 1
    fi
}

get_container_stats() {
    local container_name=$1
    docker stats --no-stream --format "CPU: {{.CPUPerc}}\tMEM: {{.MemUsage}}\tNET I/O: {{.NetIO}}" "$container_name" 2>/dev/null || echo "N/A"
}

display_container_info() {
    local container_name=$1
    local label=$2
    
    print_section "$label Environment ($container_name)"
    
    local status=$(get_container_status "$container_name")
    
    if [[ "$status" == "NOT FOUND" ]]; then
        echo -e "  Status: ${YELLOW}Container not found${NC}"
        return 0
    fi
    
    # Status
    if [[ "$status" =~ "Up" ]]; then
        echo -e "  Status: ${GREEN}Running${NC} ($status)"
    else
        echo -e "  Status: ${RED}Stopped${NC} ($status)"
    fi
    
    # Image
    local image=$(get_container_image "$container_name")
    echo "  Image: $image"
    
    # Created time
    local created=$(get_container_created "$container_name")
    echo "  Created: $created"
    
    # Uptime
    local uptime=$(get_container_uptime "$container_name")
    echo "  Uptime: $uptime"
    
    # Port mapping
    local ports=$(docker port "$container_name" 2>/dev/null | head -1 || echo "None")
    echo "  Ports: $ports"
    
    # Health check (only if running)
    if [[ "$status" =~ "Up" ]]; then
        echo -n "  Health: "
        check_health_endpoint 8080
        
        # Resource usage
        echo "  Resources:"
        get_container_stats "$container_name" | sed 's/^/    /'
        
        # Recent logs
        echo "  Recent Logs (last 5 lines):"
        docker logs --tail 5 "$container_name" 2>&1 | sed 's/^/    /'
    fi
}

display_network_info() {
    print_section "Network Information"
    
    # Check if port 8080 is listening
    if command -v netstat &> /dev/null; then
        echo "  Port 8080 listeners:"
        netstat -tlnp 2>/dev/null | grep ":8080" | sed 's/^/    /' || echo "    None"
    elif command -v ss &> /dev/null; then
        echo "  Port 8080 listeners:"
        ss -tlnp 2>/dev/null | grep ":8080" | sed 's/^/    /' || echo "    None"
    fi
    
    # Test external connectivity
    echo ""
    echo "  External Health Check:"
    if curl -f -s -m 3 http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "    ${GREEN}✓ http://localhost:8080/health is responding${NC}"
        local response=$(curl -s -m 3 http://localhost:8080/health)
        echo "    Response: $response"
    else
        echo -e "    ${RED}✗ http://localhost:8080/health is not responding${NC}"
    fi
}

display_deployment_history() {
    print_section "Recent Deployment History"
    
    # Find recent deployment logs
    local log_files=$(ls -t /tmp/deployment-*.log 2>/dev/null | head -5)
    
    if [ -z "$log_files" ]; then
        echo "  No deployment logs found"
        return 0
    fi
    
    echo "  Recent deployment logs:"
    for log in $log_files; do
        local timestamp=$(basename "$log" | sed 's/deployment-//' | sed 's/.log//')
        local status="UNKNOWN"
        
        if grep -q "Deployment completed successfully" "$log" 2>/dev/null; then
            status="${GREEN}SUCCESS${NC}"
        elif grep -q "Deployment failed" "$log" 2>/dev/null || grep -q "INITIATING ROLLBACK" "$log" 2>/dev/null; then
            status="${RED}FAILED${NC}"
        fi
        
        echo -e "    $timestamp - Status: $status"
        echo "      Log: $log"
    done
    
    # Find recent metrics
    echo ""
    echo "  Recent deployment metrics:"
    local metrics_files=$(ls -t /tmp/deployment-metrics-*.json 2>/dev/null | head -3)
    
    if [ -z "$metrics_files" ]; then
        echo "    No metrics found"
    else
        for metrics in $metrics_files; do
            if command -v jq &> /dev/null; then
                local deploy_status=$(jq -r '.deployment_status // "unknown"' "$metrics")
                local duration=$(jq -r '.total_duration_seconds // "N/A"' "$metrics")
                local cutover=$(jq -r '.steps.cutover_time.duration_seconds // "N/A"' "$metrics")
                local timestamp=$(basename "$metrics" | sed 's/deployment-metrics-//' | sed 's/.json//')
                
                echo "    $timestamp:"
                echo "      Status: $deploy_status | Total: ${duration}s | Cutover: ${cutover}s"
                echo "      Metrics: $metrics"
            else
                echo "    $metrics"
            fi
        done
    fi
}

display_recommendations() {
    print_section "Recommendations"
    
    local blue_status=$(get_container_status "$BLUE_CONTAINER")
    local green_status=$(get_container_status "$GREEN_CONTAINER")
    
    # Check if blue is running
    if [[ ! "$blue_status" =~ "Up" ]]; then
        echo -e "  ${RED}⚠ WARNING: Blue environment is not running${NC}"
        echo "    Action: Check logs and restart if needed"
    fi
    
    # Check if green is still running
    if [[ "$green_status" =~ "Up" ]]; then
        echo -e "  ${YELLOW}ℹ INFO: Green environment is still running${NC}"
        echo "    Action: Consider stopping green environment to save resources"
        echo "    Command: docker stop $GREEN_CONTAINER"
    fi
    
    # Check for old deployment logs
    local old_logs=$(find /tmp -name "deployment-*.log" -mtime +7 2>/dev/null | wc -l)
    if [ "$old_logs" -gt 0 ]; then
        echo -e "  ${YELLOW}ℹ INFO: Found $old_logs deployment log(s) older than 7 days${NC}"
        echo "    Action: Consider cleaning up old logs"
        echo "    Command: find /tmp -name 'deployment-*.log' -mtime +7 -delete"
    fi
    
    # Health check
    if ! curl -f -s -m 3 http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "  ${RED}⚠ CRITICAL: Health endpoint is not responding${NC}"
        echo "    Action: Investigate container logs and restart if needed"
    fi
}

main() {
    print_header "Deployment Status Summary"
    echo "Generated at: $(date '+%Y-%m-%d %H:%M:%S')"
    
    display_container_info "$BLUE_CONTAINER" "Blue (Production)"
    display_container_info "$GREEN_CONTAINER" "Green (Backup)"
    
    display_network_info
    display_deployment_history
    display_recommendations
    
    print_header "Status Check Complete"
}

# Check if running as part of deployment or standalone
if [ "$1" == "--watch" ]; then
    while true; do
        clear
        main
        echo ""
        echo "Refreshing in 5 seconds... (Ctrl+C to exit)"
        sleep 5
    done
else
    main
fi
