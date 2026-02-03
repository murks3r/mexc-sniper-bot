# AWS CodeDeploy Quick Start Guide

Schnellstart-Anleitung für die Einrichtung von AWS CodeDeploy für den MEXC Sniper Bot.

## 🎯 Ziel

Automatisches Deployment des MEXC Sniper Bots auf AWS EC2 bei jedem Push zu `main`.

## ⚡ Schnellstart (5 Schritte)

### 1️⃣ S3 Bucket erstellen (Osaka-Region)

**WICHTIG:** Der Bucket MUSS in der Region `ap-northeast-3` (Osaka) liegen!

```bash
# Bucket erstellen
aws s3 mb s3://mexc-sniper-codedeploy-osaka --region ap-northeast-3

# Versionierung aktivieren
aws s3api put-bucket-versioning \
  --bucket mexc-sniper-codedeploy-osaka \
  --versioning-configuration Status=Enabled \
  --region ap-northeast-3
```

### 2️⃣ CodeDeploy Application erstellen

```bash
aws deploy create-application \
  --application-name mexc-sniper-bot \
  --compute-platform Server \
  --region ap-northeast-3
```

### 3️⃣ CodeDeploy Agent auf EC2 installieren

SSH zur EC2-Instanz und führe aus:

```bash
# Agent herunterladen und installieren
cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Agent starten
sudo service codedeploy-agent start
sudo service codedeploy-agent status
```

EC2-Instanz taggen:
```bash
aws ec2 create-tags \
  --resources i-DEINE_INSTANCE_ID \
  --tags Key=Name,Value=mexc-sniper-bot \
  --region ap-northeast-3
```

### 4️⃣ Deployment Group erstellen

```bash
aws deploy create-deployment-group \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-production \
  --service-role-arn arn:aws:iam::DEINE_ACCOUNT_ID:role/CodeDeployServiceRole \
  --ec2-tag-filters Key=Name,Value=mexc-sniper-bot,Type=KEY_AND_VALUE \
  --region ap-northeast-3
```

> **Hinweis:** Die IAM Service-Rolle `CodeDeployServiceRole` muss die Policy `AWSCodeDeployRole` haben.

### 5️⃣ GitHub Secrets konfigurieren

Gehe zu: **GitHub Repository → Settings → Secrets and variables → Actions**

Füge diese 3 neuen Secrets hinzu:

| Secret Name | Wert (Beispiel) |
|------------|-----------------|
| `CODEDEPLOY_S3_BUCKET` | `mexc-sniper-codedeploy-osaka` |
| `CODEDEPLOY_APPLICATION_NAME` | `mexc-sniper-bot` |
| `CODEDEPLOY_DEPLOYMENT_GROUP` | `mexc-sniper-production` |

## ✅ Deployment testen

```bash
# Kleine Änderung machen
echo "# Test deployment" >> README.md

# Committen und pushen
git add .
git commit -m "Test CodeDeploy deployment"
git push origin main

# Workflow Status prüfen
# GitHub → Actions Tab
```

## 📋 Checkliste

Vor dem ersten Deployment stelle sicher, dass:

- [ ] S3 Bucket in ap-northeast-3 (Osaka) erstellt ✓
- [ ] CodeDeploy Application erstellt ✓
- [ ] EC2-Instanz mit Tag `Name=mexc-sniper-bot` versehen ✓
- [ ] CodeDeploy Agent auf EC2 installiert und läuft ✓
- [ ] Deployment Group erstellt ✓
- [ ] Alle 3 neuen GitHub Secrets konfiguriert ✓
- [ ] Bestehende AWS Secrets verfügbar (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) ✓

## 🔍 Häufige Probleme

### "CodeDeploy S3 bucket secret not set"
→ Secret `CODEDEPLOY_S3_BUCKET` in GitHub hinzufügen

### "No instances found"
→ EC2-Instanz mit Tag `Name=mexc-sniper-bot` versehen

### "CodeDeploy agent not running"
→ Auf EC2: `sudo service codedeploy-agent restart`

### "Access Denied" beim S3 Upload
→ IAM-User benötigt `s3:PutObject` Permission für den Bucket

## 📚 Vollständige Dokumentation

Für detaillierte Informationen siehe:
- [AWS_CODEDEPLOY_SETUP.md](AWS_CODEDEPLOY_SETUP.md) - Vollständige Setup-Anleitung
- [appspec.yml](../../appspec.yml) - CodeDeploy Konfiguration
- [Deployment Scripts](../../scripts/deployment/) - Lifecycle-Scripts

## 🆘 Support

Bei Problemen:
1. Prüfe GitHub Actions Logs: Repository → Actions
2. Prüfe EC2 Logs: `/var/log/aws/codedeploy-agent/codedeploy-agent.log`
3. Prüfe AWS Console: CodeDeploy → Deployments

## 🎓 Nächste Schritte

Nach erfolgreichem Setup:
1. Monitoring mit CloudWatch einrichten
2. Automatischen Rollback konfigurieren
3. Blue-Green Deployment aktivieren
4. Alarme für fehlgeschlagene Deployments erstellen
