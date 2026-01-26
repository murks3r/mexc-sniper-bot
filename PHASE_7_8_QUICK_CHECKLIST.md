# 🎯 ULTRA-SCHNELLE CHECKLISTE: Phase 7 & 8

**Gesamtzeit: ~30 Minuten**

---

## ⏱️ Phase 7: Frontend API URL (5 Minuten)

**📌 Voraussetzung:** Phase 6 erfolgreich (EC2 läuft)

```
□ AWS Console öffnen
  → EC2 → Instances → mexc-sniper-bot
  
□ Public IPv4 kopieren (z.B. 54.179.123.45)

□ Vercel Dashboard öffnen
  → mexc-sniper-bot → Settings → Environment Variables
  
□ New Variable:
  Name: NEXT_PUBLIC_API_URL
  Value: http://54.179.123.45:8080
  Environment: Production ✓
  
□ Save

□ OPTIONAL: Lokal testen
  echo "NEXT_PUBLIC_API_URL=http://54.179.123.45:8080" >> .env.local
  bun run dev
  # Öffne http://localhost:3000
  # Öffne DevTools → Console
  # fetch('http://54.179.123.45:8080/health')
```

**✅ Phase 7 fertig wenn:**
- [ ] NEXT_PUBLIC_API_URL in Vercel aktiv
- [ ] Frontend neu deployed

---

## 🔐 Phase 8: GitHub Secrets (25 Minuten)

**📌 Was Du brauchst:**

```
┌─────────────────────────────────────────────┐
│ Von AWS:                                    │
│ ☐ Account ID (12 Ziffern)                  │
│ ☐ Access Key ID (AKIA...)                  │
│ ☐ Secret Access Key (lange Zeichenkette)   │
│ ☐ EC2 SSH Private Key (.pem)               │
│ ☐ EC2 öffentliche IP                       │
│                                             │
│ Von MEXC:                                   │
│ ☐ API Key                                  │
│ ☐ Secret Key                               │
│                                             │
│ Generieren:                                 │
│ ☐ JWT_SECRET (min. 32 Zeichen)             │
└─────────────────────────────────────────────┘
```

### **Schritt 1: AWS Credentials sammeln** (5 min)

```bash
# Terminal:
# 1. Account ID
aws sts get-caller-identity --query Account --output text

# 2. Access Keys (Falls nicht vorhanden: neue erstellen)
# AWS Console → IAM → Users → [Dein User] → Create access key

# 3. EC2 SSH Private Key (aus EC2 Key Pair)
cat ~/.ssh/mexc-sniper-key.pem
# ODER von AWS Console downloaden

# 4. EC2 IP (bereits aus Phase 7 bekannt)
# 54.179.xxx.xxx
```

### **Schritt 2: MEXC Keys sammeln** (2 min)

```bash
# MEXC Website:
# 1. Login zu mexc.com
# 2. Account → API Management
# 3. Kopiere:
#    - Access Key
#    - Secret Key
```

### **Schritt 3: JWT_SECRET generieren** (1 min)

```bash
# Terminal:
openssl rand -base64 32

# Oder:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### **Schritt 4: Secrets in GitHub eintragen** (15 min)

```
GitHub → Repository → Settings → Secrets and variables → Actions

Klick: "New repository secret"

Für jeden Secret:
```

| # | Secret Name | Woher | Status |
|---|---|---|---|
| 1 | `AWS_ACCOUNT_ID` | `aws sts get-caller-identity --query Account` | ☐ |
| 2 | `AWS_ACCESS_KEY_ID` | AWS IAM > Access keys (beginnt mit AKIA) | ☐ |
| 3 | `AWS_SECRET_ACCESS_KEY` | AWS IAM > Access keys (lange Zeichenkette) | ☐ |
| 4 | `AWS_SSH_PRIVATE_KEY` | `cat ~/.ssh/mexc-sniper-key.pem` | ☐ |
| 5 | `AWS_EC2_IP` | Aus Phase 7 (54.179.x.x) | ☐ |
| 6 | `MEXC_API_KEY` | mexc.com > Account > API Management | ☐ |
| 7 | `MEXC_SECRET_KEY` | mexc.com > Account > API Management | ☐ |
| 8 | `JWT_SECRET` | `openssl rand -base64 32` | ☐ |

**⚠️ WICHTIG:**
- **AWS_SSH_PRIVATE_KEY:** Kompletter Inhalt mit BEGIN/END lines
- **AWS_SECRET_ACCESS_KEY:** Wird nur EINMAL angezeigt!
- **JWT_SECRET:** Min. 32 Zeichen

---

## ✅ Verifizierung

```bash
# 1. GitHub Secrets überprüfen
GitHub → Settings → Secrets and variables → Actions
→ Alle 8 Secrets sollten dort sein ✓

# 2. GitHub Actions starten
git commit -m "Update backend for phase 8"
git push origin main

# 3. Actions überprüfen
GitHub → Actions → Rust Backend CI/CD
→ Sollte durchlaufen: check → format → lint → test

# 4. Deploy startet automatisch
deploy-rust.yml sollte starten
→ build → docker-build → deploy → rollback (optional)

# 5. EC2 überprüfen
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@54.179.x.x
docker ps # Sollte mexc-sniper-blue Container zeigen
docker logs mexc-sniper-blue # Sollte keine Fehler haben

# 6. Health Check
curl http://54.179.x.x:8080/health
# Sollte antworten: {"status":"healthy","timestamp":"2026-01-25T..."}
```

---

## 🐛 Troubleshooting Quick-Fix

| Problem | Symptom | Fix |
|---------|---------|-----|
| Secrets nicht gefunden | GitHub Action: "Unable to resolve action" | Überprüfe Secret-Namen Spelling |
| AWS Auth fehlgeschlagen | "InvalidClientTokenId" | AWS Keys überprüfen + regenerieren |
| ECR Push fehlgeschlagen | "InvalidParameterException" | AWS_ACCOUNT_ID falsch |
| SSH Connection fehlgeschlagen | "Permission denied (publickey)" | SSH Private Key komplette PEM kopieren |
| Container startet nicht | `docker logs` zeigt Fehler | MEXC_API_KEY / JWT_SECRET überprüfen |
| Health Check times out | curl times out auf EC2 | Port 8080 in Security Group öffnen |

---

## 📝 Schnell-Referenz für Copy-Paste

```bash
# AWS Account ID auslesen
aws sts get-caller-identity

# AWS Access Keys: GUI Required
# AWS IAM Console → Users → [Dein User] → Create access key

# EC2 SSH Key auslesen
cat ~/.ssh/mexc-sniper-key.pem

# JWT Secret generieren
openssl rand -base64 32

# EC2 IP überprüfen
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --region ap-southeast-1

# Auf EC2 deployte Container überprüfen
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@[IP]
docker logs mexc-sniper-blue

# Health-Check direkt vom Laptop
curl http://[EC2_IP]:8080/health
```

---

## 🎯 Endresultat

**Wenn alles fertig ist:**

```
✅ Frontend API URL konfiguriert (Vercel)
✅ 8 GitHub Secrets eingetragen
✅ GitHub Actions läuft automatisch
✅ Docker Image pushed zu ECR
✅ Container deployed auf EC2
✅ Health Check bestanden: http://54.179.x.x:8080/health
✅ Frontend kann Orders an Backend senden
```

**Zeit für Phase 7 + 8: ~30 Minuten**
**Automatisierte Deployment-Zeit: ~5-10 Minuten**

---

## 🚀 Nach Phase 8: Was kommt noch?

```
Phase 9: Final Validation & Testing
  □ Frontend sendet Order
  □ Rust Backend verarbeitet
  □ Daten in DynamoDB gespeichert
  □ MEXC erhält Order < 100ms
  □ Logs überprüfen
  □ Performance testen
```

