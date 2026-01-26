# COMPLETE SECRETS & CONFIGURATION REFERENCE TABLE

**Print this page for reference during setup**

---

## 🔐 ALL REQUIRED SECRETS (Phase 8)

```
┌──────────────────────────────────────────────────────────────────────┐
│                  GITHUB SECRETS EINTRAGS-REFERENZ                    │
└──────────────────────────────────────────────────────────────────────┘

TEMPLATE:
GitHub → Settings → Secrets and variables → Actions → New repository secret

Kopiere und fülle aus:

GEHEIMNIS #1: AWS_ACCOUNT_ID
├─ Format: 12-stellige Nummer
├─ Beispiel: 123456789012
├─ Funktion: ECR Repository Basis
├─ Wie finden:
│  $ aws sts get-caller-identity
│  {
│    "Account": "123456789012",  ← Kopiere diese Nummer
│    ...
│  }
└─ Status: [ ]

GEHEIMNIS #2: AWS_ACCESS_KEY_ID
├─ Format: Beginnt mit "AKIA"
├─ Beispiel: AKIAZX23EXAMPLE45BK
├─ Funktion: AWS API Authentifizierung
├─ Wie finden:
│  AWS Console → IAM → Users → [Dein User] → Access keys
│  → Create access key → Copy Access Key ID
├─ ⚠️  NUR EINMAL sichtbar! Sofort kopieren!
└─ Status: [ ]

GEHEIMNIS #3: AWS_SECRET_ACCESS_KEY
├─ Format: Lange Base64-Zeichenkette
├─ Beispiel: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
├─ Funktion: AWS API Secret Key
├─ Wie finden:
│  AWS Console → IAM → Users → [Dein User] → Access keys
│  → Create access key → Copy Secret Access Key
├─ ⚠️  NUR EINMAL sichtbar! Sofort kopieren!
├─ ⚠️  NIEMALS in Code committen!
└─ Status: [ ]

GEHEIMNIS #4: AWS_SSH_PRIVATE_KEY
├─ Format: Kompletter PEM-Datei-Inhalt
├─ Beispiel:
│  -----BEGIN RSA PRIVATE KEY-----
│  MIIEowIBAAKCAQEA2qa9/aqJ...
│  ...
│  -----END RSA PRIVATE KEY-----
├─ Funktion: SSH Zugang zu EC2
├─ Wie finden:
│  $ cat ~/.ssh/mexc-sniper-key.pem
│  ODER
│  AWS Console → EC2 → Key Pairs
│  → mexc-sniper-key → Download .pem
├─ ⚠️  KOMPLETTEN Inhalt mit BEGIN/END Zeilen kopieren!
├─ ⚠️  NIEMALS in Code committen!
└─ Status: [ ]

GEHEIMNIS #5: AWS_EC2_IP
├─ Format: IPv4 Adresse
├─ Beispiel: 54.179.123.45
├─ Funktion: SSH Ziel & Health Check
├─ Wie finden:
│  AWS Console → EC2 → Instances → mexc-sniper-bot
│  → Copy "Public IPv4 address"
│  ODER
│  $ aws ec2 describe-instances \
│    --filters Name=tag:Name,Values=mexc-sniper-bot \
│    --query 'Reservations[0].Instances[0].PublicIpAddress' \
│    --region ap-southeast-1
└─ Status: [ ]

GEHEIMNIS #6: MEXC_API_KEY
├─ Format: Länge: 20-40 Zeichen
├─ Beispiel: mx1234567890abcdefgh
├─ Funktion: MEXC Exchange API Zugang
├─ Wie finden:
│  1. mexc.com Login
│  2. Account Settings
│  3. API Management
│  4. Create API Key
│  5. Copy Access Key
├─ Optionen: Paper Trading oder Live Trading
└─ Status: [ ]

GEHEIMNIS #7: MEXC_SECRET_KEY
├─ Format: Lange geheime Zeichenkette
├─ Beispiel: aBcDeFgHiJkLmNoPqRsTuVwXyZ...
├─ Funktion: MEXC API Signing
├─ Wie finden:
│  1. mexc.com Login
│  2. Account Settings
│  3. API Management
│  4. Create API Key
│  5. Copy Secret Key (nur EINMAL sichtbar!)
├─ ⚠️  Wird nur EINMAL angezeigt!
├─ ⚠️  Behalte es sicher!
└─ Status: [ ]

GEHEIMNIS #8: JWT_SECRET
├─ Format: Random Base64, min. 32 Zeichen
├─ Beispiel: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
├─ Funktion: JWT Token Signing für API
├─ Wie finden:
│  $ openssl rand -base64 32
│  ODER
│  $ node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
│  ODER
│  $ python3 -c "import secrets; print(secrets.token_urlsafe(32))"
└─ Status: [ ]

└─ 🎯 ALLE 8 SECRETS EINGEGEBEN: ✅
```

---

## 🔄 GITHUB ACTIONS DEPENDENCIES

```
Wenn Secret X nicht gesetzt ist → GitHub Action Y feilt

┌──────────────────────────────────────┐
│ rust-ci.yml (Immer, keine Secrets)   │
│ - cargo check ✓                      │
│ - cargo test ✓                       │
│ - cargo fmt --check ✓                │
│ - cargo clippy ✓                     │
└──────────────────────────────────────┘
                 ↓
         ✅ wenn erfolgreich
                 ↓
┌──────────────────────────────────────┐
│ deploy-rust.yml (nur main branch)    │
├──────────────────────────────────────┤
│ Job: build                           │
│ ✓ Keine Secrets benötigt             │
├──────────────────────────────────────┤
│ Job: docker-build                    │
│ BENÖTIGT:                            │
│ • AWS_ACCOUNT_ID                     │
│ • AWS_ACCESS_KEY_ID                  │
│ • AWS_SECRET_ACCESS_KEY              │
├──────────────────────────────────────┤
│ Job: deploy                          │
│ BENÖTIGT:                            │
│ • AWS_SSH_PRIVATE_KEY                │
│ • AWS_EC2_IP                         │
│ • MEXC_API_KEY                       │
│ • MEXC_SECRET_KEY                    │
│ • JWT_SECRET                         │
├──────────────────────────────────────┤
│ Job: rollback (bei Fehler)           │
│ BENÖTIGT:                            │
│ • AWS_SSH_PRIVATE_KEY                │
│ • AWS_EC2_IP                         │
└──────────────────────────────────────┘
```

---

## 📋 SETUP CHECKLIST

**Phase 7: Frontend API**
```
[ ] Phase 6 erfolgreich (EC2 läuft)
[ ] EC2 Public IP kopiert
[ ] NEXT_PUBLIC_API_URL in Vercel gesetzt
[ ] Vercel neu deployed
```

**Phase 8: GitHub Secrets**
```
SECRETS SAMMELN:
[ ] AWS_ACCOUNT_ID auslesen
[ ] AWS Access Key ID erzeugen
[ ] AWS Secret Key erzeugen
[ ] EC2 SSH Private Key (.pem) vorbereiten
[ ] EC2 Public IP notiert
[ ] MEXC API Key kopiert
[ ] MEXC Secret Key kopiert
[ ] JWT_SECRET generiert

GITHUB EINTRAGEN:
[ ] AWS_ACCOUNT_ID eingegeben
[ ] AWS_ACCESS_KEY_ID eingegeben
[ ] AWS_SECRET_ACCESS_KEY eingegeben
[ ] AWS_SSH_PRIVATE_KEY eingegeben
[ ] AWS_EC2_IP eingegeben
[ ] MEXC_API_KEY eingegeben
[ ] MEXC_SECRET_KEY eingegeben
[ ] JWT_SECRET eingegeben

VERIFIZIERUNG:
[ ] Alle 8 Secrets in GitHub sichtbar
[ ] git push zu main mit backend-rust/ Änderung
[ ] rust-ci.yml läuft erfolgreich
[ ] deploy-rust.yml läuft erfolgreich
[ ] Docker Container auf EC2 läuft
[ ] curl http://EC2_IP:8080/health = OK
```

---

## ⚠️ SECURITY WARNINGS

```
🚨 NIEMALS tun:
[ ] AWS Secret Keys in .env Dateien speichern
[ ] SSH Private Keys in Git committen
[ ] Secrets in Logs oder Fehler-Stack-Traces
[ ] Secrets in Slack/Email/Chat teilen
[ ] Default/Test-Keys in Production verwenden
[ ] Secrets im Code hardcoden

✅ IMMER tun:
[ ] Keys mit min. 32 Zeichen zufällig generieren
[ ] Access Keys alle 90 Tage rotieren
[ ] SSH Keys mit 4096-bit Länge verwenden
[ ] Unterschiedliche Keys für dev/staging/prod
[ ] GitHub Secret Rotation in Calendar eintragen
[ ] Keys lokal in ~/.ssh speichern (nicht in Git!)
[ ] kubeconfig/AWS profiles im ~/.aws speichern (nicht in Git!)
```

---

## 🔧 QUICK COMMANDS

```bash
# AWS Account ID auslesen
aws sts get-caller-identity

# AWS Access Keys erstellen
# → Manuell via AWS Console IAM

# EC2 IP auslesen
aws ec2 describe-instances \
  --filters Name=tag:Name,Values=mexc-sniper-bot \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --region ap-southeast-1

# SSH Key auslesen
cat ~/.ssh/mexc-sniper-key.pem

# JWT Secret generieren
openssl rand -base64 32

# auf EC2 testen
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@54.179.x.x

# Container logs checken
docker logs mexc-sniper-blue

# Health endpoint testen
curl http://54.179.x.x:8080/health

# GitHub Secrets überprüfen (lokal)
cat ~/.ssh/github_secrets.txt 2>/dev/null || echo "Nicht vorhanden"
```

---

## 📚 Relevante Dokumentation

- [GitHub Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [AWS IAM Access Keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
- [EC2 Key Pairs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html)
- [MEXC API Documentation](https://mexcdeveloper.com/en/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

