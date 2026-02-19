#!/bin/bash
set -e

echo "=== CodeDeploy: ValidateService Stage ==="
echo "Timestamp: $(date)"

# Health check endpoint
HEALTH_ENDPOINT="http://localhost:8080/health"
MAX_ATTEMPTS=30
SLEEP_INTERVAL=2

echo "Starting health checks (max ${MAX_ATTEMPTS} attempts, ${SLEEP_INTERVAL}s interval)..."

for i in $(seq 1 ${MAX_ATTEMPTS}); do
    echo "Attempt ${i}/${MAX_ATTEMPTS}..."
    
    # Check if container is running
    if ! docker ps | grep -q mexc-sniper-blue; then
        echo "ERROR: Container mexc-sniper-blue is not running!"
        docker logs mexc-sniper-blue --tail 50 || true
        exit 1
    fi
    
    # Try to reach health endpoint
    if curl -f -s ${HEALTH_ENDPOINT} > /dev/null 2>&1; then
        echo "✓ Health check passed!"
        echo "Response from health endpoint:"
        curl -s ${HEALTH_ENDPOINT} | head -20
        echo ""
        echo "Application is healthy and ready to serve traffic"
        exit 0
    fi
    
    echo "  Service not ready yet, waiting ${SLEEP_INTERVAL}s..."
    sleep ${SLEEP_INTERVAL}
done

echo "ERROR: Health check failed after ${MAX_ATTEMPTS} attempts"
echo "Container logs:"
docker logs mexc-sniper-blue --tail 100
exit 1
