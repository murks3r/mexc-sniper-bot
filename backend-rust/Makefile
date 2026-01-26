.PHONY: help build test check fmt lint clean deploy docker-build docker-run logs

# Colors for output
BLUE=\033[0;34m
GREEN=\033[0;32m
YELLOW=\033[0;33m
NC=\033[0m # No Color

help:
	@echo "$(BLUE)MEXC Sniper Bot - Rust Backend$(NC)"
	@echo ""
	@echo "$(GREEN)Development Commands:$(NC)"
	@echo "  make build              - Build release binary"
	@echo "  make test               - Run all tests"
	@echo "  make test-ignored       - Run integration tests (requires setup)"
	@echo "  make check              - Run cargo check"
	@echo "  make fmt                - Format code"
	@echo "  make fmt-check          - Check formatting"
	@echo "  make lint               - Run clippy linter"
	@echo "  make clean              - Remove build artifacts"
	@echo ""
	@echo "$(GREEN)Docker Commands:$(NC)"
	@echo "  make docker-build       - Build Docker image"
	@echo "  make docker-run         - Run Docker container locally"
	@echo "  make docker-stop        - Stop running container"
	@echo "  make docker-logs        - View container logs"
	@echo ""
	@echo "$(GREEN)Deployment Commands:$(NC)"
	@echo "  make deploy-ecr         - Build and push to ECR"
	@echo "  make deploy-ec2         - Deploy to EC2 (manual)"
	@echo ""
	@echo "$(GREEN)Utility Commands:$(NC)"
	@echo "  make setup-env          - Copy .env.example to .env"
	@echo "  make health             - Check API health"
	@echo ""

# Development
build:
	@echo "$(YELLOW)Building release binary...$(NC)"
	cd backend-rust && cargo build --release --target x86_64-unknown-linux-musl
	@echo "$(GREEN)✓ Build complete$(NC)"
	ls -lh backend-rust/target/x86_64-unknown-linux-musl/release/mexc-sniper

test:
	@echo "$(YELLOW)Running tests...$(NC)"
	cd backend-rust && cargo test --verbose

test-ignored:
	@echo "$(YELLOW)Running integration tests (may require AWS setup)...$(NC)"
	cd backend-rust && cargo test -- --ignored --nocapture

check:
	@echo "$(YELLOW)Running cargo check...$(NC)"
	cd backend-rust && cargo check --all-targets

fmt:
	@echo "$(YELLOW)Formatting code...$(NC)"
	cd backend-rust && cargo fmt

fmt-check:
	@echo "$(YELLOW)Checking formatting...$(NC)"
	cd backend-rust && cargo fmt -- --check

lint:
	@echo "$(YELLOW)Running clippy...$(NC)"
	cd backend-rust && cargo clippy --all-targets -- -D warnings

clean:
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	cd backend-rust && cargo clean
	@echo "$(GREEN)✓ Clean complete$(NC)"

# Docker
docker-build:
	@echo "$(YELLOW)Building Docker image...$(NC)"
	cd backend-rust && docker build -t mexc-sniper-rust:latest .
	@echo "$(GREEN)✓ Docker build complete$(NC)"
	docker images mexc-sniper-rust:latest

docker-run: docker-build
	@echo "$(YELLOW)Starting Docker container...$(NC)"
	docker run -d \
		--name mexc-sniper-dev \
		-p 8080:8080 \
		-e RUST_LOG=debug \
		-e MEXC_API_KEY=${MEXC_API_KEY} \
		-e MEXC_SECRET_KEY=${MEXC_SECRET_KEY} \
		-e JWT_SECRET=${JWT_SECRET} \
		mexc-sniper-rust:latest
	@echo "$(GREEN)✓ Container started$(NC)"
	sleep 2
	curl -s http://localhost:8080/health | jq .

docker-stop:
	@echo "$(YELLOW)Stopping Docker container...$(NC)"
	docker stop mexc-sniper-dev 2>/dev/null || true
	docker rm mexc-sniper-dev 2>/dev/null || true
	@echo "$(GREEN)✓ Container stopped$(NC)"

docker-logs:
	docker logs -f mexc-sniper-dev 2>/dev/null || echo "Container not running"

# Deployment
setup-env:
	@if [ ! -f backend-rust/.env ]; then \
		echo "$(YELLOW)Copying .env.example to .env...$(NC)"; \
		cp backend-rust/.env.example backend-rust/.env; \
		echo "$(YELLOW)Edit backend-rust/.env with your credentials$(NC)"; \
	else \
		echo "$(BLUE).env already exists$(NC)"; \
	fi

deploy-ecr:
	@echo "$(YELLOW)Building and pushing to ECR...$(NC)"
	@if [ -z "$(AWS_ACCOUNT_ID)" ]; then \
		echo "$(RED)Error: AWS_ACCOUNT_ID not set$(NC)"; \
		exit 1; \
	fi
	@echo "Account: $(AWS_ACCOUNT_ID)"
	aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.ap-southeast-1.amazonaws.com
	cd backend-rust && docker build -t mexc-sniper-rust:latest .
	docker tag mexc-sniper-rust:latest $(AWS_ACCOUNT_ID).dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
	docker push $(AWS_ACCOUNT_ID).dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
	@echo "$(GREEN)✓ ECR push complete$(NC)"

deploy-ec2:
	@echo "$(YELLOW)Manual EC2 deployment steps:$(NC)"
	@echo ""
	@echo "1. SSH to EC2:"
	@echo "   ssh -i your-key.pem ec2-user@$(AWS_EC2_IP)"
	@echo ""
	@echo "2. Pull latest image:"
	@echo "   docker pull $(AWS_ACCOUNT_ID).dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest"
	@echo ""
	@echo "3. Blue-Green deployment:"
	@echo "   docker rename mexc-sniper-blue mexc-sniper-green || true"
	@echo "   docker run -d --name mexc-sniper-blue -p 8080:8080 ..."
	@echo ""
	@echo "See RUST_DEPLOYMENT_GUIDE.md for complete instructions"

# Utility
health:
	@echo "$(YELLOW)Checking API health...$(NC)"
	@curl -s http://localhost:8080/health | jq . || echo "API not responding"

run-dev:
	@echo "$(YELLOW)Running in dev mode...$(NC)"
	cd backend-rust && RUST_LOG=debug cargo run

bench:
	@echo "$(YELLOW)Running benchmarks...$(NC)"
	cd backend-rust && cargo test --release -- --nocapture --test-threads=1 | grep -E "test|ns|μs|ms|latency"

.PHONY: database-setup
database-setup:
	@echo "$(YELLOW)Setting up DynamoDB...$(NC)"
	bash scripts/setup-dynamodb.sh

.PHONY: migrate-data
migrate-data:
	@echo "$(YELLOW)Migrating data PostgreSQL → DynamoDB...$(NC)"
	@echo "Ensure environment variables are set:"
	@echo "  PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD"
	@echo "  AWS_REGION, DYNAMODB_TABLE"
	npx ts-node scripts/migrate-to-dynamodb.ts
