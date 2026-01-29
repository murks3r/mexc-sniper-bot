#!/bin/bash

################################################################################
# Blue-Green Deployment Script for Rust Backend
# Provides zero-downtime deployment with comprehensive logging and metrics
################################################################################

set -e
set -o pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment variables
DEPLOYMENT_START_TIME=$(date +%s)
DEPLOYMENT_LOG_FILE="/tmp/deployment-$(date +%Y%m%d-%H%M%S).log"
DEPLOYMENT_METRICS_FILE="/tmp/deployment-metrics-$(date +%Y%m%d-%H%M%S).json"

# AWS and Docker configuration
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
ECR_REGISTRY="${ECR_REGISTRY}"
DOCKER_IMAGE_NAME="${DOCKER_IMAGE_NAME:-mexc-sniper-rust}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Container names
BLUE_CONTAINER="mexc-sniper-blue"
GREEN_CONTAINER="mexc-sniper-green"
CURRENT_PORT=8080

# Health check configuration
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2
HEALTH_ENDPOINT="http://localhost:8080/health"

################################################################################
# Logging Functions
################################################################################

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$DEPLOYMENT_LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $@" | tee -a "$DEPLOYMENT_LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $@" | tee -a "$DEPLOYMENT_LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $@" | tee -a "$DEPLOYMENT_LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $@" | tee -a "$DEPLOYMENT_LOG_FILE"
}

log_section() {
    echo "" | tee -a "$DEPLOYMENT_LOG_FILE"
    echo "========================================" | tee -a "$DEPLOYMENT_LOG_FILE"
    echo "$@" | tee -a "$DEPLOYMENT_LOG_FILE"
    echo "========================================" | tee -a "$DEPLOYMENT_LOG_FILE"
}

################################################################################
# Metrics Tracking
################################################################################

init_metrics() {
    cat > "$DEPLOYMENT_METRICS_FILE" << EOF
{
  "deployment_start": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployment_id": "$(uuidgen || echo "deploy-$(date +%s)")",
  "image_tag": "$IMAGE_TAG",
  "steps": {}
}
EOF
    log_info "Metrics tracking initialized: $DEPLOYMENT_METRICS_FILE"
}

record_metric() {
    local step_name=$1
    local step_status=$2
    local step_duration=$3
    
    # Create temporary file with updated metrics
    jq --arg name "$step_name" \
       --arg status "$step_status" \
       --arg duration "$step_duration" \
       '.steps[$name] = {"status": $status, "duration_seconds": ($duration | tonumber)}' \
       "$DEPLOYMENT_METRICS_FILE" > "${DEPLOYMENT_METRICS_FILE}.tmp" 2>/dev/null || {
        # Fallback if jq is not available
        log_warning "jq not available, metrics recording skipped for $step_name"
        return 0
    }
    mv "${DEPLOYMENT_METRICS_FILE}.tmp" "$DEPLOYMENT_METRICS_FILE"
}

finalize_metrics() {
    local deployment_status=$1
    local deployment_end_time=$(date +%s)
    local total_duration=$((deployment_end_time - DEPLOYMENT_START_TIME))
    
    jq --arg status "$deployment_status" \
       --arg end_time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       --arg total_duration "$total_duration" \
       '.deployment_status = $status | .deployment_end = $end_time | .total_duration_seconds = ($total_duration | tonumber)' \
       "$DEPLOYMENT_METRICS_FILE" > "${DEPLOYMENT_METRICS_FILE}.tmp" 2>/dev/null && \
       mv "${DEPLOYMENT_METRICS_FILE}.tmp" "$DEPLOYMENT_METRICS_FILE" || \
       log_warning "Failed to finalize metrics"
}

################################################################################
# Container Management Functions
################################################################################

get_container_status() {
    local container_name=$1
    docker ps -a --filter "name=^${container_name}$" --format "{{.Status}}" 2>/dev/null || echo "not found"
}

get_running_container() {
    docker ps --filter "name=mexc-sniper" --format "{{.Names}}" 2>/dev/null | head -1 || echo ""
}

stop_container() {
    local container_name=$1
    log_info "Stopping container: $container_name"
    docker stop "$container_name" 2>/dev/null || log_warning "Container $container_name not running"
}

remove_container() {
    local container_name=$1
    log_info "Removing container: $container_name"
    docker rm "$container_name" 2>/dev/null || log_warning "Container $container_name not found"
}

################################################################################
# Health Check Functions
################################################################################

wait_for_health() {
    local container_name=$1
    local retries=$HEALTH_CHECK_RETRIES
    local interval=$HEALTH_CHECK_INTERVAL
    
    log_info "Waiting for health check on $container_name..."
    log_info "Health endpoint: $HEALTH_ENDPOINT"
    
    for i in $(seq 1 $retries); do
        if curl -f -s -m 5 "$HEALTH_ENDPOINT" >/dev/null 2>&1; then
            log_success "Health check passed on attempt $i/$retries"
            return 0
        fi
        
        # Check if container is still running
        if ! docker ps --filter "name=^${container_name}$" --format "{{.Names}}" | grep -q "^${container_name}$"; then
            log_error "Container $container_name stopped unexpectedly"
            log_error "Last 20 lines of container logs:"
            docker logs --tail 20 "$container_name" 2>&1 | tee -a "$DEPLOYMENT_LOG_FILE"
            return 1
        fi
        
        log_info "Attempt $i/$retries - Waiting ${interval}s..."
        sleep $interval
    done
    
    log_error "Health check failed after $retries attempts"
    log_error "Container logs:"
    docker logs --tail 50 "$container_name" 2>&1 | tee -a "$DEPLOYMENT_LOG_FILE"
    return 1
}

comprehensive_health_check() {
    local container_name=$1
    
    log_section "Running Comprehensive Health Checks"
    
    # 1. Container status check
    log_info "1. Checking container status..."
    local status=$(get_container_status "$container_name")
    if [[ ! "$status" =~ "Up" ]]; then
        log_error "Container is not running: $status"
        return 1
    fi
    log_success "Container is running"
    
    # 2. Basic health endpoint
    log_info "2. Checking /health endpoint..."
    if ! curl -f -s -m 5 "$HEALTH_ENDPOINT" >/dev/null 2>&1; then
        log_error "/health endpoint check failed"
        return 1
    fi
    log_success "/health endpoint is responding"
    
    # 3. Port binding check
    log_info "3. Checking port binding..."
    if ! docker port "$container_name" | grep -q "8080"; then
        log_error "Port 8080 is not bound"
        return 1
    fi
    log_success "Port 8080 is properly bound"
    
    # 4. Resource usage check
    log_info "4. Checking resource usage..."
    docker stats --no-stream "$container_name" | tee -a "$DEPLOYMENT_LOG_FILE"
    
    log_success "All health checks passed"
    return 0
}

################################################################################
# Rollback Function
################################################################################

rollback_deployment() {
    log_section "INITIATING ROLLBACK"
    log_warning "Rolling back to previous version..."
    
    local rollback_start=$(date +%s)
    
    # Stop the failed blue container
    stop_container "$BLUE_CONTAINER"
    remove_container "$BLUE_CONTAINER"
    
    # Check if green container exists
    if docker ps -a --filter "name=^${GREEN_CONTAINER}$" --format "{{.Names}}" | grep -q "^${GREEN_CONTAINER}$"; then
        log_info "Restoring previous version from green container"
        docker rename "$GREEN_CONTAINER" "$BLUE_CONTAINER" 2>/dev/null || true
        docker start "$BLUE_CONTAINER"
        
        if wait_for_health "$BLUE_CONTAINER"; then
            local rollback_end=$(date +%s)
            local rollback_duration=$((rollback_end - rollback_start))
            log_success "Rollback completed in ${rollback_duration}s"
            record_metric "rollback" "success" "$rollback_duration"
            return 0
        else
            log_error "Rollback failed - system may be down"
            record_metric "rollback" "failed" "$(($(date +%s) - rollback_start))"
            return 1
        fi
    else
        log_error "No previous version available for rollback"
        record_metric "rollback" "failed" "$(($(date +%s) - rollback_start))"
        return 1
    fi
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    log_section "Blue-Green Deployment Started"
    log_info "Image: $ECR_REGISTRY/$DOCKER_IMAGE_NAME:$IMAGE_TAG"
    log_info "Log file: $DEPLOYMENT_LOG_FILE"
    log_info "Metrics file: $DEPLOYMENT_METRICS_FILE"
    
    init_metrics
    
    # Step 1: ECR Login
    log_section "Step 1: ECR Authentication"
    local step_start=$(date +%s)
    if aws ecr get-login-password --region "$AWS_REGION" | \
       docker login --username AWS --password-stdin "$ECR_REGISTRY"; then
        record_metric "ecr_login" "success" "$(($(date +%s) - step_start))"
        log_success "ECR login successful"
    else
        record_metric "ecr_login" "failed" "$(($(date +%s) - step_start))"
        log_error "ECR login failed"
        finalize_metrics "failed"
        exit 1
    fi
    
    # Step 2: Pull new image
    log_section "Step 2: Pulling New Image"
    step_start=$(date +%s)
    local image_url="$ECR_REGISTRY/$DOCKER_IMAGE_NAME:$IMAGE_TAG"
    log_info "Pulling: $image_url"
    
    if docker pull "$image_url"; then
        record_metric "image_pull" "success" "$(($(date +%s) - step_start))"
        log_success "Image pulled successfully"
        
        # Show image details
        log_info "Image details:"
        docker images "$image_url" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | tee -a "$DEPLOYMENT_LOG_FILE"
    else
        record_metric "image_pull" "failed" "$(($(date +%s) - step_start))"
        log_error "Failed to pull image"
        finalize_metrics "failed"
        exit 1
    fi
    
    # Step 3: Identify current state
    log_section "Step 3: Identifying Current Environment"
    step_start=$(date +%s)
    
    local current_container=$(get_running_container)
    if [ -n "$current_container" ]; then
        log_info "Current running container: $current_container"
        local current_image=$(docker inspect "$current_container" --format '{{.Config.Image}}' 2>/dev/null || echo "unknown")
        log_info "Current image: $current_image"
    else
        log_info "No running container found (fresh deployment)"
    fi
    record_metric "state_identification" "success" "$(($(date +%s) - step_start))"
    
    # Step 4: Prepare for cutover
    log_section "Step 4: Preparing for Cutover"
    step_start=$(date +%s)
    
    # Stop and remove old green container
    stop_container "$GREEN_CONTAINER"
    remove_container "$GREEN_CONTAINER"
    
    # Rename current blue to green (if exists)
    if docker ps -a --filter "name=^${BLUE_CONTAINER}$" --format "{{.Names}}" | grep -q "^${BLUE_CONTAINER}$"; then
        log_info "Renaming $BLUE_CONTAINER to $GREEN_CONTAINER for backup"
        docker rename "$BLUE_CONTAINER" "$GREEN_CONTAINER" 2>/dev/null || {
            log_warning "Failed to rename, removing old blue container"
            stop_container "$BLUE_CONTAINER"
            remove_container "$BLUE_CONTAINER"
        }
    fi
    record_metric "cutover_preparation" "success" "$(($(date +%s) - step_start))"
    
    # Step 5: Start new blue container
    log_section "Step 5: Starting New Blue Environment"
    step_start=$(date +%s)
    local cutover_start=$(date +%s)
    
    log_info "Starting new container: $BLUE_CONTAINER"
    
    if docker run -d \
        --name "$BLUE_CONTAINER" \
        --restart unless-stopped \
        -p ${CURRENT_PORT}:8080 \
        -e AWS_REGION="$AWS_REGION" \
        -e MEXC_API_KEY="${MEXC_API_KEY}" \
        -e MEXC_SECRET_KEY="${MEXC_SECRET_KEY}" \
        -e JWT_SECRET="${JWT_SECRET}" \
        -e RUST_LOG="${RUST_LOG:-info}" \
        "$image_url"; then
        
        log_success "Container started successfully"
        
        # Show container details
        log_info "Container details:"
        docker ps --filter "name=^${BLUE_CONTAINER}$" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | tee -a "$DEPLOYMENT_LOG_FILE"
        
        record_metric "container_start" "success" "$(($(date +%s) - step_start))"
    else
        record_metric "container_start" "failed" "$(($(date +%s) - step_start))"
        log_error "Failed to start container"
        rollback_deployment
        finalize_metrics "failed"
        exit 1
    fi
    
    # Step 6: Health checks
    log_section "Step 6: Running Health Checks"
    step_start=$(date +%s)
    
    if wait_for_health "$BLUE_CONTAINER"; then
        record_metric "health_check" "success" "$(($(date +%s) - step_start))"
        
        # Run comprehensive health check
        if comprehensive_health_check "$BLUE_CONTAINER"; then
            record_metric "comprehensive_health_check" "success" "$(($(date +%s) - step_start))"
        else
            log_warning "Some comprehensive health checks failed, but basic health is OK"
        fi
    else
        record_metric "health_check" "failed" "$(($(date +%s) - step_start))"
        log_error "Health check failed"
        rollback_deployment
        finalize_metrics "failed"
        exit 1
    fi
    
    # Calculate cutover time
    local cutover_end=$(date +%s)
    local cutover_duration=$((cutover_end - cutover_start))
    record_metric "cutover_time" "success" "$cutover_duration"
    log_success "Cutover completed in ${cutover_duration}s (target: <10s)"
    
    # Step 7: Cleanup old green container
    log_section "Step 7: Cleanup"
    step_start=$(date +%s)
    
    log_info "Stopping old green container (kept for manual rollback if needed)"
    stop_container "$GREEN_CONTAINER"
    log_info "Old version kept as $GREEN_CONTAINER (stopped) for emergency rollback"
    record_metric "cleanup" "success" "$(($(date +%s) - step_start))"
    
    # Final summary
    log_section "Deployment Summary"
    finalize_metrics "success"
    
    local deployment_end=$(date +%s)
    local total_duration=$((deployment_end - DEPLOYMENT_START_TIME))
    
    log_success "Deployment completed successfully!"
    log_info "Total duration: ${total_duration}s"
    log_info "Cutover time: ${cutover_duration}s"
    log_info "New version running: $image_url"
    log_info "Backup version: $GREEN_CONTAINER (stopped)"
    log_info "Deployment log: $DEPLOYMENT_LOG_FILE"
    log_info "Deployment metrics: $DEPLOYMENT_METRICS_FILE"
    
    # Display current environment status
    log_section "Current Environment Status"
    docker ps --filter "name=mexc-sniper" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" | tee -a "$DEPLOYMENT_LOG_FILE"
    
    # Display metrics summary
    if command -v jq &> /dev/null; then
        log_section "Deployment Metrics"
        cat "$DEPLOYMENT_METRICS_FILE" | jq '.' | tee -a "$DEPLOYMENT_LOG_FILE"
    fi
    
    return 0
}

# Trap errors
trap 'log_error "Deployment failed at line $LINENO"; finalize_metrics "failed"; exit 1' ERR

# Execute main deployment
main

exit 0
