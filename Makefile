.PHONY: help dev dev-next dev-inngest kill-ports kill-port-3008 kill-port-8288 clean install build test lint format type-check db-migrate db-push db-studio db-generate check-target check-target-sync sync-calendar status

# Ports used by the application
NEXT_PORT := 3008
INNGEST_PORT := 8288

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)MEXC Sniper Bot - Makefile Commands$(NC)"
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@echo "  make dev              Start all development servers (Next.js + Inngest)"
	@echo "  make dev-next         Start Next.js dev server on port $(NEXT_PORT)"
	@echo "  make dev-inngest      Start Inngest dev server on port $(INNGEST_PORT)"
	@echo ""
	@echo "$(YELLOW)Port Management:$(NC)"
	@echo "  make kill-ports       Kill all application ports ($(NEXT_PORT), $(INNGEST_PORT))"
	@echo "  make kill-port-3008   Kill port $(NEXT_PORT) (Next.js)"
	@echo "  make kill-port-8288   Kill port $(INNGEST_PORT) (Inngest)"
	@echo ""
	@echo "$(YELLOW)Build & Test:$(NC)"
	@echo "  make build            Build the application"
	@echo "  make test             Run tests"
	@echo "  make lint             Run linter"
	@echo "  make format           Format code"
	@echo "  make type-check       Type check TypeScript"
	@echo ""
	@echo "$(YELLOW)Database:$(NC)"
	@echo "  make db-migrate       Run database migrations"
	@echo "  make db-push          Push database schema changes"
	@echo "  make db-studio        Open Drizzle Studio"
	@echo "  make db-generate      Generate database migrations"
	@echo ""
	@echo "$(YELLOW)Targets & Sync:$(NC)"
	@echo "  make check-target     Check next snipe target"
	@echo "  make check-target-sync Sync calendar and check targets"
	@echo "  make sync-calendar    Sync calendar for upcoming hour"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make install          Install dependencies"
	@echo "  make clean            Clean generated files"
	@echo "  make status           Check project status"

# Kill port helper function (works on macOS and Linux)
define kill_port
	@echo "$(YELLOW)Killing processes on port $(1)...$(NC)"
	@lsof -ti:$(1) | xargs kill -9 2>/dev/null || true
	@echo "$(GREEN)Port $(1) cleared$(NC)"
endef

kill-port-3008: ## Kill port 3008 (Next.js)
	$(call kill_port,$(NEXT_PORT))

kill-port-8288: ## Kill port 8288 (Inngest)
	$(call kill_port,$(INNGEST_PORT))

kill-ports: kill-port-3008 kill-port-8288 ## Kill all application ports
	@echo "$(GREEN)All ports cleared$(NC)"

# Development commands
dev: kill-ports ## Start all development servers
	@echo "$(GREEN)Starting all development servers...$(NC)"
	@echo "$(YELLOW)Next.js: http://localhost:$(NEXT_PORT)$(NC)"
	@echo "$(YELLOW)Inngest: http://localhost:$(INNGEST_PORT)$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop both servers$(NC)"
	@echo ""
	@bash -c 'trap "kill 0" EXIT; npm run dev & npm run dev:inngest & wait'

dev-next: kill-port-3008 ## Start Next.js dev server
	@echo "$(GREEN)Starting Next.js dev server on port $(NEXT_PORT)...$(NC)"
	@npm run dev

dev-inngest: kill-port-8288 ## Start Inngest dev server
	@echo "$(GREEN)Starting Inngest dev server on port $(INNGEST_PORT)...$(NC)"
	@npm run dev:inngest

# Build commands
install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	@bun install || npm install

build: ## Build the application
	@echo "$(GREEN)Building application...$(NC)"
	@npm run build

# Test commands
test: ## Run tests
	@echo "$(GREEN)Running tests...$(NC)"
	@npm run test

test-watch: ## Run tests in watch mode
	@echo "$(GREEN)Running tests in watch mode...$(NC)"
	@npm run test:watch

test-coverage: ## Run tests with coverage
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	@npm run test:coverage

# Code quality commands
lint: ## Run linter
	@echo "$(GREEN)Running linter...$(NC)"
	@npm run lint

format: ## Format code
	@echo "$(GREEN)Formatting code...$(NC)"
	@npm run format

type-check: ## Type check TypeScript
	@echo "$(GREEN)Type checking TypeScript...$(NC)"
	@npm run type-check

# Database commands
db-migrate: ## Run database migrations
	@echo "$(GREEN)Running database migrations...$(NC)"
	@npm run db:migrate

db-push: ## Push database schema changes
	@echo "$(GREEN)Pushing database schema changes...$(NC)"
	@npm run db:push

db-studio: ## Open Drizzle Studio
	@echo "$(GREEN)Opening Drizzle Studio...$(NC)"
	@npm run db:studio

db-generate: ## Generate database migrations
	@echo "$(GREEN)Generating database migrations...$(NC)"
	@npm run db:generate

# Target and sync commands
check-target: ## Check next snipe target
	@echo "$(GREEN)Checking next snipe target...$(NC)"
	@npm run check-target

check-target-sync: ## Sync calendar and check targets
	@echo "$(GREEN)Syncing calendar and checking targets...$(NC)"
	@npm run check-target:sync

sync-calendar: ## Sync calendar for upcoming hour
	@echo "$(GREEN)Syncing calendar for upcoming hour...$(NC)"
	@npm run sync-calendar

# Utility commands
clean: ## Clean generated files
	@echo "$(GREEN)Cleaning generated files...$(NC)"
	@rm -rf .next
	@rm -rf node_modules/.cache
	@rm -rf .turbo
	@rm -rf dist
	@rm -rf build
	@echo "$(GREEN)Clean complete$(NC)"

status: ## Check project status
	@echo "$(GREEN)Project Status:$(NC)"
	@echo ""
	@echo "$(YELLOW)Port Status:$(NC)"
	@lsof -ti:$(NEXT_PORT) >/dev/null 2>&1 && echo "  ✓ Port $(NEXT_PORT) (Next.js): $(GREEN)IN USE$(NC)" || echo "  ✗ Port $(NEXT_PORT) (Next.js): $(RED)FREE$(NC)"
	@lsof -ti:$(INNGEST_PORT) >/dev/null 2>&1 && echo "  ✓ Port $(INNGEST_PORT) (Inngest): $(GREEN)IN USE$(NC)" || echo "  ✗ Port $(INNGEST_PORT) (Inngest): $(RED)FREE$(NC)"
	@echo ""
	@echo "$(YELLOW)Environment:$(NC)"
	@test -f .env.local && echo "  ✓ .env.local exists" || echo "  ✗ .env.local missing"
	@test -f .env && echo "  ✓ .env exists" || echo "  ✗ .env missing"
	@echo ""
	@echo "$(YELLOW)Dependencies:$(NC)"
	@test -d node_modules && echo "  ✓ node_modules installed" || echo "  ✗ node_modules missing - run 'make install'"
	@echo ""
	@echo "$(YELLOW)Database:$(NC)"
	@test -n "$$DATABASE_URL" && echo "  ✓ DATABASE_URL is set" || echo "  ✗ DATABASE_URL not set"

# Default target
.DEFAULT_GOAL := help

