# GitHub Secrets Quick Reference

## 🔐 8 Required Secrets für deploy-rust.yml

```bash
# Paste diese Secrets in GitHub: Settings > Secrets and variables > Actions

################################
# AWS Authentication
################################
AWS_ACCOUNT_ID
Value: 123456789012
⟶ Findest unter: AWS Console (rechts oben) > Account ID

AWS_ACCESS_KEY_ID
Value: AKIA... (ca. 20 Zeichen)
⟶ Findest unter: AWS IAM > Users > [Dein User] > Access keys

AWS_SECRET_ACCESS
Value: wJalrXUtnFEMI... (lange Zeichenkette)
⟶ ACHTUNG: Wird nur EINMAL angezeigt! Falls weg: neuen Key erstellen

################################
# SSH Deployment
################################
AWS_SSH_PRIVATE_KEY
Value: (Kompletter Inhalt der .pem Datei)
-----BEGIN RSA PRIVATE KEY-----
MIIE...
...
-----END RSA PRIVATE KEY-----
⟶ Bekommst unter: EC2 > Key Pairs > Download .pem

AWS_EC2_IP
Value: 54.179.123.45 (öffentliche IPv4)
⟶ Findest unter: AWS EC2 > Instances > [mexc-sniper-bot] > Public IPv4

################################
# Application Configuration
################################
MEXC_API_KEY
Value: mx1234567...
⟶ Bekommst unter: mexc.com > Account > API Management

MEXC_SECRET_KEY
Value: (lange geheime Zeichenkette)
⟶ Bekommst unter: mexc.com > Account > API Management

JWT_SECRET
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
⟶ Generiere mit: openssl rand -base64 32

################################
# Verification Checklist
################################
[ ] AWS_ACCOUNT_ID → 12-stellige Nummer
[ ] AWS_ACCESS_KEY_ID → Beginnt mit AKIA
[ ] AWS_SECRET_ACCESS → Lange Zeichenkette
[ ] AWS_SSH_PRIVATE_KEY → BEGIN/END RSA PRIVATE KEY
[ ] AWS_EC2_IP → IP Adresse wie 54.179.x.x
[ ] MEXC_API_KEY → Von MEXC Website
[ ] MEXC_SECRET_KEY → Von MEXC Website
[ ] JWT_SECRET → Min. 32 Zeichen Random

# Workflow nach Secret-Setup:
1. git commit -m "Update backend"
2. git push origin main
3. GitHub Actions startet automatisch
4. rust-ci.yml: cargo check/test/lint
5. deploy-rust.yml: build → ECR → EC2
6. curl http://AWS_EC2_IP:8080/health → OK
```

## 🚀 Deploy Workflow Ablauf

```
┌─────────────────────────────────────────────────────────────────┐
│ Git Push zu main + Änderung in backend-rust/                   │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │  rust-ci.yml       │ (Immer)
    │  - cargo check     │
    │  - cargo test      │
    │  - cargo clippy    │
    └────────┬───────────┘
             │
             ▼ (Wenn erfolgreich)
    ┌────────────────────┐
    │ deploy-rust.yml    │ (Nur main branch)
    │ - cargo build      │ ← Benötigt: keine Secrets
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ docker-build Job   │
    │ - docker build     │
    │ - ECR login        │ ← Benötigt: AWS_ACCOUNT_ID
    │ - ECR push         │ ← Benötigt: AWS_ACCESS_KEY_ID
    │                    │ ← Benötigt: AWS_SECRET_ACCESS
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ deploy Job         │
    │ - SSH zu EC2       │ ← Benötigt: AWS_SSH_PRIVATE_KEY
    │ - docker run       │ ← Benötigt: AWS_EC2_IP
    │ - health check     │ ← Benötigt: MEXC_API_KEY
    │ - runtime env vars │ ← Benötigt: MEXC_SECRET_KEY
    │                    │ ← Benötigt: JWT_SECRET
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ ✅ Deployment OK   │
    │ Container läuft    │
    │ auf EC2 Port 8080  │
    └────────────────────┘
```

## 🔍 Welcher Secret wird wo verwendet?

```yaml
# rust-ci.yml - CI Pipeline (KEINE Secrets benötigt)
name: Rust Backend CI/CD
- cargo check
- cargo test
- cargo clippy

# deploy-rust.yml - Deployment Pipeline
- AWS_ACCOUNT_ID → ECR Registry Adresse:
  ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.ap-southeast-1.amazonaws.com

- AWS_ACCESS_KEY_ID → AWS Authentication:
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}

- AWS_SECRET_ACCESS → AWS Authentication:
  with:
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS }}

- AWS_SSH_PRIVATE_KEY → SSH Verbindung zu EC2:
  echo "${{ secrets.AWS_SSH_PRIVATE_KEY }}" > ~/.ssh/id_rsa

- AWS_EC2_IP → Ziel für SSH:
  scp deploy.sh ec2-user@${{ secrets.AWS_EC2_IP }}:/tmp/

- MEXC_API_KEY → Runtime Environment Variable:
  docker run -e MEXC_API_KEY=${{ secrets.MEXC_API_KEY }} ...

- MEXC_SECRET_KEY → Runtime Environment Variable:
  docker run -e MEXC_SECRET_KEY=${{ secrets.MEXC_SECRET_KEY }} ...

- JWT_SECRET → Runtime Environment Variable:
  docker run -e JWT_SECRET=${{ secrets.JWT_SECRET }} ...
```

## ⚠️ Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|--------|--------|
| "Repository not found" | AWS_ACCOUNT_ID falsch | Check AWS Console Account ID |
| "Failed to login" | AWS Keys abgelaufen | Neue Access Keys erstellen |
| "SSH connection refused" | AWS_EC2_IP falsch | Check EC2 Public IPv4 |
| "Permission denied (publickey)" | AWS_SSH_PRIVATE_KEY incomplete | Komplettes PEM-Datei Kopieren |
| "Container fails to start" | JWT_SECRET nicht gesetzt | Secret in GitHub überprüfen |
| "MEXC API error" | MEXC Keys ungültig | MEXC Website Keys überprüfen |

