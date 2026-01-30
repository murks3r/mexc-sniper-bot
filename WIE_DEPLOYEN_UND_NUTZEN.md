# 🚀 MEXC Sniper Bot - Deployment & Nutzungsanleitung

**Stand:** 2026-01-30  
**Für:** murks3r  

---

## ✅ WICHTIGER HINWEIS

**Das Projekt nutzt AWS EC2, NICHT Vercel!**

Die App besteht aus:
- **Rust Backend auf AWS EC2** (Haupt-Deployment-Ziel)
- **Next.js Frontend** (lokal für Entwicklung)

---

## ❌ AKTUELLE SITUATION

**AWS EC2 Deployment-Status:** ⚠️ Bereit zum Deployen (nach Fixes)

Das AWS EC2 Rust Backend ist jetzt vollständig vorbereitet und kann deployed werden.

**Sie haben zwei Optionen:**

1. ✅ **Lokal das Next.js Frontend nutzen** (für Entwicklung)
2. 🚀 **AWS EC2 Backend deployen** (für Produktion)

---

## 🎯 OPTION 1: Frontend SOFORT LOKAL nutzen

Die Next.js Frontend-App kann lokal gestartet werden:

### Schnellstart (5 Minuten)

```bash
git clone https://github.com/murks3r/mexc-sniper-bot.git
cd mexc-sniper-bot
bun install
cp .env.example .env.local
# Bearbeiten Sie .env.local mit Ihren Keys
bun run db:migrate
make dev
```

**Dann öffnen Sie im Browser:**
- 🏠 Homepage: http://localhost:3008
- 🔐 Login: http://localhost:3008/auth
- 📊 Dashboard: http://localhost:3008/dashboard
- ⚙️ Inngest: http://localhost:8288

**Workflow:**
1. Öffnen Sie http://localhost:3008
2. Registrieren Sie sich mit E-Mail (Clerk)
3. Nutzen Sie das Trading Dashboard

---

## 🚀 OPTION 2: AWS EC2 Backend deployen (Produktion)

### Vollständige Anleitung

**→ Siehe: [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md)**

Diese Datei enthält die **komplette Schritt-für-Schritt-Anleitung** für:
- AWS Account Setup
- EC2 Instanz-Konfiguration
- GitHub Secrets Setup
- Automatisches Deployment via GitHub Actions
- Health Checks und Monitoring
- Troubleshooting

### Schnellübersicht AWS EC2 Deployment

**Voraussetzungen:**
1. AWS Account
2. EC2 Instanz (t3.medium+, Port 8080 offen)
3. GitHub Secrets konfiguriert:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_ACCOUNT_ID`
   - `AWS_EC2_IP`
   - `AWS_SSH_PRIVATE_KEY`
   - `MEXC_API_KEY`
   - `MEXC_SECRET_KEY`
   - `JWT_SECRET`

**Deployment-Prozess:**

```bash
# 1. Lokaler Test
cd backend-rust
cargo check
cargo test

# 2. Zu main pushen
git add .
git commit -m "feat: update backend"
git push origin main

# 3. GitHub Actions deployed automatisch!
# Überwachen Sie: https://github.com/murks3r/mexc-sniper-bot/actions
```

**Nach dem Deployment:**

```bash
# Health Check
curl http://YOUR_EC2_IP:8080/health

# API testen
curl http://YOUR_EC2_IP:8080/api/ticker?symbol=BTCUSDT
```

**API-Endpunkte:**
- Health Check: `http://YOUR_EC2_IP:8080/health`
- Ready Check: `http://YOUR_EC2_IP:8080/ready`
- Metrics: `http://YOUR_EC2_IP:8080/metrics`
- API: `http://YOUR_EC2_IP:8080/api/*`

---

## 📚 Was wurde geändert?

### ✅ Durchgeführte Fixes:

1. **Vercel-Workflows deaktiviert**
   - `deploy.yml` → `deploy.yml.disabled`
   - `release.yml` → `release.yml.disabled`
   - `environment-validation.yml` → `environment-validation.yml.disabled`

2. **AWS EC2 Deployment-Workflow aktualisiert**
   - GitHub Actions v3 → v4 (actions/upload-artifact, actions/download-artifact)
   - Bereit für automatisches Deployment

3. **Rust Backend Build-Fehler behoben**
   - AWS SDK Versionen aktualisiert
   - Prometheus Metrics korrigiert
   - Type-Inkonsistenzen behoben
   - Cargo.lock generiert

4. **Neue Dokumentation erstellt**
   - [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md) - Vollständige AWS Deployment-Anleitung
   - README.md aktualisiert (Vercel-Referenzen entfernt)

### 📋 Deployment-Architektur

```
┌─────────────────────────────────────────────┐
│         MEXC Sniper Bot Architektur         │
├─────────────────────────────────────────────┤
│                                             │
│  Frontend (Next.js)                         │
│  ├─ Entwicklung: localhost:3008             │
│  └─ Trading Dashboard, Auth, UI             │
│                                             │
│  Backend (Rust)                             │
│  ├─ Produktion: AWS EC2 (ap-southeast-1)   │
│  ├─ Container Registry: AWS ECR             │
│  ├─ Port: 8080                              │
│  └─ Blue-Green Deployment                   │
│                                             │
│  CI/CD                                      │
│  └─ GitHub Actions (deploy-rust.yml)        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🆘 Häufige Fragen

### F: Warum wurde Vercel erwähnt, wenn es nicht verwendet wird?

**A:** Das war mein Fehler! Ich habe die alte Konfiguration nicht bemerkt. Vercel-Workflows sind jetzt deaktiviert und die Dokumentation aktualisiert.

### F: Kann ich die App jetzt nutzen?

**A:** 
- ✅ **Lokal: JA!** Starten Sie mit `make dev` und öffnen Sie http://localhost:3008
- 🚀 **AWS EC2: JA!** Folgen Sie [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md)

### F: Was ist der Unterschied zwischen Frontend und Backend?

**A:**
- **Frontend (Next.js):** UI, Dashboard, Authentifizierung - läuft lokal auf Port 3008
- **Backend (Rust):** Trading-Logik, MEXC API Integration - deployed auf AWS EC2 Port 8080

### F: Brauche ich beides?

**A:** 
- Für **Entwicklung:** Ja, beide lokal starten
- Für **Produktion:** Backend auf AWS EC2, Frontend kann lokal oder separat deployed werden

### F: Wo finde ich alle Deployment-Informationen?

**A:** 
- **Vollständige Anleitung:** [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md)
- **Schnellstart:** Diese Datei
- **Technische Details:** [RUST_DEPLOYMENT_GUIDE.md](RUST_DEPLOYMENT_GUIDE.md)

---

## 📊 Deployment-Status

| Komponente | Status | URL | Dokumentation |
|------------|--------|-----|---------------|
| Rust Backend (AWS EC2) | ✅ Bereit | `http://YOUR_EC2_IP:8080` | [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md) |
| Next.js Frontend (Lokal) | ✅ Funktioniert | http://localhost:3008 | Diese Datei |
| GitHub Actions CI/CD | ✅ Konfiguriert | [Actions](https://github.com/murks3r/mexc-sniper-bot/actions) | [deploy-rust.yml](.github/workflows/deploy-rust.yml) |

---

## ✅ Nächste Schritte

### Für Lokale Entwicklung:

1. Lesen Sie diese Datei ✅
2. Folgen Sie "OPTION 1: Frontend SOFORT LOKAL nutzen"
3. Starten Sie `make dev`
4. Öffnen Sie http://localhost:3008

### Für AWS EC2 Produktion:

1. Lesen Sie [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md) ✅
2. AWS Account und EC2 Setup
3. GitHub Secrets konfigurieren
4. Code zu main pushen
5. GitHub Actions deployt automatisch

---

## 🔧 Troubleshooting

### Problem: "Vercel nicht gefunden"

**Lösung:** Vercel wird nicht mehr verwendet! Nutzen Sie AWS EC2 stattdessen.

### Problem: "Deployment fehlgeschlagen"

**Lösung:** 
1. Prüfen Sie [GitHub Actions Logs](https://github.com/murks3r/mexc-sniper-bot/actions)
2. Verifizieren Sie GitHub Secrets
3. Siehe Troubleshooting in [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md)

### Problem: "Kann Backend nicht erreichen"

**Lösung:**
```bash
# EC2 Security Group prüfen - Port 8080 muss offen sein!
# Health Check testen:
curl http://YOUR_EC2_IP:8080/health
```

---

## 📚 Dokumentations-Übersicht

| Datei | Beschreibung |
|-------|--------------|
| **[AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md)** | **→ VOLLSTÄNDIGE AWS DEPLOYMENT-ANLEITUNG** ⭐ |
| [WIE_DEPLOYEN_UND_NUTZEN.md](WIE_DEPLOYEN_UND_NUTZEN.md) | Diese Datei - Übersicht & Schnellstart |
| [SCHNELLSTART.md](SCHNELLSTART.md) | 5-Minuten lokaler Setup |
| [RUST_DEPLOYMENT_GUIDE.md](RUST_DEPLOYMENT_GUIDE.md) | Rust-spezifische Details |
| [DEPLOYMENT_INSPECTION_REPORT.md](DEPLOYMENT_INSPECTION_REPORT.md) | Technische Analyse |
| [README.md](README.md) | Projekt-Übersicht |

---

**Zusammenfassung:**

✅ **Deployment ist BEREIT!**  
✅ **Vercel-Konfiguration wurde entfernt**  
✅ **AWS EC2 ist das richtige Deployment-Ziel**  
✅ **Vollständige Dokumentation erstellt**  

**Für Deployment:** Folgen Sie [AWS_EC2_DEPLOYMENT.md](AWS_EC2_DEPLOYMENT.md)  
**Für lokale Entwicklung:** Nutzen Sie den Schnellstart oben

---

**Viel Erfolg! 🚀**


Die einfachste Methode, um die App **sofort** zu nutzen:

### Schritt 1: Repository klonen (falls noch nicht geschehen)

```bash
git clone https://github.com/murks3r/mexc-sniper-bot.git
cd mexc-sniper-bot
```

### Schritt 2: Abhängigkeiten installieren

```bash
# Mit bun (empfohlen - schneller)
bun install

# ODER mit npm
npm install
```

### Schritt 3: Umgebungsvariablen konfigurieren

Erstellen Sie eine `.env.local` Datei:

```bash
cp .env.example .env.local
```

Bearbeiten Sie `.env.local` mit Ihren echten Daten:

```bash
# Clerk Authentication (ERFORDERLICH)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_IHRE_CLERK_KEY
CLERK_SECRET_KEY=sk_test_IHR_CLERK_SECRET

# Supabase (ERFORDERLICH für Datenbank)
NEXT_PUBLIC_SUPABASE_URL=https://ihr-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=IHR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=IHR_SERVICE_ROLE_KEY

# MEXC API (OPTIONAL - nur für echtes Trading)
MEXC_API_KEY=IHR_MEXC_API_KEY
MEXC_SECRET_KEY=IHR_MEXC_SECRET_KEY
MEXC_BASE_URL=https://api.mexc.com

# Datenbank (lokales SQLite für Entwicklung)
DATABASE_URL=file:./mexc_sniper.db
```

**Wichtig:** 
- Für Clerk: Registrieren Sie sich kostenlos auf https://clerk.com
- Für Supabase: Registrieren Sie sich kostenlos auf https://supabase.com
- MEXC API Keys sind optional (nur für echtes Trading nötig)

### Schritt 4: Datenbank initialisieren

```bash
# Datenbank-Migrationen ausführen
bun run db:migrate

# ODER mit npm
npm run db:migrate
```

### Schritt 5: App starten

```bash
# Mit bun (empfohlen)
make dev

# ODER manuell mit bun
bun run dev

# ODER mit npm
npm run dev
```

### Schritt 6: App im Browser öffnen

Die App läuft jetzt lokal! Öffnen Sie:

**🌐 Haupt-Interface:**
```
http://localhost:3008
```

**Verfügbare Seiten:**

| URL | Beschreibung |
|-----|--------------|
| http://localhost:3008 | **Homepage** - Startseite |
| http://localhost:3008/auth | **Login/Registrierung** - Anmelden mit Clerk |
| http://localhost:3008/dashboard | **Trading Dashboard** - Hauptinterface (nach Login) |
| http://localhost:8288 | **Inngest Dashboard** - Workflow-Überwachung |

### 🎮 So nutzen Sie die App:

1. **Öffnen Sie:** http://localhost:3008
2. **Klicken Sie auf:** "Sign In" oder gehen Sie direkt zu http://localhost:3008/auth
3. **Registrieren/Anmelden** mit Ihrer E-Mail (über Clerk)
4. **Nach dem Login:** Sie werden automatisch zum Dashboard weitergeleitet
5. **Dashboard:** http://localhost:3008/dashboard
   - Snipe Targets verwalten
   - Trading-Einstellungen konfigurieren
   - Positionen überwachen
   - Execution History einsehen

### 📊 Was Sie im Dashboard tun können:

- ✅ **Snipe Targets erstellen** - Neue Trading-Ziele definieren
- ✅ **MEXC Calendar synchronisieren** - Automatisch neue Listings finden
- ✅ **Trading-Präferenzen einstellen** - Take Profit, Stop Loss, etc.
- ✅ **Positionen überwachen** - Aktive Trades im Blick behalten
- ✅ **Performance analysieren** - Trading-Historie und Statistiken

### 🛑 App stoppen:

Drücken Sie `Ctrl + C` im Terminal, wo die App läuft.

---

## 🔧 OPTION 2: Cloud-Deployment reparieren

Wenn Sie die App über Vercel/AWS EC2 in der Cloud nutzen möchten, müssen Sie zuerst die Fehler beheben.

### Warum schlägt das Deployment fehl?

**Problem 1: Linting-Fehler (Hauptproblem)**
- 47 kritische TypeScript/Code-Qualitätsfehler
- Pre-Deployment-Checks blockieren das Deployment
- Muss behoben werden, bevor deployed werden kann

**Problem 2: Veraltete GitHub Actions (Rust Backend)**
- `actions/upload-artifact@v3` ist deprecated
- Muss auf v4 aktualisiert werden

### Schritt-für-Schritt-Anleitung zur Fehlerbehebung:

#### A. Linting-Fehler beheben

**Schritt 1: Alle Fehler anzeigen**
```bash
cd mexc-sniper-bot

# Alle Linting-Fehler anzeigen
bun run lint --max-diagnostics 2000

# Ausgabe in Datei speichern zur Analyse
bun run lint --max-diagnostics 2000 > lint-errors.txt
```

**Schritt 2: Auto-Fix was möglich ist**
```bash
# Formatierung automatisch reparieren
bun run format

# Linting nochmal prüfen
bun run lint
```

**Schritt 3: Manuelle Fixes der häufigsten Fehler**

Basierend auf den Logs sind dies die Hauptprobleme:

**a) Optional Chaining-Problem:**
```typescript
// Datei: app/__tests__/inngest-mocks.ts:83

// FALSCH:
if (mockDb && mockDb.select) {

// RICHTIG:
if (mockDb?.select) {
```

**b) Unused Parameter:**
```typescript
// Datei: app/api/async-sniper/take-profit-monitor/route.ts:15

// FALSCH:
export const GET = apiAuthWrapper(async (request: NextRequest) => {

// RICHTIG:
export const GET = apiAuthWrapper(async (_request: NextRequest) => {
```

**c) TypeScript 'any' ersetzen:**
```typescript
// Dateien:
// - src/services/trading/service-conflict-detector.ts:154
// - src/services/trading/unified-auto-sniping-orchestrator.ts:224

// FALSCH:
(...args: any[]): {}
getExecutionReport(): any {

// RICHTIG:
(...args: unknown[]): {}
getExecutionReport(): unknown {
```

**Schritt 4: Alle Pre-Deployment-Checks lokal testen**
```bash
# Vollständige Pipeline testen (wie im CI)
bun run format:check && \
bun run lint && \
bun run type-check && \
bun run test
```

Wenn alle diese Befehle ✅ erfolgreich durchlaufen, können Sie deployen!

#### B. GitHub Actions updaten

**Datei bearbeiten:** `.github/workflows/deploy-rust.yml`

```bash
# Öffnen Sie die Datei
nano .github/workflows/deploy-rust.yml
# ODER
code .github/workflows/deploy-rust.yml
```

**Ändern Sie Zeile 54:**
```yaml
# VORHER:
- uses: actions/upload-artifact@v3

# NACHHER:
- uses: actions/upload-artifact@v4
```

**Ändern Sie Zeile 71:**
```yaml
# VORHER:
- uses: actions/download-artifact@v3

# NACHHER:
- uses: actions/download-artifact@v4
```

**Oder automatisch mit sed:**
```bash
sed -i 's/@v3/@v4/g' .github/workflows/deploy-rust.yml
```

#### C. GitHub Secrets überprüfen

Stellen Sie sicher, dass diese Secrets in GitHub konfiguriert sind:

**Settings → Secrets and variables → Actions → Repository secrets**

**Für Vercel:**
- `VERCEL_ORG_ID` - Ihre Vercel Organisation ID
- `VERCEL_PROJECT_ID` - Ihre Vercel Project ID
- `VERCEL_TOKEN` - Vercel Deployment Token

**Für AWS EC2 (Rust Backend):**
- `AWS_ACCESS_KEY_ID` - AWS Access Key
- `AWS_SECRET_ACCESS_KEY` - AWS Secret Key
- `AWS_ACCOUNT_ID` - AWS Account Nummer
- `AWS_EC2_IP` - EC2 Instanz IP-Adresse
- `AWS_SSH_PRIVATE_KEY` - SSH Private Key für EC2

**Für die App:**
- `MEXC_API_KEY` - MEXC API Key
- `MEXC_SECRET_KEY` - MEXC Secret Key
- `JWT_SECRET` - JWT Signing Secret

#### D. Fixes committen und pushen

```bash
# Alle Änderungen hinzufügen
git add .

# Commit mit aussagekräftiger Nachricht
git commit -m "fix: resolve linting errors and update GitHub Actions to v4"

# Zu main pushen
git push origin main
```

#### E. Deployment überwachen

```bash
# Mit GitHub CLI (gh muss installiert sein)
gh run list --workflow=deploy.yml --branch=main

# Specific run beobachten
gh run watch <RUN_ID>

# Logs ansehen
gh run view <RUN_ID> --log
```

**ODER im Browser:**
https://github.com/murks3r/mexc-sniper-bot/actions

### Nach erfolgreichem Deployment:

#### Vercel (Haupt-App):

Die Deployment-URL wird in den GitHub Actions Logs ausgegeben:

```
production-url=https://mexc-sniper-bot-xyz.vercel.app
```

**Zugriff auf die App:**
- Homepage: `https://mexc-sniper-bot-xyz.vercel.app/`
- Login: `https://mexc-sniper-bot-xyz.vercel.app/auth`
- Dashboard: `https://mexc-sniper-bot-xyz.vercel.app/dashboard`

#### AWS EC2 (Rust Backend):

**API-Endpunkte:**
- Health Check: `http://<EC2-IP>:8080/health`
- Ready Check: `http://<EC2-IP>:8080/ready`

**Health Check testen:**
```bash
# Ersetzen Sie <EC2-IP> mit Ihrer tatsächlichen IP
curl http://<EC2-IP>:8080/health

# Mit JSON-Formatierung
curl -s http://<EC2-IP>:8080/health | jq .
```

---

## 🆘 Häufige Probleme & Lösungen

### Problem: "Command 'bun' not found"

**Lösung:** Bun installieren
```bash
# Auf Linux/macOS:
curl -fsSL https://bun.sh/install | bash

# ODER npm verwenden stattdessen
npm install
npm run dev
```

### Problem: "Port 3008 already in use"

**Lösung:** Port freigeben oder anderen Port nutzen
```bash
# Prozess auf Port 3008 finden und beenden
lsof -ti:3008 | xargs kill -9

# ODER anderen Port nutzen
PORT=3009 bun run dev
```

### Problem: "Database connection failed"

**Lösung:** Datenbank-URL prüfen
```bash
# In .env.local:
# Für lokale Entwicklung mit SQLite:
DATABASE_URL=file:./mexc_sniper.db

# Für Supabase:
DATABASE_URL=postgresql://user:pass@host:5432/database?sslmode=require

# Migrationen erneut ausführen
bun run db:migrate
```

### Problem: "Clerk authentication error"

**Lösung:** Clerk-Keys überprüfen
1. Gehen Sie zu https://dashboard.clerk.com
2. Wählen Sie Ihr Projekt
3. Kopieren Sie die Keys von "API Keys"
4. Aktualisieren Sie `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
5. Server neu starten

### Problem: "Linting-Fehler nach dem Fix immer noch da"

**Lösung:** Cache löschen und neu testen
```bash
# Biome Cache löschen
rm -rf .biome-cache node_modules/.cache

# Dependencies neu installieren
rm -rf node_modules
bun install

# Erneut testen
bun run lint
```

---

## 📋 Checkliste: Bin ich bereit zu deployen?

Bevor Sie zu main pushen, stellen Sie sicher:

- [ ] ✅ `bun run format:check` läuft ohne Fehler durch
- [ ] ✅ `bun run lint` zeigt 0 Fehler
- [ ] ✅ `bun run type-check` ist erfolgreich
- [ ] ✅ `bun run test` - alle Tests bestehen
- [ ] ✅ `.github/workflows/deploy-rust.yml` nutzt `@v4` statt `@v3`
- [ ] ✅ Alle GitHub Secrets sind konfiguriert
- [ ] ✅ Lokaler Test war erfolgreich (App läuft auf localhost:3008)

Wenn alle Punkte ✅ sind → **Sie können deployen!**

---

## 🎯 Zusammenfassung

### ❌ Aktueller Status:
**Deployment ist NICHT erfolgreich** - Beide Cloud-Deployments schlagen fehl

### ✅ Sofort nutzen:
**Lokale Entwicklungsumgebung** - Funktioniert sofort ohne Fixes:
```bash
bun install
bun run db:migrate
make dev
# → Öffnen Sie: http://localhost:3008
```

### 🔧 Cloud-Deployment reparieren:
1. **Linting-Fehler beheben** (47 Fehler)
2. **GitHub Actions updaten** (v3 → v4)
3. **Secrets konfigurieren** in GitHub
4. **Testen, committen, pushen** zu main
5. **Deployment überwachen** in GitHub Actions
6. **App nutzen** über Vercel-URL

### 📞 Weitere Hilfe benötigt?

**Logs ansehen:**
```bash
# Neueste Workflow-Runs
gh run list --workflow=deploy.yml --branch=main

# Spezifischen Run Details
gh run view <RUN_ID> --log
```

**Oder teilen Sie mir mit:**
- GitHub Actions Run URL
- Fehlermeldungen aus Logs
- Wo Sie feststecken

**Vorhandene Dokumentation:**
- `DEPLOYMENT_INSPECTION_REPORT.md` - Technischer Bericht
- `DEPLOYMENT_REPORT_DE.md` - Deutsche Zusammenfassung
- `README.md` - Allgemeine Projektdokumentation

---

**Viel Erfolg! 🚀**

Bei Fragen stehe ich zur Verfügung.
