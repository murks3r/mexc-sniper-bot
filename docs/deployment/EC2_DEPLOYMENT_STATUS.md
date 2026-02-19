# EC2 Deployment Status & Verification Guide

## Übersicht

Dieses Dokument beschreibt, wie man den Deployment-Status der MEXC Sniper Bot Anwendung auf einer EC2-Instanz überprüft und verifiziert.

## Quick Check - Deployment Verification Script

### Verwendung

Das automatisierte Verification-Script prüft alle wichtigen Aspekte des Deployments:

```bash
# SSH in EC2 Instanz
ssh -i your-key.pem ec2-user@<EC2_IP_ADDRESS>

# Script herunterladen und ausführen
curl -O https://raw.githubusercontent.com/murks3r/mexc-sniper-bot/main/scripts/check-ec2-deployment.sh
chmod +x check-ec2-deployment.sh
./check-ec2-deployment.sh
```

Oder wenn bereits im Repository:

```bash
cd /pfad/zum/mexc-sniper-bot
./scripts/check-ec2-deployment.sh
```

### Was wird geprüft?

Das Script überprüft:

1. ✅ **System-Informationen** - Hostname, Uptime, Kernel
2. ✅ **Netzwerk-Prozesse** - Welche Prozesse lauschen auf welchen Ports
3. ✅ **Port-Status** - Ports 22 (SSH), 3000 (Frontend), 8080 (Backend), 80 (HTTP)
4. ✅ **Docker Container** - Status aller Container, speziell MEXC Sniper
5. ✅ **Systemressourcen** - Memory, Disk, CPU Load
6. ✅ **Node.js/PM2** - Prozesse und Status
7. ✅ **Rust Backend** - Binary-Status
8. ✅ **Webserver** - Nginx Status
9. ✅ **Health Checks** - API-Endpunkte testen
10. ✅ **Deployment-Info** - Hinweise zu GitHub Actions

## Manuelle Überprüfung

### 1. Laufende Prozesse prüfen

#### Mit ss (empfohlen):

```bash
# Alle listening TCP/UDP Ports mit Prozess-Info
sudo ss -tulpn

# Nur TCP Ports
sudo ss -tlpn

# Nur UDP Ports  
sudo ss -ulpn
```

#### Mit netstat (alternative):

```bash
# Alle listening TCP/UDP Ports
sudo netstat -tulpen

# Nur TCP Ports
sudo netstat -tlpen
```

**Erwartete Ports:**
- **Port 22** - SSH (sshd)
- **Port 3000** - Frontend/Next.js (node oder pm2)
- **Port 8080** - Backend/Rust API (mexc-sniper oder Docker)
- **Port 80** - HTTP Server (nginx, optional)

### 2. Port-Status einzeln prüfen

```bash
# SSH Port
sudo ss -tlpn | grep :22

# Frontend Port
sudo ss -tlpn | grep :3000

# Backend Port  
sudo ss -tlpn | grep :8080

# HTTP Port
sudo ss -tlpn | grep :80
```

### 3. Docker Container Status

```bash
# Alle laufenden Container
docker ps

# Alle Container (auch gestoppte)
docker ps -a

# MEXC Sniper spezifische Container
docker ps --filter "name=mexc-sniper"

# Container Logs (letzte 50 Zeilen)
docker logs --tail 50 mexc-sniper-blue

# Container Logs live verfolgen
docker logs -f mexc-sniper-blue

# Container Resource Usage
docker stats mexc-sniper-blue --no-stream
```

### 4. Systemressourcen

```bash
# Memory Usage
free -h

# Disk Usage
df -h

# CPU Load und Uptime
uptime

# Detaillierte Prozess-Info
top -bn1 | head -20
```

### 5. Health Checks

```bash
# Backend Health Endpoint
curl http://localhost:8080/health

# Backend Ready Endpoint  
curl http://localhost:8080/api/admin/ready

# Backend mit JSON formatting
curl -s http://localhost:8080/health | jq .

# Frontend Check
curl -I http://localhost:3000

# External Check (von außen)
curl -I http://<EC2_PUBLIC_IP>:8080/health
```

### 6. PM2 Prozesse (falls verwendet)

```bash
# PM2 Status aller Prozesse
pm2 status

# PM2 Logs
pm2 logs

# Detaillierte Info zu einem Prozess
pm2 show mexc-frontend

# PM2 Monitoring
pm2 monit
```

### 7. Nginx Status (falls verwendet)

```bash
# Nginx Status
sudo systemctl status nginx

# Nginx Configuration Test
sudo nginx -t

# Nginx Error Logs
sudo tail -f /var/log/nginx/error.log

# Nginx Access Logs
sudo tail -f /var/log/nginx/access.log
```

## GitHub Actions Deployment Status prüfen

### Via Web UI

1. Gehe zu: https://github.com/murks3r/mexc-sniper-bot/actions
2. Prüfe folgende Workflows:
   - **Deploy Pipeline** - Vercel Frontend Deployment
   - **Deploy Rust Backend to AWS EC2** - EC2 Backend Deployment
3. Stelle sicher, dass der letzte Run erfolgreich war (✓ grüner Haken)

### Via GitHub CLI

```bash
# GitHub CLI installieren (falls nicht vorhanden)
# Siehe: https://cli.github.com/

# Authentifizieren
gh auth login

# Letzte Workflow Runs anzeigen
gh run list --limit 10

# Spezifischen Workflow anzeigen
gh run list --workflow "deploy.yml" --limit 5
gh run list --workflow "deploy-rust.yml" --limit 5

# Details eines spezifischen Runs
gh run view <RUN_ID>

# Logs eines Runs anzeigen
gh run view <RUN_ID> --log
```

### Via REST API

```bash
# Letzte Workflow Runs abrufen
curl -H "Authorization: token <GITHUB_TOKEN>" \
  https://api.github.com/repos/murks3r/mexc-sniper-bot/actions/runs

# Mit jq für bessere Lesbarkeit
curl -H "Authorization: token <GITHUB_TOKEN>" \
  https://api.github.com/repos/murks3r/mexc-sniper-bot/actions/runs | jq '.workflow_runs[0]'
```

## Deployment Status Interpretation

### ✅ Alles OK

Wenn folgende Bedingungen erfüllt sind:

- ✓ Port 22 (SSH) ist erreichbar
- ✓ Port 3000 (Frontend) oder Port 80 ist aktiv
- ✓ Port 8080 (Backend) ist aktiv
- ✓ Docker Container `mexc-sniper-blue` läuft
- ✓ Health Check `/health` gibt 200 OK zurück
- ✓ Letzter GitHub Actions Deploy war erfolgreich
- ✓ Systemressourcen sind normal (Memory < 80%, Disk < 80%)

**→ Deployment ist erfolgreich und läuft stabil**

### ⚠️ Teilweise Probleme

Wenn einige dieser Probleme auftreten:

- ⚠ Frontend Port 3000 läuft nicht (aber Backend läuft)
- ⚠ Nginx Port 80 läuft nicht (aber direkter Zugriff funktioniert)
- ⚠ Hohe CPU/Memory Nutzung (> 80%)
- ⚠ Health Check langsam (> 1s Response Zeit)

**→ System läuft, aber es gibt Performance- oder Konfigurationsprobleme**

### ❌ Kritische Probleme

Wenn folgende Probleme auftreten:

- ✗ Port 8080 (Backend) ist nicht aktiv
- ✗ Kein Docker Container läuft
- ✗ Health Check schlägt fehl oder timeout
- ✗ Letzter GitHub Actions Deploy ist fehlgeschlagen
- ✗ Systemressourcen erschöpft (Memory/Disk > 95%)

**→ Deployment ist fehlgeschlagen oder Anwendung ist nicht verfügbar**

## Troubleshooting

### Problem: Backend läuft nicht (Port 8080 inaktiv)

```bash
# 1. Prüfe Docker Container
docker ps -a | grep mexc-sniper

# 2. Wenn Container stopped: Starte neu
docker start mexc-sniper-blue

# 3. Wenn Container fehlt: Führe Deployment aus
# Siehe RUST_DEPLOYMENT_GUIDE.md

# 4. Prüfe Container Logs für Fehler
docker logs mexc-sniper-blue

# 5. Prüfe ob Port blockiert ist
sudo lsof -i :8080
```

### Problem: Frontend läuft nicht (Port 3000 inaktiv)

```bash
# 1. Prüfe PM2 Prozesse
pm2 status

# 2. Wenn gestoppt: Starte neu
pm2 start ecosystem.config.js

# 3. Wenn PM2 nicht verwendet wird: Manuell starten
cd /pfad/zum/projekt
npm install
npm run build
npm start &

# 4. Prüfe Logs
pm2 logs mexc-frontend
# oder
tail -f /var/log/mexc-frontend.log
```

### Problem: GitHub Actions Deploy fehlgeschlagen

```bash
# 1. Prüfe Workflow Logs im GitHub UI
# → https://github.com/murks3r/mexc-sniper-bot/actions

# 2. Häufige Ursachen:
#    - AWS Credentials fehlen/abgelaufen
#    - ECR Repository nicht verfügbar
#    - EC2 Instanz nicht erreichbar
#    - Health Check schlägt fehl

# 3. Manuelles Deployment als Fallback
# Siehe RUST_DEPLOYMENT_GUIDE.md - "Manuelle Deployment (SSH)"
```

### Problem: Health Check schlägt fehl

```bash
# 1. Prüfe ob Backend läuft
curl http://localhost:8080/health

# 2. Prüfe Container Logs
docker logs --tail 100 mexc-sniper-blue

# 3. Prüfe Container ist healthy
docker inspect mexc-sniper-blue | grep -A 10 "Health"

# 4. Teste von Container aus
docker exec mexc-sniper-blue curl http://localhost:8080/health

# 5. Prüfe Abhängigkeiten (DynamoDB, AWS Credentials)
docker exec mexc-sniper-blue env | grep AWS
```

### Problem: Hohe Ressourcennutzung

```bash
# 1. Prüfe Memory
free -h
docker stats --no-stream

# 2. Prüfe Disk
df -h
du -sh /var/lib/docker

# 3. Prüfe CPU
top -bn1 | head -20

# 4. Cleanup wenn nötig
docker system prune -a
# Achtung: Löscht nicht-verwendete Images und Container
```

## Automatisches Deployment

Das Projekt hat **automatisches Deployment** eingerichtet über GitHub Actions:

### Frontend (Vercel)
- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: Push zu `main` Branch
- **Ziel**: Vercel (automatisch)
- **Status**: [Deployment Status prüfen](https://github.com/murks3r/mexc-sniper-bot/actions/workflows/deploy.yml)

### Backend (EC2)
- **Workflow**: `.github/workflows/deploy-rust.yml`
- **Trigger**: Push zu `main` Branch (wenn `backend-rust/` geändert wird)
- **Ziel**: AWS EC2 via SSH
- **Deployment-Typ**: Blue-Green Deployment mit Docker
- **Status**: [Deployment Status prüfen](https://github.com/murks3r/mexc-sniper-bot/actions/workflows/deploy-rust.yml)

### Voraussetzungen für automatisches Deployment

GitHub Secrets müssen konfiguriert sein:

```bash
# Vercel Deployment
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID

# AWS EC2 Deployment
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_ACCOUNT_ID
AWS_EC2_IP
AWS_SSH_PRIVATE_KEY

# Anwendung
MEXC_API_KEY
MEXC_SECRET_KEY
JWT_SECRET
```

## Manuelles Deployment

Falls kein automatisches Deployment eingerichtet ist oder es fehlschlägt:

### Frontend (Next.js)

```bash
cd /pfad/zum/mexc-sniper-bot

# Dependencies installieren
npm install

# Build
npm run build

# Starten
npm start
# oder mit PM2
pm2 start ecosystem.config.js
```

### Backend (Rust mit Docker)

Siehe detaillierte Anleitung in: [RUST_DEPLOYMENT_GUIDE.md](../../RUST_DEPLOYMENT_GUIDE.md)

Schnellstart:

```bash
cd /pfad/zum/mexc-sniper-bot

# Pull neuestes Image von ECR
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com

docker pull <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest

# Starte Container
docker run -d \
  --name mexc-sniper-blue \
  -p 8080:8080 \
  --restart unless-stopped \
  -e AWS_REGION=ap-southeast-1 \
  -e MEXC_API_KEY=$MEXC_API_KEY \
  -e MEXC_SECRET_KEY=$MEXC_SECRET_KEY \
  -e JWT_SECRET=$JWT_SECRET \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
```

## Best Practices

### Regelmäßige Checks

Führe regelmäßig aus:

```bash
# Täglich: Quick Health Check
curl http://localhost:8080/health

# Wöchentlich: Vollständige Verification
./scripts/check-ec2-deployment.sh

# Monatlich: Systemupdates
sudo yum update -y  # Amazon Linux
# oder
sudo apt update && sudo apt upgrade -y  # Ubuntu
```

### Monitoring Setup

Empfohlene Monitoring-Tools:

1. **CloudWatch** - AWS native Metriken
2. **Grafana + Prometheus** - Custom Dashboards
3. **Uptime Robot** - External Health Checks
4. **GitHub Actions** - Deployment Status Notifications

### Backup & Disaster Recovery

```bash
# 1. DynamoDB wird automatisch backed up (Point-in-Time Recovery)

# 2. Docker Images sind in ECR
aws ecr list-images --repository-name mexc-sniper-rust

# 3. Code ist in Git
git log --oneline -5

# 4. EC2 AMI Snapshots erstellen (monatlich)
# Via AWS Console oder CLI
```

## Weitere Ressourcen

- [README.md](../../README.md) - Haupt-Dokumentation
- [RUST_DEPLOYMENT_GUIDE.md](../../RUST_DEPLOYMENT_GUIDE.md) - Rust Backend Deployment
- [GitHub Actions Workflows](../../.github/workflows/) - CI/CD Konfiguration
- [AWS EC2 Console](https://console.aws.amazon.com/ec2/) - EC2 Management
- [Vercel Dashboard](https://vercel.com/dashboard) - Frontend Deployments

## Support

Bei Problemen:

1. Prüfe zuerst mit `./scripts/check-ec2-deployment.sh`
2. Schaue in die Workflow Logs auf GitHub
3. Prüfe Container/PM2 Logs
4. Erstelle ein GitHub Issue mit den Log-Ausgaben
