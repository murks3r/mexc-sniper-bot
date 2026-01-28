# EC2 Deployment Verification - Quick Start

Diese README beschreibt die neu hinzugefügten Tools zur Überprüfung des EC2 Deployment-Status.

## 🎯 Was wurde hinzugefügt?

### 1. Automatisches Verification Script
**Datei**: `scripts/check-ec2-deployment.sh`

Ein umfassendes Bash-Script, das alle wichtigen Aspekte deines EC2-Deployments überprüft.

### 2. Umfassende Dokumentation
- **`docs/deployment/EC2_DEPLOYMENT_STATUS.md`** - Detaillierte Anleitung für EC2-Deployment-Überprüfung
- **`docs/deployment/DEPLOYMENT.md`** - Allgemeine Deployment-Anleitung

## 🚀 Wie verwende ich das Script?

### Auf EC2-Instanz

```bash
# 1. SSH in deine EC2-Instanz
ssh -i your-key.pem ec2-user@<EC2_IP_ADDRESS>

# 2. Navigiere zum Repository
cd /path/to/mexc-sniper-bot

# 3. Führe das Verification-Script aus
./scripts/check-ec2-deployment.sh
```

### Was wird geprüft?

Das Script überprüft automatisch:

✅ **System-Informationen**
- Hostname, Uptime, Kernel-Version

✅ **Netzwerk & Ports**
- Welche Prozesse lauschen auf welchen Ports (ss -tulpn / netstat -tulpen)
- Spezifische Ports: 22 (SSH), 3000 (Frontend), 8080 (Backend), 80 (HTTP)

✅ **Docker Container**
- Status aller Container
- Spezifisch MEXC Sniper Container
- Container Logs

✅ **Systemressourcen**
- Memory Usage
- Disk Space
- CPU Load

✅ **Anwendungsstatus**
- Node.js/PM2 Prozesse
- Rust Backend Binary
- Nginx Web Server

✅ **Health Checks**
- Backend `/health` endpoint
- Backend `/api/admin/ready` endpoint
- Frontend Erreichbarkeit

✅ **Deployment-Info**
- Anleitung zur Prüfung von GitHub Actions Workflows

## 📊 Beispiel-Output

```
╔═══════════════════════════════════════════════════════════╗
║   MEXC Sniper Bot - EC2 Deployment Verification          ║
║   Prüft Prozesse, Ports und Deployment-Status            ║
╚═══════════════════════════════════════════════════════════╝

========================================
1. SYSTEM-INFORMATIONEN
========================================

ℹ Hostname: ip-10-0-1-100
ℹ Datum: Tue Jan 28 21:00:00 UTC 2026
ℹ Uptime: up 3 days, 4 hours
ℹ Kernel: 6.1.0-1027-aws

========================================
2. NETZWERK-PROZESSE UND PORTS
========================================

✓ Verwende 'ss' für Netzwerk-Analyse
[Liste der aktiven Ports...]

========================================
3. PORT-STATUS (22, 3000, 8080, 80)
========================================

✓ Port 22 (SSH) ist aktiv
✓ Port 3000 (Frontend/Next.js) ist aktiv
✓ Port 8080 (Backend/Rust API) ist aktiv
⚠ Port 80 (HTTP/Nginx) ist NICHT aktiv

[... und so weiter ...]
```

## 🔍 GitHub Actions Deployment-Status prüfen

### Via Web UI
1. Gehe zu: https://github.com/murks3r/mexc-sniper-bot/actions
2. Prüfe diese Workflows:
   - **Deploy Pipeline** (Vercel Frontend)
   - **Deploy Rust Backend to AWS EC2** (EC2 Backend)
3. Stelle sicher, dass der letzte Run erfolgreich war (✓)

### Via GitHub CLI (optional)

```bash
# Authentifizieren
gh auth login

# Letzte Workflow Runs
gh run list --limit 10

# Spezifischer Workflow
gh run list --workflow "deploy-rust.yml" --limit 5

# Details anzeigen
gh run view <RUN_ID>
```

## 🛠️ Automatisches Deployment ist bereits eingerichtet!

Das Repository hat **bereits automatisches Deployment** konfiguriert:

### ✅ Frontend (Vercel)
- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: Push zu `main` Branch
- **Status**: Automatisch aktiviert

### ✅ Backend (AWS EC2)
- **Workflow**: `.github/workflows/deploy-rust.yml`
- **Trigger**: Push zu `main` Branch (bei Änderungen in `backend-rust/`)
- **Deployment-Typ**: Blue-Green Deployment mit Docker
- **Status**: Automatisch aktiviert

**Das bedeutet**: Wenn du Code zu `main` pushst, wird automatisch deployed!

## 📝 Manuelles Deployment (falls nötig)

Falls der automatische Deploy fehlschlägt oder du manuell deployen möchtest:

### Backend (Rust mit Docker)

Siehe ausführliche Anleitung in: [RUST_DEPLOYMENT_GUIDE.md](../../RUST_DEPLOYMENT_GUIDE.md)

Schnellstart:
```bash
# SSH zu EC2
ssh -i your-key.pem ec2-user@<EC2_IP>

# Siehe RUST_DEPLOYMENT_GUIDE.md Abschnitt "Manuelle Deployment (SSH)"
```

### Frontend (Next.js)

```bash
cd /path/to/mexc-sniper-bot

# Dependencies installieren
npm install

# Build
npm run build

# Starten (Production)
npm start

# Oder mit PM2
pm2 start ecosystem.config.js
```

## 🔥 Troubleshooting

### Problem: Backend läuft nicht (Port 8080 inaktiv)

```bash
# Docker Container prüfen
docker ps -a | grep mexc-sniper

# Container starten
docker start mexc-sniper-blue

# Logs prüfen
docker logs mexc-sniper-blue
```

### Problem: Frontend läuft nicht (Port 3000 inaktiv)

```bash
# PM2 Status prüfen
pm2 status

# PM2 starten
pm2 start ecosystem.config.js

# Logs prüfen
pm2 logs
```

## 📚 Weitere Dokumentation

- **[EC2_DEPLOYMENT_STATUS.md](docs/deployment/EC2_DEPLOYMENT_STATUS.md)** - Umfassende EC2-Dokumentation
  - Detaillierte Prüfschritte
  - Troubleshooting-Guides
  - Best Practices
  
- **[DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md)** - Allgemeine Deployment-Dokumentation
  - Vercel Deployment
  - Railway Deployment
  - Umgebungsvariablen
  - Monitoring & Wartung

- **[RUST_DEPLOYMENT_GUIDE.md](RUST_DEPLOYMENT_GUIDE.md)** - Rust Backend Deployment
  - Detaillierter Deployment-Ablauf
  - Blue-Green Deployment
  - Health Checks
  - Rollback-Szenarien

## ✅ Zusammenfassung

**Das hast du jetzt:**

1. ✅ **Automatisches Deployment** via GitHub Actions
   - Frontend → Vercel (bei Push zu `main`)
   - Backend → EC2 (bei Push zu `main` mit `backend-rust/` Änderungen)

2. ✅ **Verification Script** (`scripts/check-ec2-deployment.sh`)
   - Prüft alle wichtigen System-Aspekte
   - Zeigt Port-Status, Docker-Container, Ressourcen
   - Führt Health Checks durch

3. ✅ **Umfassende Dokumentation**
   - Deployment-Guides
   - Troubleshooting-Hilfe
   - Best Practices

**Nächste Schritte:**

1. SSH in deine EC2-Instanz
2. Führe `./scripts/check-ec2-deployment.sh` aus
3. Prüfe GitHub Actions Status unter https://github.com/murks3r/mexc-sniper-bot/actions
4. Wenn Probleme: Siehe Troubleshooting-Guides in der Dokumentation

**Wichtig**: Du musst NICHT mehr manuell deployen, wenn:
- GitHub Secrets konfiguriert sind
- Automatisches Deployment via GitHub Actions funktioniert
- Du pushst einfach zu `main` und es wird automatisch deployed!
