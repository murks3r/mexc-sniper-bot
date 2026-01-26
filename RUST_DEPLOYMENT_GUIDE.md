# DEPLOYMENT GUIDE - Rust Backend auf AWS EC2

## Übersicht

Dieser Guide erklärt wie man den Rust Backend automatisch auf AWS EC2 deployed. Das System nutzt Blue-Green Deployment für Zero Downtime Updates.

## Automatisches Deployment (GitHub Actions)

### Trigger Optionen

Das Deployment wird automatisch triggered bei:
1. **Push zu `main` Branch** - In `backend-rust/` Verzeichnis
2. **Manuell via GitHub Actions UI**
   - Repository → Actions → "Deploy Rust Backend to AWS EC2" → Run workflow

### Deployment Ablauf

```
┌─────────────────┐
│  Git Push       │
│  to main        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build Job      │  ◄─── Cargo build --release
│  (20-30 min)    │       Single binary (50-100MB)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Docker Build   │  ◄─── Multi-stage build
│  & ECR Push     │       Alpine image (~50MB)
│  (10 min)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Blue-Green     │  ◄─── SSH zu EC2
│  Deployment     │       Pull image
│  (5 min)        │       Start new container
└────────┬────────┘       Health checks
         │
         ▼
┌─────────────────┐
│  Deployment     │
│  Complete!      │
│  (Total: 45min) │
└─────────────────┘
```

## Manuelle Deployment (SSH)

Falls GitHub Actions nicht verfügbar ist oder Testing nötig:

### 1. Build lokal

```bash
cd backend-rust

# Release Build
cargo build --release --target x86_64-unknown-linux-musl

# Binary ist hier:
ls -lh target/x86_64-unknown-linux-musl/release/mexc-sniper
```

### 2. Docker Image erstellen

```bash
# Build
docker build -t mexc-sniper-rust:latest .

# Teste lokal
docker run -p 8080:8080 \
  -e MEXC_API_KEY=test \
  -e MEXC_SECRET_KEY=test \
  -e JWT_SECRET=test \
  mexc-sniper-rust:latest
```

### 3. Zu ECR pushen

```bash
AWS_ACCOUNT_ID=123456789012
AWS_REGION=ap-southeast-1

# ECR Login
aws ecr get-login-password --region $AWS_REGION | \
docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag & Push
docker tag mexc-sniper-rust:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mexc-sniper-rust:latest

docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mexc-sniper-rust:latest
```

### 4. Auf EC2 deployen

```bash
# SSH in EC2
ssh -i your-key.pem ec2-user@54.179.xxx.xxx

# Alte Container stoppen
docker stop mexc-sniper-blue 2>/dev/null || true

# Rename für Rollback
docker rename mexc-sniper-blue mexc-sniper-green 2>/dev/null || true

# Pull neue Image
docker pull $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mexc-sniper-rust:latest

# Starte neuen Container
docker run -d \
  --name mexc-sniper-blue \
  -p 8080:8080 \
  --restart unless-stopped \
  -e AWS_REGION=ap-southeast-1 \
  -e DYNAMODB_TABLE=mexc_trading_data \
  -e MEXC_API_KEY=$MEXC_API_KEY \
  -e MEXC_SECRET_KEY=$MEXC_SECRET_KEY \
  -e JWT_SECRET=$JWT_SECRET \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mexc-sniper-rust:latest

# Warte auf Health Check
sleep 10
docker logs mexc-sniper-blue

# Prüfe Health
curl http://localhost:8080/health
```

## Blue-Green Deployment Details

### Was ist Blue-Green Deployment?

```
Vorher:
┌─────────────────────┐
│ Container (v1)      │  ◄─── Production
│ Port: 8080          │
└─────────────────────┘

Deployment:
┌─────────────────────┐
│ Container v1 (blue) │  ◄─── Production
│ Port: 8080          │       (läuft noch)
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Container v2 (green)│  ◄─── Neue Version
│ (startup, tests)    │       (parallel)
└─────────────────────┘

Nach erfolgreichem Health Check:
┌─────────────────────┐
│ Container v2 (blue) │  ◄─── Production
│ Port: 8080          │       (neu aktualisiert)
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Container v1 (green)│  ◄─── Backup
│ (stopped)           │       (für Rollback)
└─────────────────────┘
```

### Health Check Anforderungen

Das Deployment wartet auf folgende Health Checks:

```bash
# 1. Container muss starten
docker ps | grep mexc-sniper-blue

# 2. HTTP /health muss 200 zurückgeben
curl http://localhost:8080/health
# Response: {"status":"healthy","timestamp":"2024-01-24T..."}

# 3. HTTP /ready muss 200 zurückgeben
curl http://localhost:8080/api/admin/ready
# Response: {"ready":true,"version":"2.0.0"}

# 4. Datenbankverbindung muss funktionieren
curl http://localhost:8080/api/market/balance
# Response: {"balances":[...]}
```

## Monitoring nach Deployment

### Logs ansehen

```bash
# Letzten 50 Zeilen
docker logs -n 50 mexc-sniper-blue

# Follow logs (live)
docker logs -f mexc-sniper-blue

# Mit Timestamps
docker logs --timestamps mexc-sniper-blue
```

### Metrics exportieren

```bash
# Prometheus Metrics (später implementiert)
curl http://localhost:8080/api/admin/metrics

# CloudWatch Custom Metrics
aws cloudwatch get-metric-statistics \
  --namespace MexcSniper \
  --metric-name OrderLatency \
  --start-time 2024-01-24T00:00:00Z \
  --end-time 2024-01-24T23:59:59Z \
  --period 300 \
  --statistics Average,Maximum
```

### Performance Baselines

Nach Deployment sollten folgende Metriken eingehalten werden:

| Metrik | Ziel | Warnung | Kritisch |
|--------|------|---------|----------|
| API Response Time | < 15ms | > 20ms | > 50ms |
| MEXC Order Latency | < 50ms | > 75ms | > 100ms |
| Error Rate | 0% | > 1% | > 5% |
| DynamoDB Latency | < 5ms | > 10ms | > 20ms |
| Uptime | 99.9% | < 99.5% | < 99% |

## Rollback-Szenarien

### Automatischer Rollback (CI/CD)

Wenn Health Checks fehlschlagen:

```bash
# Deployment Pipeline erkennt Fehler
# und führt automatisch aus:

docker stop mexc-sniper-blue
docker rename mexc-sniper-green mexc-sniper-blue
docker start mexc-sniper-blue

# System läuft wieder mit vorheriger Version
```

### Manueller Rollback

```bash
# SSH zu EC2
ssh -i your-key.pem ec2-user@54.179.xxx.xxx

# Status prüfen
docker ps -a | grep mexc-sniper

# Falls Blue fehlerhaft ist:
docker stop mexc-sniper-blue
docker rename mexc-sniper-green mexc-sniper-blue
docker start mexc-sniper-blue

# Verify
curl http://localhost:8080/health
docker logs mexc-sniper-blue
```

## Häufige Deployment Fehler

### 1. Container startet nicht

```bash
# Logs prüfen
docker logs mexc-sniper-blue

# Mögliche Ursachen:
# - AWS Credentials fehlen
# - DynamoDB nicht erreichbar
# - Port 8080 schon belegt

# Lösung:
docker inspect mexc-sniper-blue | grep -A 20 '"Env"'
```

### 2. Health Check schlägt fehl

```bash
# Curl direkt zum Container
docker exec mexc-sniper-blue curl http://localhost:8080/health

# Mögliche Ursachen:
# - Application startup zu langsam
# - Abhängigkeiten nicht verfügbar
# - Port nicht gebunden

# Lösung: Erhöhe Timeout in deploy.yml (default: 60s)
```

### 3. DynamoDB Verbindung fehlgeschlagen

```bash
# Prüfe IAM Role
aws iam get-role --role-name mexc-sniper-ec2-role

# Prüfe Tabelle existiert
aws dynamodb describe-table --table-name mexc_trading_data

# Prüfe EC2 Instance hat Role zugewiesen
aws ec2 describe-instances \
  --instance-ids i-xxxxxxxx \
  --query 'Reservations[0].Instances[0].IamInstanceProfile'
```

### 4. ECR Image zu groß

```bash
# Check Docker image size
docker images mexc-sniper-rust

# Erwartet: ~50-100MB (mit Alpine base)
# Wenn größer: Prüfe Dockerfile multi-stage build

# Cleanup alte images
docker image prune -a
```

## Performance Optimization nach Deployment

### 1. Connection Pooling

```rust
// Backend-rust/src/mexc/client.rs
let client = reqwest::Client::builder()
    .pool_max_idle_per_host(20)      // Erhöhe pool size
    .connect_timeout(Duration::from_secs(10))
    .build()?;
```

### 2. DynamoDB Batch Requests

```rust
// Nutze BatchGetItem statt einzelne GetItem calls
store.batch_get_orders(order_ids).await?
```

### 3. Caching Layer

```rust
// Frontend → Rust Cache → DynamoDB
// Reduziert DynamoDB Read Capacity
```

## Disaster Recovery

### Tägliches Backup

```bash
# DynamoDB Point-in-Time Recovery
# (Konfiguriert via terraform/CloudFormation)

# Exportiere DynamoDB zu S3 (täglich)
aws dynamodb export-table-to-point-in-time \
  --table-arn arn:aws:dynamodb:ap-southeast-1:ACCOUNT:table/mexc_trading_data \
  --s3-bucket mexc-sniper-backups \
  --s3-prefix backups/daily/
```

### Recovery Plan

Falls EC2 ausfällt:

1. Neue EC2 Instance vom gleichen AMI starten
2. IAM Role zuweisen
3. DynamoDB Daten sind noch da (persistent)
4. Docker Container mit neuestem Image ziehen
5. Deployment Workflow erneut triggern

## Nächste Schritte

Nach erfolgreichem Deployment:

1. ✓ Frontend API URL aktualisieren
2. ✓ Load Tests durchführen (k6/locust)
3. ✓ Monitoring Alerts konfigurieren
4. ✓ Runbooks für Common Issues erstellen
5. ✓ Team Training durchführen
