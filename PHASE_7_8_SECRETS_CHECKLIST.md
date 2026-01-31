# Phase 7 & 8: Frontend API URL + GitHub Actions Secrets Checkliste

> **Von dem User deferred:** "7 also frontend api url muss ich mir erst anschauen was du damit meinst"

---

## 📋 PHASE 7: Frontend API URL Konfiguration

### 7.1 Was ist das Problem?

Die Frontend-App (Next.js unter `/app`) muss wissen, wo der Rust-Backend erreichbar ist:

```
Frontend-App (Vercel) → 
  sucht nach API unter NEXT_PUBLIC_API_URL → 
  muss auf EC2 Rust-Backend zeigen (http://54.179.xxx.xxx:8080)
```

### 7.2 Was benötigst Du manuell?

**NACH erfolgreichem Phase 6 (EC2 Deployment):**

1. **EC2 öffentliche IP-Adresse notieren**
   - AWS Console → EC2 Instances
   - Suche: `mexc-sniper-bot`
   - Kopiere: **Public IPv4 address** (z.B. `54.179.123.45`)

2. **Vercel Environment Variable setzen**
   ```bash
   # Option A: Via Vercel CLI
   vercel env add NEXT_PUBLIC_API_URL production
   # → Eingabe: http://54.179.123.45:8080
   
   # Option B: Via Vercel Dashboard
   # Gehe zu: vercel.com → mexc-sniper-bot → Settings → Environment Variables
   # Erstelle Variable:
   # Name: NEXT_PUBLIC_API_URL
   # Value: http://54.179.123.45:8080
   # Environments: Production (✓)
   ```

3. **Domain-basierte Alternative (optional, später)**
   ```bash
   # Wenn Du einen Domain hast:
   vercel env add NEXT_PUBLIC_API_URL production
   # → Eingabe: https://api.yourdomain.com
   # Erfordert dann: Domain-Setup + Reverse Proxy auf EC2
   ```

4. **Lokal testen**
   ```bash
   # In deinem lokalen Projekt:
   echo "NEXT_PUBLIC_API_URL=http://54.179.123.45:8080" >> .env.local
   
   # Starte Frontend
   bun run dev
   
   # Test im Browser:
   # Öffne DevTools (F12) → Console
   # Teste Fetch:
   # fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
   ```

### 7.3 Worauf wird die Variable verwendet?

Überprüfe diese Datei in Deiner Frontend-App:

```bash
grep -r "NEXT_PUBLIC_API_URL" app/
grep -r "process.env.NEXT_PUBLIC_API_URL" app/
grep -r "NEXT_PUBLIC_API_URL" src/
```

Typische Verwendung:
```typescript
// in app/api/trading/route.ts oder ähnlich
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const response = await fetch(`${apiUrl}/api/trade/order`, { ... });
```

---

## 🔐 PHASE 8: GitHub Actions Secrets Setup

### 8.1 Welche Secrets brauchst Du?

**🔴 KRITISCH - RUST BACKEND DEPLOYMENT:**

| Secret Name | Beispielwert | Wo herbekommen? | Benötigt für |
|---|---|---|---|
| `AWS_ACCOUNT_ID` | `123456789012` | AWS Console → Account ID (rechts oben) | ECR Push |
| `AWS_ACCESS_KEY_ID` | `AKIA2EXAMP...` | AWS IAM → New Access Key | AWS Auth |
| `AWS_SECRET_ACCESS` | `wJalrXUtnFEMI/K7MD...` | AWS IAM → Access Key (nur 1x sichtbar!) | AWS Auth |
| `AWS_SSH_PRIVATE_KEY` | `-----BEGIN RSA PRIVATE KEY-----...` | EC2 Key Pair `.pem` Datei | SSH Deploy |
| `AWS_EC2_IP` | `54.179.123.45` | AWS Console → EC2 Public IPv4 | SSH Target |
| `MEXC_API_KEY` | `mx...` | MEXC Website → Account → API Management | Runtime Config |
| `MEXC_SECRET_KEY` | `secret...` | MEXC Website → Account → API Management | Runtime Config |
| `JWT_SECRET` | `your-secret-key-min-32-chars...` | Eigenes sicheres Secret generieren | Runtime Config |

**🟡 OPTIONAL - FRONTEND DEPLOYMENT:**

| Secret Name | Für |
|---|---|
| `VERCEL_TOKEN` | Vercel Deployment (wenn nicht via GitHub App) |
| `VERCEL_ORG_ID` | Vercel Org ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |
| `CODECOV_TOKEN` | Code Coverage Reports |

---

### 8.2 Schritt-für-Schritt: Secrets in GitHub erstellen

#### **A. AWS Credentials auslesen**

```bash
# Öffne AWS Console
# → IAM → Users → (Dein Benutzer)
# → Create access key → Kopiere beide Werte

# ACHTUNG: AWS Secret wird NUR EINMAL angezeigt!
# Falls verloren: Neuen Key erstellen und alten löschen
```

#### **B. EC2 SSH Private Key vorbereiten**

```bash
# Falls noch nicht vorhanden:
aws ec2 create-key-pair --key-name mexc-sniper-key --region ap-southeast-1

# Key-Datei bereits vorhanden?
cat ~/.ssh/mexc-sniper-key.pem

# ODER aus AWS Console herunterladen
# → EC2 → Key Pairs → mexc-sniper-key → Download
```

#### **C. Secrets in GitHub eintragen**

1. **GitHub Repository öffnen**
   - https://github.com/YOUR_USERNAME/mexc-sniper-bot

2. **Settings → Secrets and variables → Actions**
   - Klick: "New repository secret"

3. **Jeden Secret einzeln hinzufügen:**

```
Secret #1: AWS_ACCOUNT_ID
Value: 123456789012

Secret #2: AWS_ACCESS_KEY_ID
Value: AKIA2EXAMP...

Secret #3: AWS_SECRET_ACCESS
Value: wJalrXUtnFEMI/K7MD...
(ACHTUNG: Kopiere die komplette lange Zeichenkette!)

Secret #4: AWS_SSH_PRIVATE_KEY
Value: (Inhalt der .pem Datei)
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----

Secret #5: AWS_EC2_IP
Value: 54.179.123.45

Secret #6: MEXC_API_KEY
Value: mx...

Secret #7: MEXC_SECRET_KEY
Value: secret...

Secret #8: JWT_SECRET
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (min. 32 Zeichen)
```

---

### 8.3 JWT_SECRET generieren

```bash
# Option 1: Mit OpenSSL
openssl rand -base64 32

# Option 2: Mit Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Mit Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Kopiere das Ergebnis als JWT_SECRET Secret
```

---

### 8.4 Private Key aus PEM zu Secret konvertieren

```bash
# Falls Dein Key so aussieht:
cat ~/.ssh/mexc-sniper-key.pem

# Kopiere DEN KOMPLETTEN INHALT (inklusive BEGIN/END):
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA2q...
...viele Zeilen...
-----END RSA PRIVATE KEY-----

# Paste in GitHub Secret: AWS_SSH_PRIVATE_KEY
```

---

### 8.5 Was passiert nach Secret-Setup?

Wenn Du commits zu `main` machst und `backend-rust/` ändert:

```
1. GitHub Action "rust-ci.yml" startet
   ✓ cargo check
   ✓ cargo fmt
   ✓ cargo clippy
   ✓ cargo test

2. Wenn alles passt → "deploy-rust.yml" startet
   ✓ Cargo build --release
   ✓ Docker build
   ✓ Docker login zu ECR (mit AWS credentials)
   ✓ Push zu AWS ECR
   ✓ SSH zu EC2 (mit private key)
   ✓ Container starten
   ✓ Health check
   ✓ Rollback falls fehler

3. EC2 lädt Docker Image und startet Container
   ✓ MEXC_API_KEY wird injiziert
   ✓ JWT_SECRET wird injiziert
   ✓ Port 8080 wird exponiert
```

---

## ✅ CHECKLISTE: Was muss manuell gemacht werden?

### Phase 7 (Frontend API URL)
- [ ] Phase 6 erfolgreich abgeschlossen (EC2 läuft)
- [ ] EC2 öffentliche IP notiert (54.179.xxx.xxx)
- [ ] NEXT_PUBLIC_API_URL in Vercel gesetzt
- [ ] Frontend lokal getestet: `fetch($NEXT_PUBLIC_API_URL/health)`
- [ ] Frontend neu deployed auf Vercel

### Phase 8 (GitHub Secrets)
- [ ] AWS Account ID kopiert (12 Ziffern)
- [ ] AWS Access Key ID kopiert
- [ ] AWS Secret Access Key kopiert (SICHER aufbewahren!)
- [ ] EC2 SSH Private Key (.pem) vorbereitet
- [ ] JWT_SECRET generiert (min. 32 Zeichen)
- [ ] MEXC API Keys kopiert

**8 Secrets in GitHub erstellt:**
- [ ] AWS_ACCOUNT_ID
- [ ] AWS_ACCESS_KEY_ID
- [ ] AWS_SECRET_ACCESS
- [ ] AWS_SSH_PRIVATE_KEY
- [ ] AWS_EC2_IP
- [ ] MEXC_API_KEY
- [ ] MEXC_SECRET_KEY
- [ ] JWT_SECRET

### Verifizierung
- [ ] GitHub Action "rust-ci.yml" läuft erfolgreich
- [ ] GitHub Action "deploy-rust.yml" pushed zu ECR
- [ ] Docker Container startet auf EC2
- [ ] curl http://54.179.xxx.xxx:8080/health = OK
- [ ] Frontend sendet Orders an Rust-Backend

---

## 🔍 Troubleshooting

### "Secret not found in GitHub Actions"
```
Lösung: 
1. GitHub → Settings → Secrets → Check ob Secret dort ist
2. Spelling prüfen: AWS_ACCESS_KEY_ID (nicht AWS_ACCESS_KEY)
3. Neu deployen: git push
```

### "Failed to push Docker image to ECR"
```
Prüfen:
1. Ist AWS_ACCOUNT_ID korrekt? 
2. Ist AWS_ACCESS_KEY_ID + SECRET_KEY richtig?
3. Ist ECR Repository erstellt?
   aws ecr describe-repositories --repository-names mexc-sniper-rust
```

### "SSH connection failed to EC2"
```
Prüfen:
1. Ist AWS_EC2_IP korrekt? (sollte öffentliche IP sein)
2. Ist SSH Private Key vollständig kopiert?
3. Sicherheitsgruppe: Port 22 offen für GitHub?
4. SSH-Fingerprint vertraut?
```

### "Container starts but health check fails"
```
Prüfen auf EC2:
docker ps
docker logs mexc-sniper-blue

Häufige Fehler:
- JWT_SECRET nicht gesetzt
- MEXC_API_KEY ungültig
- DynamoDB Table existiert nicht
- Port 8080 blockiert
```

---

## 📚 Zusätzliche Ressourcen

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [AWS IAM Access Keys](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [JWT Secret Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)

---

## 💡 Security Best Practices

✅ **DO:**
- Rotiere Secrets alle 90 Tage
- Verwende unterschiedliche Keys für dev/staging/production
- Speichere SSH Private Keys lokal (NOT in Git!)
- Überprüfe welche Actions auf Secrets zugreifen

❌ **DON'T:**
- Committe `.pem` oder `.env` Dateien
- Teile SSH Private Keys über Chat/Email
- Verwende `123456` oder offensichtliche Passwörter
- Speichere Secrets in Code oder Dokumentation

---

## 🎯 Zusammenfassung

**Phase 7 & 8 benötigen diese manuellen Aktionen:**

1. **After Phase 6:** EC2 IP notieren
2. **Vercel:** NEXT_PUBLIC_API_URL setzen
3. **AWS:** Access Keys generieren (falls nicht vorhanden)
4. **EC2:** SSH Key (.pem) vorbereiten
5. **Generate:** JWT_SECRET erzeugen
6. **GitHub:** 8 Secrets eintragen
7. **Test:** GitHub Actions Workflow prüfen
8. **Verify:** curl health endpoint on EC2

**Zeit für manuelles Setup: ~20 Minuten**
**Automatisierte Zeit im Action: ~5 Minuten**

