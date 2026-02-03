# AWS CodeDeploy Einrichtung - Zusammenfassung

## ✅ Was wurde implementiert

Das Continuous-Deployment-Setup mit AWS CodeDeploy wurde vollständig nach der Anleitung von [fastfwd.com](https://www.fastfwd.com/continuous-deployment-github-aws-ec2-using-aws-codedeploy/) eingerichtet.

### Erstellte Dateien

#### 1. CodeDeploy Konfiguration
- **`appspec.yml`** - CodeDeploy Application Specification File
  - Definiert Deployment-Lifecycle
  - Konfiguriert Hook-Scripts
  - Legt Zielverzeichnis fest (`/home/ec2-user/mexc-sniper-bot`)

#### 2. Deployment Lifecycle Scripts (`scripts/deployment/`)
Alle Scripts sind ausführbar (`chmod +x`) und dokumentiert:

- **`before_install.sh`** - System-Vorbereitung
  - System-Updates
  - Installation von Docker, Git, AWS CLI
  - Bereinigung alter Deployments

- **`after_install.sh`** - Nach der Installation
  - Script-Berechtigungen setzen
  - Node.js Dependencies installieren
  - File-Ownership konfigurieren

- **`application_stop.sh`** - Anwendung stoppen
  - Stoppt Docker-Container (Next.js + Rust)
  - Bereinigt Docker-Ressourcen
  - Unterstützt Blue-Green Deployment

- **`application_start.sh`** - Anwendung starten
  - ECR Login
  - Docker Image pullen
  - Container starten mit Environment-Variablen
  - Health-Check vorbereiten

- **`validate_service.sh`** - Service validieren
  - 30 Health-Check Versuche
  - Container-Status prüfen
  - `/health` Endpoint validieren
  - Automatischer Rollback bei Fehler

#### 3. GitHub Actions Workflow
- **`.github/workflows/codedeploy.yml`** - Automatischer Deployment-Workflow
  - Triggert bei Push zu `main`
  - Baut Rust Backend
  - Erstellt Deployment-Paket (ZIP)
  - Uploaded zu S3 in Osaka-Region (ap-northeast-3)
  - Erstellt CodeDeploy Deployment
  - Wartet auf erfolgreichen Abschluss
  - Erstellt GitHub Issues bei Erfolg/Fehler

#### 4. Dokumentation (auf Deutsch)
- **`docs/deployment/AWS_CODEDEPLOY_SETUP.md`** - Vollständige Setup-Anleitung
  - Schritt-für-Schritt Einrichtung
  - AWS-Ressourcen Konfiguration
  - IAM-Rollen und Policies
  - Fehlerbehebung
  - Monitoring und Rollback

- **`docs/deployment/CODEDEPLOY_QUICK_START.md`** - Schnellstart-Guide
  - 5-Schritte Quick-Start
  - Checkliste
  - Häufige Probleme
  - Support-Informationen

- **`README.md`** - Aktualisiert mit CodeDeploy Abschnitt

## 🔧 Was du jetzt tun musst

### Schritt 1: S3 Bucket erstellen

**WICHTIG:** Der Bucket MUSS in Region `ap-northeast-3` (Osaka) sein!

```bash
aws s3 mb s3://DEIN-BUCKET-NAME --region ap-northeast-3
```

Empfohlener Name: `mexc-sniper-codedeploy-osaka`

### Schritt 2: CodeDeploy Application erstellen

```bash
aws deploy create-application \
  --application-name mexc-sniper-bot \
  --compute-platform Server \
  --region ap-northeast-3
```

### Schritt 3: EC2-Instanz vorbereiten

Auf deiner EC2-Instanz:

```bash
# CodeDeploy Agent installieren
cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto
sudo service codedeploy-agent start
```

EC2-Instanz taggen:
```bash
aws ec2 create-tags \
  --resources i-DEINE_INSTANCE_ID \
  --tags Key=Name,Value=mexc-sniper-bot \
  --region ap-northeast-3
```

### Schritt 4: Deployment Group erstellen

```bash
aws deploy create-deployment-group \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-production \
  --service-role-arn arn:aws:iam::DEINE_ACCOUNT_ID:role/CodeDeployServiceRole \
  --ec2-tag-filters Key=Name,Value=mexc-sniper-bot,Type=KEY_AND_VALUE \
  --region ap-northeast-3
```

### Schritt 5: GitHub Secrets konfigurieren

Gehe zu: `GitHub Repository → Settings → Secrets and variables → Actions`

Füge diese 3 Secrets hinzu:

| Secret Name | Wert |
|------------|------|
| `CODEDEPLOY_S3_BUCKET` | Dein S3 Bucket Name (z.B. `mexc-sniper-codedeploy-osaka`) |
| `CODEDEPLOY_APPLICATION_NAME` | `mexc-sniper-bot` |
| `CODEDEPLOY_DEPLOYMENT_GROUP` | `mexc-sniper-production` |

## 🎯 Verwendung

Nach der Einrichtung:

1. **Push Code zu main:**
   ```bash
   git add .
   git commit -m "Deploy update"
   git push origin main
   ```

2. **Workflow wird automatisch ausgeführt:**
   - Build Rust Backend
   - Deployment-Paket erstellen
   - Upload zu S3 (Osaka)
   - CodeDeploy Deployment starten
   - Health-Checks durchführen

3. **Status prüfen:**
   - GitHub: `Repository → Actions`
   - AWS: `CodeDeploy Console → Deployments`
   - EC2: `sudo tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log`

## 📋 Checkliste - Vor erstem Deployment

Stelle sicher, dass:

- [ ] S3 Bucket in ap-northeast-3 erstellt ✓
- [ ] CodeDeploy Application erstellt ✓
- [ ] EC2-Instanz mit Tag `Name=mexc-sniper-bot` ✓
- [ ] CodeDeploy Agent auf EC2 läuft ✓
- [ ] Deployment Group erstellt ✓
- [ ] 3 neue GitHub Secrets konfiguriert ✓
- [ ] Bestehende AWS Secrets vorhanden ✓

## 🎓 Nächste Schritte

Nach erfolgreichem Setup kannst du:

1. **Automatischen Rollback aktivieren:**
   ```bash
   aws deploy update-deployment-group \
     --application-name mexc-sniper-bot \
     --current-deployment-group-name mexc-sniper-production \
     --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE \
     --region ap-northeast-3
   ```

2. **CloudWatch Monitoring einrichten** für Deployment-Metriken

3. **Blue-Green Deployment** für Zero-Downtime Updates konfigurieren

4. **S3 Lifecycle-Policy** für automatische Bereinigung alter Deployments

## 📚 Dokumentation

- **Quick Start:** `docs/deployment/CODEDEPLOY_QUICK_START.md`
- **Vollständige Anleitung:** `docs/deployment/AWS_CODEDEPLOY_SETUP.md`
- **Workflow:** `.github/workflows/codedeploy.yml`
- **AppSpec:** `appspec.yml`

## ❓ Fragen?

Falls du Fragen hast zu:
- Bucket-Namen
- Deployment-Group-Namen
- IAM-Rollen
- Oder anderen Setup-Schritten

...dann frage einfach nach! Alle Namen können angepasst werden.

## 🆘 Support

Bei Problemen:
1. Prüfe GitHub Actions Logs
2. Prüfe EC2 CodeDeploy Logs
3. Konsultiere AWS CodeDeploy Console
4. Siehe Fehlerbehebung in `AWS_CODEDEPLOY_SETUP.md`
