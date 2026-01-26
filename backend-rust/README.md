# Build & Run Instructions für Rust Backend

## Prerequisites

- Rust 1.75+ (`rustup update`)
- Docker & Docker Compose
- AWS CLI v2
- PostgreSQL (für Migration)

## Lokale Entwicklung

### 1. Setup Umgebung

```bash
cd backend-rust
cp .env.example .env
# Edit .env mit deinen Credentials
```

### 2. DynamoDB Lokal (optional)

```bash
# DynamoDB Local starten
docker run -d -p 8000:8000 amazon/dynamodb-local

# Tabelle erstellen
../scripts/setup-dynamodb.sh
```

### 3. Build & Run

```bash
# Build (Release)
cargo build --release

# Run
./target/release/mexc-sniper

# oder mit logging
RUST_LOG=debug cargo run --release
```

### 4. Tests

```bash
# Alle Tests ausführen
cargo test

# Nur Unit Tests
cargo test --lib

# Mit Output
cargo test -- --nocapture
```

## Docker Deployment

### Local Development

```bash
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up
```

### AWS ECR Push

```bash
AWS_ACCOUNT_ID=YOUR_ACCOUNT
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com

docker build -t mexc-sniper-rust .
docker tag mexc-sniper-rust:latest $AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
```

## API Endpoints

### Health Checks
- `GET /health` - Simple health check
- `GET /api/admin/health` - Detailed health status
- `GET /api/admin/ready` - Readiness probe
- `GET /api/admin/metrics` - Prometheus metrics

### Trading
- `POST /api/trade/order` - Create new order
- `GET /api/trade/order/:user_id/:order_id` - Get order status
- `DELETE /api/trade/order/:user_id/:order_id` - Cancel order

### Market Data
- `GET /api/market/ticker/:symbol` - Get current price
- `GET /api/market/balance` - Get account balance

## Data Migration

```bash
# Migriere PostgreSQL zu DynamoDB
npx ts-node scripts/migrate-to-dynamodb.ts

# Environment Variablen für Migration:
# PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
# AWS_REGION, DYNAMODB_TABLE
```

## Performance Tuning

### Production Build

```bash
# Optimized Release Build
RUSTFLAGS="-C target-feature=+crt-static" cargo build --release --target x86_64-unknown-linux-musl
```

### Docker Image Size

```bash
# Check image size
docker images mexc-sniper-rust

# Expected: ~50-100MB (minimal Alpine image)
```

## Troubleshooting

### Connection Pooling Timeout
```bash
# Increase timeout in code
reqwest::Client::builder()
    .timeout(Duration::from_secs(30))
    .build()
```

### DynamoDB Rate Limiting
```bash
# Prüfe DynamoDB Metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedWriteCapacityUnits \
  --dimensions Name=TableName,Value=mexc_trading_data \
  --start-time 2024-01-24T00:00:00Z \
  --end-time 2024-01-24T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## GitHub Actions Workflows

### CI/CD Pipeline
- **rust-ci.yml**: Format check, Clippy lint, Tests, Security audit
- **deploy-rust.yml**: Build, Docker push to ECR, Blue-Green deployment

### Manual Deployment
```bash
# Trigger via GitHub Actions UI oder:
gh workflow run deploy-rust.yml --ref main
```

## Documentation

- [ASYNC_SNIPER_ARCHITECTURE.md](../docs/ASYNC_SNIPER_ARCHITECTURE.md) - Architecture details
- [HYBRID_QUEUE_ARCHITECTURE.md](../docs/HYBRID_QUEUE_ARCHITECTURE.md) - Queue design
- Performance goals: <15ms response time, <50ms order execution
