# QUICK START - Rust Backend Migration

**Geschätzter Aufwand**: 2 Stunden für erste Deployment

## TL;DR - 5 Minuten Überblick

```bash
# 1. Clone und Setup
cd backend-rust
cp .env.example .env
# Edit .env mit MEXC_API_KEY, MEXC_SECRET_KEY

# 2. Build
cargo build --release

# 3. Local Test
cargo test

# 4. Run
./target/release/mexc-sniper
# Server läuft auf http://localhost:8080

# 5. Health Check
curl http://localhost:8080/health
```

## Schritt-für-Schritt Anleitung

### Phase 1: Vorbereitung (30 Min)

#### 1.1 Prerequisites installieren

```bash
# Rust (1.75+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# AWS CLI
pip install awscli --upgrade

# Verify
rustc --version     # 1.75+
docker --version    # 24+
aws --version       # 2.x
```

#### 1.2 Environment konfigurieren

```bash
cd backend-rust

# Copy template
cp .env.example .env

# Edit .env
nano .env

# Minimal required:
# MEXC_API_KEY=your_key
# MEXC_SECRET_KEY=your_secret
# JWT_SECRET=any_random_string_for_now
```

### Phase 2: Lokale Entwicklung (1 Stunde)

#### 2.1 Build & Test

```bash
# Build (takes 2-5 min first time)
make build
# oder:
cargo build --release

# Run all tests
make test
# oder:
cargo test
```

#### 2.2 Run lokal

```bash
# Terminal 1: Start Server
make run-dev
# oder:
cargo run --release

# Terminal 2: Health Check
curl http://localhost:8080/health
# Expect: {"status":"healthy","timestamp":"..."}

# Terminal 3: Test Order Creation (später)
curl -X POST http://localhost:8080/api/trade/order \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "ETHUSDT",
    "side": "BUY",
    "order_type": "LIMIT",
    "quantity": 0.1,
    "price": 2000
  }'
```

#### 2.3 Docker lokal testen

```bash
# Build image
make docker-build

# Run container
make docker-run

# Check container is healthy
docker ps | grep mexc-sniper

# View logs
make docker-logs

# Stop when done
make docker-stop
```

### Phase 3: AWS Infrastructure Setup (45 Min)

#### 3.1 AWS Credentials vorbereiten

```bash
# AWS CLI konfigurieren
aws configure
# Eingeben:
# AWS Access Key ID: [deine access key]
# AWS Secret Access Key: [dein secret key]
# Default region: ap-southeast-1
# Default output format: json

# Verify
aws sts get-caller-identity
```

#### 3.2 DynamoDB erstellen

```bash
# Setup Table mit allen GSIs, TTL, etc.
bash scripts/setup-dynamodb.sh

# Verify Table erstellt
aws dynamodb describe-table \
  --table-name mexc_trading_data \
  --region ap-southeast-1 | jq '.Table.TableStatus'
# Expect: ACTIVE
```

#### 3.3 IAM Role für EC2 Setup

Siehe: [RUST_MIGRATION_SETUP.md - Phase 1](RUST_MIGRATION_SETUP.md#phase-1-aws-infrastruktur-vorbereitung)

```bash
# Schnelle Version:
bash scripts/setup-iam-role.sh  # Falls verfügbar
```

### Phase 4: EC2 Deployment (30 Min)

#### 4.1 ECR Repository erstellen

```bash
# ECR Repo
aws ecr create-repository \
  --repository-name mexc-sniper-rust \
  --region ap-southeast-1

# Oder via AWS Console
```

#### 4.2 Docker Image bauen & pushen

```bash
# Build
make docker-build

# Login zu ECR
AWS_ACCOUNT_ID=123456789012  # Deine Account ID
aws ecr get-login-password --region ap-southeast-1 | \
docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com

# Tag & Push
docker tag mexc-sniper-rust:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
```

#### 4.3 EC2 Manual Deployment

```bash
# SSH zu EC2
ssh -i your-key.pem ec2-user@54.179.xxx.xxx

# Dort dann:
# Pull image
docker pull $ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest

# Stop old container
docker stop mexc-sniper-blue 2>/dev/null || true

# Run new container
docker run -d \
  --name mexc-sniper-blue \
  -p 8080:8080 \
  -e AWS_REGION=ap-southeast-1 \
  -e DYNAMODB_TABLE=mexc_trading_data \
  -e MEXC_API_KEY=$MEXC_API_KEY \
  -e MEXC_SECRET_KEY=$MEXC_SECRET_KEY \
  -e JWT_SECRET=$JWT_SECRET \
  $ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest

# Verify
curl http://localhost:8080/health
```

### Phase 5: GitHub Actions Setup (15 Min)

#### 5.1 Secrets hinzufügen

```bash
# Gehe zu: Repository Settings → Secrets and variables → Actions
# Erstelle:
AWS_ACCOUNT_ID = "123456789012"
AWS_ACCESS_KEY_ID = "AKIA..."
AWS_SECRET_ACCESS_KEY = "wJalr..."
AWS_EC2_IP = "54.179.xxx.xxx"
AWS_SSH_PRIVATE_KEY = "-----BEGIN RSA..."
MEXC_API_KEY = "your_api_key"
MEXC_SECRET_KEY = "your_secret_key"
JWT_SECRET = "your_jwt_secret"
```

#### 5.2 Test Deployment

```bash
# Push zu main branch triggert automatisch:
git add backend-rust/
git commit -m "Deploy Rust Backend"
git push origin main

# Watch deployment:
# GitHub → Actions → Deploy Rust Backend to AWS EC2
```

## Häufige Probleme & Lösungen

### Problem: Rust Installation fehlgeschlagen

```bash
# Lösung:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup update
```

### Problem: DynamoDB Tabelle nicht erreichbar

```bash
# Check Credentials
aws sts get-caller-identity

# Check Table
aws dynamodb describe-table --table-name mexc_trading_data

# Check IAM Policy
aws iam get-role-policy --role-name mexc-sniper-ec2-role \
  --policy-name mexc-sniper-dynamodb-access
```

### Problem: Docker Container startet nicht

```bash
# Check Logs
docker logs mexc-sniper-blue

# Mögliche Fehler:
# - Environment Variables nicht gesetzt
# - Port 8080 schon belegt
# - AWS Credentials fehlen

# Lösung:
docker rm mexc-sniper-blue
# Fix issue, dann nochmal run
```

### Problem: MEXC API 403 Unauthorized

```bash
# Check Signature
# - HMAC-SHA256 korrekt?
# - Timestamp korrekt?
# - API Keys gültig?

# Logs prüfen:
docker logs mexc-sniper-blue | grep MEXC
```

## Validierungschecklist

Nach Deployment sollten folgende Checks erfolgreich sein:

```bash
✓ API Health Check
curl http://EC2_IP:8080/health

✓ Readiness Check
curl http://EC2_IP:8080/api/admin/ready

✓ Market Data
curl http://EC2_IP:8080/api/market/ticker/ETHUSDT

✓ Account Balance
curl http://EC2_IP:8080/api/market/balance

✓ Order Creation
curl -X POST http://EC2_IP:8080/api/trade/order \
  -d '{"symbol":"ETHUSDT","side":"BUY",...}'

✓ Metrics Export
curl http://EC2_IP:8080/api/admin/metrics

✓ Container Health
docker ps | grep mexc-sniper-blue | grep healthy
```

## Performance Baseline

Nach erfolgreichem Deployment sollten folgende Latencies erreicht werden:

```
Health Check:        < 5ms   (< 10ms)
Market Ticker:       < 20ms  (< 30ms)
Account Balance:     < 25ms  (< 40ms)
Order Creation:      < 50ms  (< 100ms)
DynamoDB Query:      < 10ms  (< 20ms)
```

(Werte in Klammern = akzeptabel für 99.9% uptime)

## Nächste Schritte

1. ✅ **Local Development**: `make run-dev` funktioniert
2. ✅ **Docker**: `make docker-run` funktioniert
3. ✅ **EC2 Deployment**: Manuell getestet
4. ⬜ **CI/CD Automation**: GitHub Actions triggert
5. ⬜ **Load Testing**: k6 Performance Tests
6. ⬜ **Monitoring**: CloudWatch Dashboards
7. ⬜ **Production Ready**: Alle Tests grün

## Dokumentation

- [README.md](README.md) - Development Guide
- [RUST_MIGRATION_SETUP.md](../RUST_MIGRATION_SETUP.md) - Infrastructure Setup
- [RUST_DEPLOYMENT_GUIDE.md](../RUST_DEPLOYMENT_GUIDE.md) - Deployment & Operations

## Support

Bei Fragen oder Problemen:

1. Check Logs: `docker logs -f mexc-sniper-blue`
2. Check Status: `curl http://localhost:8080/health`
3. Read Docs: `RUST_MIGRATION_SETUP.md`, `RUST_DEPLOYMENT_GUIDE.md`
4. Review Code: `backend-rust/src/main.rs`

---

**Estimated Time to Production**: 2-4 hours (first time) → 30 minutes (subsequent)
