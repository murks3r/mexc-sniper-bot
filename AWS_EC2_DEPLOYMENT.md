# 🚀 AWS EC2 Deployment - Vollständige Anleitung

**Stand:** 2026-01-30  
**Für:** murks3r  
**Plattform:** AWS EC2 (ap-southeast-1)  

---

## 📋 Übersicht

Diese Anleitung führt Sie durch den **vollständigen Deployment-Prozess** des MEXC Sniper Bot Rust Backends auf AWS EC2 mit automatischer CI/CD Pipeline via GitHub Actions.

**Deployment-Architektur:**
- **Backend:** Rust-basierte API auf AWS EC2 (Singapore Region)
- **Container Registry:** AWS ECR (Elastic Container Registry)
- **Deployment-Strategie:** Blue-Green Deployment mit Docker
- **CI/CD:** GitHub Actions automatisiert Build & Deploy

---

## ✅ Voraussetzungen

### 1. AWS Account & Ressourcen

- **AWS Account** mit Admin-Zugriff
- **EC2 Instanz** in ap-southeast-1 (Singapore)
  - Empfohlene Instance: t3.medium oder besser
  - OS: Amazon Linux 2 oder Ubuntu 20.04+
  - Security Group: Port 8080 offen für API-Zugriff
  - Security Group: Port 22 offen für SSH (Ihre IP nur)

### 2. Lokale Tools

```bash
# AWS CLI installieren
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# GitHub CLI (optional, aber empfohlen)
# Siehe: https://cli.github.com/

# Docker (für lokale Tests)
sudo apt-get update
sudo apt-get install docker.io
sudo systemctl start docker
sudo usermod -aG docker $USER
```

### 3. GitHub Secrets konfigurieren

Gehen Sie zu: `https://github.com/murks3r/mexc-sniper-bot/settings/secrets/actions`

Fügen Sie folgende Secrets hinzu:

| Secret Name | Beschreibung | Wo finden? |
|------------|--------------|------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key ID | AWS IAM Console → Users → Security Credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Access Key | AWS IAM Console (beim Erstellen angezeigt) |
| `AWS_ACCOUNT_ID` | Ihre AWS Account Nummer | AWS Console → Rechts oben Profil Dropdown |
| `AWS_EC2_IP` | Public IP der EC2 Instanz | AWS EC2 Console → Instances |
| `AWS_SSH_PRIVATE_KEY` | SSH Private Key für EC2 | Lokale Datei `~/.ssh/id_rsa` |
| `MEXC_API_KEY` | MEXC Exchange API Key | MEXC → API Management |
| `MEXC_SECRET_KEY` | MEXC Exchange Secret Key | MEXC → API Management |
| `JWT_SECRET` | JWT Signing Secret (32+ Zeichen) | Generieren: `openssl rand -hex 32` |

---

## 🛠️ AWS Setup (Einmalig)

### Schritt 1: EC2 Instanz erstellen

```bash
# Via AWS CLI (oder nutzen Sie die AWS Console)
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \  # Amazon Linux 2 AMI in ap-southeast-1
  --instance-type t3.medium \
  --key-name YOUR_KEY_NAME \
  --security-group-ids sg-YOUR_SG_ID \
  --subnet-id subnet-YOUR_SUBNET_ID \
  --region ap-southeast-1 \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=mexc-sniper-bot}]'
```

**Oder via AWS Console:**
1. Gehen Sie zu EC2 Dashboard
2. Launch Instance
3. Wählen Sie: Amazon Linux 2 AMI
4. Instance Type: t3.medium
5. Configure Security Group:
   - Port 22: Ihre IP
   - Port 8080: 0.0.0.0/0 (oder spezifische IPs)
6. Tag: Name = mexc-sniper-bot
7. Launch & Download Key Pair

### Schritt 2: EC2 für Docker vorbereiten

SSH in Ihre EC2 Instanz:

```bash
ssh -i ~/.ssh/YOUR_KEY.pem ec2-user@YOUR_EC2_IP
```

Docker installieren und konfigurieren:

```bash
# Update System
sudo yum update -y

# Docker installieren
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# AWS CLI installieren (falls nicht vorhanden)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Logout und wieder einloggen für Docker-Gruppen-Rechte
exit
ssh -i ~/.ssh/YOUR_KEY.pem ec2-user@YOUR_EC2_IP

# Testen
docker --version
aws --version
```

### Schritt 3: IAM Rolle für ECR erstellen

**Via AWS Console:**
1. IAM → Policies → Create Policy
2. Service: ECR
3. Actions: All ECR actions (ecr:*)
4. Resources: All
5. Name: ECR-Full-Access

**Via AWS CLI:**

```bash
# Policy erstellen
cat > ecr-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name ECR-Full-Access \
  --policy-document file://ecr-policy.json \
  --region ap-southeast-1

# Role für EC2 erstellen
aws iam create-role \
  --role-name EC2-ECR-Role \
  --assume-role-policy-document file://ec2-trust-policy.json

# Policy an Role anhängen
aws iam attach-role-policy \
  --role-name EC2-ECR-Role \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/ECR-Full-Access

# Instance Profile erstellen und zuweisen
aws iam create-instance-profile --instance-profile-name EC2-ECR-Profile
aws iam add-role-to-instance-profile \
  --instance-profile-name EC2-ECR-Profile \
  --role-name EC2-ECR-Role

# An EC2 Instanz anhängen
aws ec2 associate-iam-instance-profile \
  --instance-id i-YOUR_INSTANCE_ID \
  --iam-instance-profile Name=EC2-ECR-Profile \
  --region ap-southeast-1
```

### Schritt 4: ECR Repository erstellen

```bash
aws ecr create-repository \
  --repository-name mexc-sniper-rust \
  --region ap-southeast-1 \
  --image-scanning-configuration scanOnPush=true
```

**Notieren Sie die `repositoryUri` aus der Ausgabe!**

---

## 🚀 Deployment via GitHub Actions

### Automatischer Deploy bei Push zu main

Der Deployment-Prozess startet **automatisch**, wenn Sie Code zu `main` pushen, der `backend-rust/**` Dateien ändert.

**Workflow-Übersicht:**

```
Push to main → Build Rust → Docker Image → Push to ECR → Deploy to EC2
```

### Manueller Deploy

```bash
# Via GitHub CLI
gh workflow run deploy-rust.yml --ref main

# Oder via GitHub Web UI
# https://github.com/murks3r/mexc-sniper-bot/actions/workflows/deploy-rust.yml
# → "Run workflow"
```

### Deployment überwachen

```bash
# Status prüfen
gh run list --workflow=deploy-rust.yml --branch=main

# Logs ansehen
gh run view --log

# Oder im Browser:
# https://github.com/murks3r/mexc-sniper-bot/actions
```

---

## 🧪 Lokaler Test vor Deployment

Bevor Sie zu `main` pushen, testen Sie lokal:

### Schritt 1: Rust Backend lokal bauen

```bash
cd backend-rust

# Dependencies installieren und bauen
cargo build --release

# Tests ausführen
cargo test

# Code checken
cargo check
cargo clippy
```

### Schritt 2: Docker Image lokal bauen

```bash
# Im backend-rust Verzeichnis
docker build -t mexc-sniper-rust:local .

# Testen
docker run -p 8080:8080 \
  -e AWS_REGION=ap-southeast-1 \
  -e RUST_LOG=info \
  -e MEXC_API_KEY=your_test_key \
  -e MEXC_SECRET_KEY=your_test_secret \
  mexc-sniper-rust:local

# In anderem Terminal testen:
curl http://localhost:8080/health
```

### Schritt 3: Zu main pushen

```bash
git add .
git commit -m "feat: update rust backend"
git push origin main

# Deployment startet automatisch!
```

---

## 🔍 Nach dem Deployment

### Health Checks

```bash
# Ersetzen Sie YOUR_EC2_IP mit Ihrer tatsächlichen IP
EC2_IP="YOUR_EC2_IP"

# Basic Health Check
curl http://$EC2_IP:8080/health

# Ready Check
curl http://$EC2_IP:8080/ready

# Mit formatierter Ausgabe
curl -s http://$EC2_IP:8080/health | jq .
```

**Erwartete Ausgabe:**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "2026-01-30T22:00:00Z"
}
```

### Container-Status prüfen

SSH in EC2 und prüfen:

```bash
ssh -i ~/.ssh/YOUR_KEY.pem ec2-user@YOUR_EC2_IP

# Laufende Container
docker ps

# Sollte zeigen:
# CONTAINER ID   IMAGE                              STATUS         PORTS                    NAMES
# abc123...      xxx.dkr.ecr.../mexc-sniper-rust   Up 2 minutes   0.0.0.0:8080->8080/tcp   mexc-sniper-blue

# Logs ansehen
docker logs mexc-sniper-blue

# Live Logs folgen
docker logs -f mexc-sniper-blue

# Container Stats
docker stats mexc-sniper-blue
```

### API Endpoints testen

```bash
# Ticker-Daten abrufen
curl "http://$EC2_IP:8080/api/ticker?symbol=BTCUSDT"

# Order erstellen (benötigt Auth)
curl -X POST "http://$EC2_IP:8080/api/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "symbol": "BTCUSDT",
    "side": "BUY",
    "order_type": "LIMIT",
    "quantity": 0.001,
    "price": 45000
  }'

# Metrics abrufen
curl http://$EC2_IP:8080/metrics
```

---

## 🔄 Blue-Green Deployment

Das System nutzt Blue-Green Deployment für Zero-Downtime Updates:

### Wie es funktioniert:

1. **Aktueller Container:** `mexc-sniper-blue` (läuft auf Port 8080)
2. **Neuer Deploy:** 
   - Neues Image wird gepullt
   - Alter Blue Container → wird zu `mexc-sniper-green`
   - Neuer Container startet als `mexc-sniper-blue`
3. **Health Check:** 60 Sekunden Wartezeit
4. **Erfolg:** Grüner Container wird gestoppt
5. **Fehler:** Automatisches Rollback zu Green

### Manuelles Rollback

Falls etwas schiefgeht:

```bash
# SSH in EC2
ssh -i ~/.ssh/YOUR_KEY.pem ec2-user@YOUR_EC2_IP

# Rollback Script
docker stop mexc-sniper-blue 2>/dev/null || true
docker rm mexc-sniper-blue 2>/dev/null || true

if docker ps -a --format '{{.Names}}' | grep -q '^mexc-sniper-green$'; then
  docker rename mexc-sniper-green mexc-sniper-blue
  docker start mexc-sniper-blue
  echo "Rollback completed!"
fi

# Container Logs prüfen
docker logs mexc-sniper-blue
```

---

## 🐛 Troubleshooting

### Problem: Deployment schlägt fehl mit "ECR login failed"

**Lösung:**
```bash
# IAM Rolle prüfen
aws sts get-caller-identity --region ap-southeast-1

# Manuell in ECR einloggen
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com
```

### Problem: Container startet nicht

**Lösung:**
```bash
# Logs prüfen
docker logs mexc-sniper-blue

# Häufige Ursachen:
# - Fehlende Umgebungsvariablen
# - Port 8080 bereits belegt
# - Image wurde nicht korrekt gebaut

# Port-Nutzung prüfen
sudo netstat -tlnp | grep 8080

# Umgebungsvariablen prüfen
docker inspect mexc-sniper-blue | grep -A 20 Env
```

### Problem: Health Check fehlgeschlagen

**Lösung:**
```bash
# Direkt auf Container testen
docker exec mexc-sniper-blue wget -O- http://localhost:8080/health

# Firewall prüfen
sudo iptables -L -n

# Security Group prüfen (AWS Console)
# Port 8080 muss offen sein!
```

### Problem: "Permission denied" beim SSH

**Lösung:**
```bash
# Key-Rechte korrigieren
chmod 600 ~/.ssh/YOUR_KEY.pem

# Richtigen User verwenden
# Amazon Linux: ec2-user
# Ubuntu: ubuntu

ssh -i ~/.ssh/YOUR_KEY.pem ec2-user@YOUR_EC2_IP
```

### Problem: Out of Memory

**Lösung:**
```bash
# Memory-Nutzung prüfen
free -h
docker stats

# Swap aktivieren (falls nötig)
sudo dd if=/dev/zero of=/swapfile bs=1G count=2
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Oder größere Instance verwenden (t3.large)
```

---

## 📊 Monitoring & Logs

### CloudWatch Logs (Optional)

Setup CloudWatch Agent auf EC2:

```bash
sudo yum install -y amazon-cloudwatch-agent

# Config erstellen
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard

# Agent starten
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
```

### Prometheus Metrics

Der Rust Backend exposiert Prometheus Metrics auf `/metrics`:

```bash
# Metrics abrufen
curl http://YOUR_EC2_IP:8080/metrics

# Mit Prometheus Server verbinden
# Fügen Sie in prometheus.yml hinzu:
#
# scrape_configs:
#   - job_name: 'mexc-sniper'
#     static_configs:
#       - targets: ['YOUR_EC2_IP:8080']
```

### Log Rotation

```bash
# Docker logs automatisch rotieren
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

sudo systemctl restart docker
```

---

## 🔐 Security Best Practices

### 1. Secrets Management

✅ **JA:**
- Secrets in GitHub Secrets speichern
- Umgebungsvariablen zur Laufzeit injizieren
- AWS Secrets Manager für produktive Secrets

❌ **NEIN:**
- Secrets in Code committen
- Secrets in Dockerfiles hardcoden
- Secrets in Logs ausgeben

### 2. Network Security

```bash
# Minimale Security Group Rules:
- Port 22 (SSH): Nur Ihre IP
- Port 8080 (API): Nur notwendige IPs oder ALB
- Alle anderen Ports: DENY
```

### 3. EC2 Hardening

```bash
# System Updates automatisieren
sudo yum update -y
sudo yum install -y yum-cron
sudo systemctl enable yum-cron
sudo systemctl start yum-cron

# Fail2ban installieren (SSH Protection)
sudo yum install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 4. Docker Security

```bash
# Scan Docker Images für Vulnerabilities
docker scan mexc-sniper-rust:latest

# Oder mit Trivy
trivy image mexc-sniper-rust:latest
```

---

## 📚 Weitere Ressourcen

### Dokumentation

- [Rust Deployment Guide](RUST_DEPLOYMENT_GUIDE.md) - Detaillierte Rust-Spezifische Anleitung
- [README](README.md) - Projekt-Übersicht
- [GitHub Actions Workflows](.github/workflows/) - CI/CD Konfiguration

### AWS Ressourcen

- [AWS EC2 Dokumentation](https://docs.aws.amazon.com/ec2/)
- [AWS ECR Dokumentation](https://docs.aws.amazon.com/ecr/)
- [AWS CLI Referenz](https://docs.aws.amazon.com/cli/)

### Tools

- [GitHub CLI](https://cli.github.com/)
- [Docker Dokumentation](https://docs.docker.com/)
- [Rust Cargo Book](https://doc.rust-lang.org/cargo/)

---

## ✅ Deployment Checklist

Vor dem ersten Deployment:

- [ ] AWS Account erstellt
- [ ] EC2 Instanz läuft (t3.medium+, Port 8080 offen)
- [ ] ECR Repository erstellt
- [ ] IAM Rolle für EC2 konfiguriert
- [ ] Alle GitHub Secrets konfiguriert
- [ ] SSH Key funktioniert
- [ ] Docker auf EC2 installiert
- [ ] Lokaler Rust-Build erfolgreich
- [ ] Workflow-Datei deploy-rust.yml aktualisiert (actions v4)

Vor jedem Deployment:

- [ ] `cargo check` läuft ohne Fehler
- [ ] `cargo test` alle Tests bestehen
- [ ] Lokaler Docker-Build erfolgreich
- [ ] Changes committed und gepusht
- [ ] Deployment-Workflow gestartet

Nach dem Deployment:

- [ ] Health Check erfolgreich (`/health`)
- [ ] Ready Check erfolgreich (`/ready`)
- [ ] Container läuft (`docker ps`)
- [ ] Logs sehen normal aus
- [ ] API Endpoints funktionieren
- [ ] Metrics verfügbar (`/metrics`)

---

## 🎯 Zusammenfassung

**Deployment-Flow:**

```
1. Code ändern → 2. Zu main pushen → 3. GitHub Actions triggered
                                            ↓
4. Rust Backend bauen → 5. Docker Image erstellen → 6. ECR Push
                                                         ↓
7. EC2 Login → 8. Image pullen → 9. Blue-Green Deploy → 10. Health Check
                                                                ↓
                                                        11. ✅ Live!
```

**Wichtige URLs:**

- API: `http://YOUR_EC2_IP:8080`
- Health: `http://YOUR_EC2_IP:8080/health`
- Metrics: `http://YOUR_EC2_IP:8080/metrics`
- GitHub Actions: `https://github.com/murks3r/mexc-sniper-bot/actions`

**Support:**

Bei Problemen:
1. Prüfen Sie GitHub Actions Logs
2. Prüfen Sie Docker Container Logs
3. Prüfen Sie Health Endpoints
4. Siehe Troubleshooting-Sektion oben

---

**Viel Erfolg mit Ihrem Deployment! 🚀**

Bei weiteren Fragen stehe ich zur Verfügung.
