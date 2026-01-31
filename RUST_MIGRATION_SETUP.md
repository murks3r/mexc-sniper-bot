# INFRASTRUKTUR-SETUP ANLEITUNG

## PHASE 1: AWS Infrastruktur Vorbereitung

### 1.1 IAM Role für EC2 erstellen

```bash
# Erstelle Policy Document
cat > /tmp/ec2-dynamodb-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DeleteItem",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/mexc_trading_data*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:ap-southeast-1:*:secret:mexc/*"
    }
  ]
}
EOF

# Erstelle IAM Policy
aws iam create-policy \
  --policy-name mexc-sniper-dynamodb-access \
  --policy-document file:///tmp/ec2-dynamodb-policy.json

# Erstelle IAM Role
aws iam create-role \
  --role-name mexc-sniper-ec2-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "ec2.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }
    ]
  }'

# Attach Policy zu Role
aws iam attach-role-policy \
  --role-name mexc-sniper-ec2-role \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/mexc-sniper-dynamodb-access

# Erstelle Instance Profile
aws iam create-instance-profile \
  --instance-profile-name mexc-sniper-instance-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name mexc-sniper-instance-profile \
  --role-name mexc-sniper-ec2-role

# Attach zu EC2 Instance (die bereits existiert)
INSTANCE_ID="i-xxxxxxxx"  # Deine EC2 Instance ID
aws ec2 associate-iam-instance-profile \
  --instance-id $INSTANCE_ID \
  --iam-instance-profile Name=mexc-sniper-instance-profile \
  --region ap-southeast-1
```

### 1.2 DynamoDB Tabelle erstellen

```bash
# Führe Setup Script aus
bash scripts/setup-dynamodb.sh
```

### 1.3 Security Group konfigurieren

```bash
# Port 8080 für Rust API öffnen
SECURITY_GROUP_ID="sg-xxxxxxxx"  # Deine SG ID

aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0 \
  --region ap-southeast-1

# Optional: Inbound HTTPS für Frontend
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region ap-southeast-1
```

### 1.4 AWS Secrets Manager Setup (optional aber empfohlen)

```bash
# Speichere MEXC Credentials
aws secretsmanager create-secret \
  --name mexc/api-key \
  --secret-string "YOUR_MEXC_API_KEY" \
  --region ap-southeast-1

aws secretsmanager create-secret \
  --name mexc/secret-key \
  --secret-string "YOUR_MEXC_SECRET_KEY" \
  --region ap-southeast-1

aws secretsmanager create-secret \
  --name mexc/jwt-secret \
  --secret-string "$(openssl rand -base64 32)" \
  --region ap-southeast-1
```

## PHASE 2: GitHub Actions Secrets konfigurieren

```bash
# Gehe zu: Repository → Settings → Secrets and variables → Actions

# Erstelle folgende Secrets:
AWS_ACCOUNT_ID = "123456789012"
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
AWS_EC2_IP = "54.179.xxx.xxx"  # Deine Elastic IP
AWS_SSH_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\n..."
MEXC_API_KEY = "your_mexc_api_key"
MEXC_SECRET_KEY = "your_mexc_secret_key"
JWT_SECRET = "your_jwt_secret"
```

## PHASE 3: EC2 Instance Vorbereitung

```bash
# SSH in EC2 Instance
ssh -i your-key.pem ec2-user@54.179.xxx.xxx

# Update System
sudo yum update -y
sudo yum install -y docker git

# Docker Service starten
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Logout und wieder einloggen damit Gruppe aktiv ist
exit
ssh -i your-key.pem ec2-user@54.179.xxx.xxx

# Docker Compose installieren
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify Installation
docker --version
docker-compose --version

# ECR Login konfigurieren
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com
```

## PHASE 4: Blue-Green Deployment Setup

```bash
# Erstelle Deployment Directories
mkdir -p ~/mexc-sniper/{blue,green}
cd ~/mexc-sniper

# Erstelle Docker Compose File
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  mexc-sniper-blue:
    image: ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
    container_name: mexc-sniper-blue
    ports:
      - "8080:8080"
    environment:
      - AWS_REGION=ap-southeast-1
      - DYNAMODB_TABLE=mexc_trading_data
      - MEXC_API_KEY=${MEXC_API_KEY}
      - MEXC_SECRET_KEY=${MEXC_SECRET_KEY}
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3

networks:
  default:
    driver: bridge
EOF

# Environment File erstellen
cat > .env << 'EOF'
MEXC_API_KEY=your_key
MEXC_SECRET_KEY=your_secret
JWT_SECRET=your_jwt_secret
EOF

# Initial Container starten
docker-compose up -d mexc-sniper-blue

# Verify
docker-compose ps
curl http://localhost:8080/health
```

## PHASE 5: Monitoring Setup

```bash
# CloudWatch Log Group erstellen
aws logs create-log-group \
  --log-group-name /mexc-sniper-bot/rust \
  --region ap-southeast-1

# Log Retention Policy (7 Tage)
aws logs put-retention-policy \
  --log-group-name /mexc-sniper-bot/rust \
  --retention-in-days 7 \
  --region ap-southeast-1

# CloudWatch Alarm für High Latency
aws cloudwatch put-metric-alarm \
  --alarm-name mexc-sniper-high-latency \
  --alarm-description "Alert when order latency > 100ms" \
  --metric-name OrderLatencyMs \
  --namespace MexcSniper \
  --statistic Average \
  --period 60 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold \
  --region ap-southeast-1
```

## PHASE 6: MEXC API Whitelisting

1. Gehe zu MEXC Dashboard: https://www.mexc.com/user/api/management
2. Klicke auf deine API Key
3. Unter "IP Whitelist": Füge hinzu
   - Deine EC2 Elastic IP: `54.179.xxx.xxx`
   - Optional: Deine lokale IP für Testing: `YOUR_LOCAL_IP/32`
4. Speichere Änderungen

## PHASE 7: Data Migration durchführen (wenn nötig)

```bash
# Von EC2 aus:
cd ~/mexc-sniper

# Environment für Migration setzen
export PG_HOST=your_postgres_host
export PG_PORT=5432
export PG_DATABASE=mexc_trading
export PG_USER=postgres
export PG_PASSWORD=your_password

# Migration durchführen
npx ts-node scripts/migrate-to-dynamodb.ts

# Validiere Migration
echo "Prüfe Order Count..."
aws dynamodb query \
  --table-name mexc_trading_data \
  --key-condition-expression "user_id = :uid" \
  --expression-attribute-values "{\":uid\":{\"S\":\"test-user\"}}" \
  --region ap-southeast-1 | jq '.Items | length'
```

## PHASE 8: Production Health Check

```bash
# Teste alle Health Endpoints
for endpoint in health ready metrics; do
  echo "Testing /$endpoint..."
  curl -s http://54.179.xxx.xxx:8080/api/admin/$endpoint | jq .
done

# Teste API Endpoints
echo "Testing market ticker..."
curl -s "http://54.179.xxx.xxx:8080/api/market/ticker/ETHUSDT" | jq .

echo "Testing account balance..."
curl -s "http://54.179.xxx.xxx:8080/api/market/balance" | jq .
```

## FASE 9: Next.js Frontend anpassen

```typescript
// app/env.ts oder config
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://54.179.xxx.xxx:8080'

// API Calls nun zu Rust Backend umleiten
const response = await fetch(`${API_URL}/api/trade/order`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(orderData)
})
```

## Troubleshooting

### Container startet nicht
```bash
docker logs mexc-sniper-blue
```

### Connection zu DynamoDB fehlgeschlagen
```bash
# Prüfe IAM Role
aws iam get-role --role-name mexc-sniper-ec2-role

# Prüfe Credentials im Container
docker exec mexc-sniper-blue env | grep AWS
```

### Port 8080 nicht erreichbar
```bash
# Prüfe Security Group
aws ec2 describe-security-groups --group-ids sg-xxxxxxxx

# Prüfe ob Container läuft
docker ps | grep mexc-sniper
```

## Rollback-Strategie

```bash
# Falls etwas fehlschlägt, zum vorherigen Container zurück:
docker rename mexc-sniper-blue mexc-sniper-failed
docker rename mexc-sniper-green mexc-sniper-blue
docker start mexc-sniper-blue

# Alte Container aufräumen
docker remove mexc-sniper-failed mexc-sniper-green 2>/dev/null
```
