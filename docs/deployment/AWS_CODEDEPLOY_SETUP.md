# AWS CodeDeploy Continuous Deployment Setup

Dieses Dokument beschreibt die vollständige Einrichtung des Continuous-Deployment-Setups mit AWS CodeDeploy für den MEXC Sniper Bot.

## Übersicht

Das System nutzt AWS CodeDeploy für automatisches Deployment auf EC2-Instanzen. Bei jedem Push zu `main` wird automatisch:
1. Der Rust-Backend kompiliert
2. Ein Deployment-Paket erstellt
3. Das Paket zu S3 (Osaka-Region) hochgeladen
4. Ein CodeDeploy-Deployment auf EC2 ausgelöst
5. Die Anwendung mit Health-Checks validiert

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  Git Push zu main                                           │
│  (Änderungen in backend-rust/, scripts/, appspec.yml)      │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ GitHub Actions     │
    │ - Build Rust       │
    │ - Create ZIP       │
    │ - Upload to S3     │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ S3 Bucket          │
    │ (ap-northeast-3)   │  ← Osaka Region (verpflichtend)
    │ Osaka              │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ AWS CodeDeploy     │
    │ - Create Deploy    │
    │ - Trigger Agent    │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ EC2 Instance       │
    │ - Stop old app     │
    │ - Install files    │
    │ - Start new app    │
    │ - Validate health  │
    └────────────────────┘
```

## Voraussetzungen

### 1. AWS-Ressourcen

✅ **Bereits vorhanden:**
- IAM-Rolle für CodeDeploy
- AWS-Zugangsdaten in GitHub Secrets

🔧 **Noch zu erstellen:**
- S3 Bucket in Region `ap-northeast-3` (Osaka)
- CodeDeploy Application
- CodeDeploy Deployment Group
- EC2-Instanz mit CodeDeploy Agent

### 2. GitHub Secrets

Die folgenden Secrets müssen in GitHub hinterlegt sein:
**Settings > Secrets and variables > Actions > New repository secret**

#### Bestehende AWS Secrets:
- `AWS_ACCESS_KEY_ID` - AWS Access Key
- `AWS_SECRET_ACCESS_KEY` - AWS Secret Access Key
- `AWS_ACCOUNT_ID` - AWS Account ID
- `MEXC_API_KEY` - MEXC API Key
- `MEXC_SECRET_KEY` - MEXC Secret Key
- `JWT_SECRET` - JWT Secret für Authentifizierung

#### Neue CodeDeploy Secrets (hinzufügen):
- `CODEDEPLOY_S3_BUCKET` - Name des S3 Buckets (z.B. `mexc-sniper-codedeploy-osaka`)
- `CODEDEPLOY_APPLICATION_NAME` - Name der CodeDeploy Application (z.B. `mexc-sniper-bot`)
- `CODEDEPLOY_DEPLOYMENT_GROUP` - Name der Deployment Group (z.B. `mexc-sniper-production`)

## Setup-Anleitung

### Schritt 1: S3 Bucket erstellen (Osaka-Region)

```bash
# S3 Bucket in Osaka (ap-northeast-3) erstellen
aws s3 mb s3://mexc-sniper-codedeploy-osaka --region ap-northeast-3

# Bucket-Versionierung aktivieren (empfohlen)
aws s3api put-bucket-versioning \
  --bucket mexc-sniper-codedeploy-osaka \
  --versioning-configuration Status=Enabled \
  --region ap-northeast-3

# Lifecycle-Policy für automatisches Löschen alter Deployments (optional)
aws s3api put-bucket-lifecycle-configuration \
  --bucket mexc-sniper-codedeploy-osaka \
  --lifecycle-configuration file://s3-lifecycle.json \
  --region ap-northeast-3
```

**s3-lifecycle.json** (optional):
```json
{
  "Rules": [
    {
      "Id": "DeleteOldDeployments",
      "Status": "Enabled",
      "Prefix": "mexc-sniper-bot/",
      "Expiration": {
        "Days": 30
      }
    }
  ]
}
```

### Schritt 2: CodeDeploy Application erstellen

```bash
# CodeDeploy Application erstellen
aws deploy create-application \
  --application-name mexc-sniper-bot \
  --compute-platform Server \
  --region ap-northeast-3
```

### Schritt 3: EC2-Instanz vorbereiten

#### 3.1 CodeDeploy Agent installieren

Auf der EC2-Instanz (Amazon Linux 2 oder Ubuntu):

```bash
# Für Amazon Linux 2
sudo yum update -y
sudo yum install -y ruby wget

# Für Ubuntu
# sudo apt update
# sudo apt install -y ruby wget

# CodeDeploy Agent installieren
cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Agent starten
sudo service codedeploy-agent start

# Status prüfen
sudo service codedeploy-agent status
```

#### 3.2 IAM-Rolle der EC2-Instanz zuweisen

Die EC2-Instanz benötigt eine IAM-Rolle mit folgenden Policies:
- `AmazonEC2RoleforAWSCodeDeploy`
- `AmazonS3ReadOnlyAccess` (für den CodeDeploy S3-Bucket)
- `AmazonEC2ContainerRegistryReadOnly` (für ECR)

**Trust Policy für EC2:**
```json
{
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
}
```

EC2-Instanz mit Tag versehen:
```bash
# Tag für CodeDeploy hinzufügen
aws ec2 create-tags \
  --resources i-1234567890abcdef0 \
  --tags Key=Name,Value=mexc-sniper-bot \
  --region ap-northeast-3
```

### Schritt 4: CodeDeploy Deployment Group erstellen

```bash
# IAM-Rolle für CodeDeploy Service
# Diese Rolle muss die Policy "AWSCodeDeployRole" haben

# Deployment Group erstellen
aws deploy create-deployment-group \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-production \
  --service-role-arn arn:aws:iam::YOUR_ACCOUNT_ID:role/CodeDeployServiceRole \
  --ec2-tag-filters Key=Name,Value=mexc-sniper-bot,Type=KEY_AND_VALUE \
  --region ap-northeast-3
```

**Wichtig:** Die IAM Service-Rolle benötigt folgende Trust Policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "codedeploy.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### Schritt 5: GitHub Secrets konfigurieren

Gehe zu GitHub Repository > Settings > Secrets and variables > Actions

Füge folgende neue Secrets hinzu:

1. **CODEDEPLOY_S3_BUCKET**
   ```
   Name: CODEDEPLOY_S3_BUCKET
   Value: mexc-sniper-codedeploy-osaka
   ```

2. **CODEDEPLOY_APPLICATION_NAME**
   ```
   Name: CODEDEPLOY_APPLICATION_NAME
   Value: mexc-sniper-bot
   ```

3. **CODEDEPLOY_DEPLOYMENT_GROUP**
   ```
   Name: CODEDEPLOY_DEPLOYMENT_GROUP
   Value: mexc-sniper-production
   ```

### Schritt 6: Deployment testen

```bash
# Code ändern und pushen
git add .
git commit -m "Test CodeDeploy deployment"
git push origin main

# Workflow startet automatisch
# Prüfen unter: https://github.com/YOUR_USERNAME/mexc-sniper-bot/actions
```

## Deployment-Ablauf

### Lifecycle-Events

Das CodeDeploy-Deployment durchläuft folgende Phasen (siehe `appspec.yml`):

1. **ApplicationStop** (`application_stop.sh`)
   - Stoppt laufende Docker-Container
   - Bereinigt alte Ressourcen

2. **BeforeInstall** (`before_install.sh`)
   - Aktualisiert System-Packages
   - Installiert Docker, Git, AWS CLI
   - Bereitet Zielverzeichnis vor

3. **Install** (automatisch durch CodeDeploy)
   - Kopiert Dateien von S3 nach `/home/ec2-user/mexc-sniper-bot`

4. **AfterInstall** (`after_install.sh`)
   - Setzt Berechtigungen
   - Installiert Dependencies (Node.js, npm)

5. **ApplicationStart** (`application_start.sh`)
   - Loggt in ECR ein
   - Pullt Docker Image
   - Startet Container mit Environment-Variablen

6. **ValidateService** (`validate_service.sh`)
   - Führt Health-Checks durch (30 Versuche)
   - Prüft Container-Status
   - Validiert `/health` Endpoint

## Fehlerbehebung

### Deployment schlägt fehl

1. **Logs auf EC2 prüfen:**
   ```bash
   # CodeDeploy Agent Logs
   sudo tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log
   
   # Deployment Logs
   sudo tail -f /opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log
   ```

2. **Script-Logs prüfen:**
   ```bash
   # Letzte Deployment-ID finden
   DEPLOYMENT_ID=$(sudo ls -t /opt/codedeploy-agent/deployment-root/ | head -1)
   
   # Script-Logs ansehen
   sudo cat /opt/codedeploy-agent/deployment-root/${DEPLOYMENT_ID}/logs/scripts.log
   ```

3. **Container-Logs prüfen:**
   ```bash
   docker logs mexc-sniper-blue --tail 100
   ```

### Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| "No instances found" | EC2 Tag fehlt | Tag `Name=mexc-sniper-bot` hinzufügen |
| "Access Denied" | IAM-Rechte fehlen | EC2-Rolle und CodeDeploy-Rolle prüfen |
| "S3 bucket not found" | Falscher Region | Bucket muss in ap-northeast-3 sein |
| "Health check failed" | Container startet nicht | Docker logs und ENV-Variablen prüfen |
| "CodeDeploy agent not running" | Agent nicht installiert | Agent installieren und starten |

### CodeDeploy Agent neustarten

```bash
# Status prüfen
sudo service codedeploy-agent status

# Neustarten
sudo service codedeploy-agent restart

# Logs in Echtzeit anschauen
sudo tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log
```

## Monitoring und Validierung

### Deployment-Status prüfen (CLI)

```bash
# Letztes Deployment abrufen
aws deploy list-deployments \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-production \
  --region ap-northeast-3 \
  --max-items 1

# Deployment-Details anzeigen
aws deploy get-deployment \
  --deployment-id d-XXXXXXXXX \
  --region ap-northeast-3
```

### Application Health prüfen

```bash
# Über EC2 Public IP
curl http://YOUR_EC2_IP:8080/health

# Von EC2 Instanz selbst
curl http://localhost:8080/health
```

### GitHub Actions prüfen

Alle Deployments sind sichtbar unter:
```
https://github.com/YOUR_USERNAME/mexc-sniper-bot/actions
```

## Rollback

### Automatischer Rollback

CodeDeploy bietet automatischen Rollback bei Fehlern:

```bash
# Rollback konfigurieren
aws deploy update-deployment-group \
  --application-name mexc-sniper-bot \
  --current-deployment-group-name mexc-sniper-production \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM \
  --region ap-northeast-3
```

### Manueller Rollback

```bash
# Vorheriges Deployment finden
aws deploy list-deployments \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-production \
  --region ap-northeast-3

# Deployment erneut ausführen
aws deploy create-deployment \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-production \
  --s3-location bucket=mexc-sniper-codedeploy-osaka,key=mexc-sniper-bot/deploy-PREVIOUS_COMMIT_SHA.zip,bundleType=zip \
  --region ap-northeast-3
```

## Sicherheit

### Best Practices

1. **IAM Least Privilege:** Nur notwendige Permissions vergeben
2. **Secrets Management:** Sensitive Daten nur in GitHub Secrets
3. **S3 Bucket Encryption:** Server-side encryption aktivieren
4. **VPC Security Groups:** Nur notwendige Ports öffnen (8080 für API)
5. **CloudWatch Logs:** Alle Logs zentral sammeln

### S3 Bucket Verschlüsselung aktivieren

```bash
aws s3api put-bucket-encryption \
  --bucket mexc-sniper-codedeploy-osaka \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }' \
  --region ap-northeast-3
```

## Referenzen

- [AWS CodeDeploy Dokumentation](https://docs.aws.amazon.com/codedeploy/)
- [AppSpec File Reference](https://docs.aws.amazon.com/codedeploy/latest/userguide/reference-appspec-file.html)
- [GitHub Actions AWS Integration](https://github.com/aws-actions)
- [Original Guide](https://www.fastfwd.com/continuous-deployment-github-aws-ec2-using-aws-codedeploy/)

## Support

Bei Fragen oder Problemen:
1. Prüfe die Logs auf EC2 und in GitHub Actions
2. Konsultiere die AWS CodeDeploy Console
3. Erstelle ein Issue im Repository
