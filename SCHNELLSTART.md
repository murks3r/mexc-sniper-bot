# ⚡ MEXC Sniper Bot - Schnellstart-Anleitung

## 🚨 DEPLOYMENT STATUS

```
┌─────────────────────────────────────────────┐
│                                             │
│   ❌ CLOUD-DEPLOYMENT FEHLGESCHLAGEN       │
│                                             │
│   ✅ LOKALE NUTZUNG FUNKTIONIERT           │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🚀 In 5 Minuten starten (Lokal)

```bash
# 1. Repository klonen
git clone https://github.com/murks3r/mexc-sniper-bot.git
cd mexc-sniper-bot

# 2. Abhängigkeiten installieren
bun install

# 3. Umgebung konfigurieren
cp .env.example .env.local
# → Bearbeiten Sie .env.local mit Ihren Clerk/Supabase Keys

# 4. Datenbank initialisieren
bun run db:migrate

# 5. App starten
make dev
```

**Fertig! Öffnen Sie:** http://localhost:3008

---

## 🌐 Interface aufrufen

### Lokale Entwicklung (Funktioniert JETZT):

```
┌────────────────────────────────────────────────┐
│ 🏠 Homepage                                    │
│ http://localhost:3008                          │
├────────────────────────────────────────────────┤
│ 🔐 Login/Registrierung                         │
│ http://localhost:3008/auth                     │
├────────────────────────────────────────────────┤
│ 📊 Trading Dashboard (nach Login)             │
│ http://localhost:3008/dashboard                │
├────────────────────────────────────────────────┤
│ ⚙️ Inngest Workflows                           │
│ http://localhost:8288                          │
└────────────────────────────────────────────────┘
```

### Cloud-Deployment (NICHT verfügbar):

```
┌────────────────────────────────────────────────┐
│ ❌ Vercel (Next.js App)                       │
│ Status: FEHLGESCHLAGEN                         │
│ Grund: 47 Linting-Fehler                      │
├────────────────────────────────────────────────┤
│ ❌ AWS EC2 (Rust Backend)                     │
│ Status: FEHLGESCHLAGEN                         │
│ Grund: Veraltete GitHub Actions (v3)          │
└────────────────────────────────────────────────┘
```

---

## 🔧 Cloud-Deployment reparieren

### Schnell-Fix:

```bash
# 1. Formatierung reparieren
bun run format

# 2. Linting prüfen
bun run lint

# 3. Tests ausführen
bun run test

# 4. GitHub Actions updaten
sed -i 's/@v3/@v4/g' .github/workflows/deploy-rust.yml

# 5. Committen und pushen
git add .
git commit -m "fix: resolve deployment blockers"
git push origin main
```

### Deployment überwachen:

```bash
# Browser:
https://github.com/murks3r/mexc-sniper-bot/actions

# ODER CLI:
gh run watch
```

---

## 📋 Erforderliche Umgebungsvariablen

### Minimum (für lokale Nutzung):

```bash
# .env.local

# Clerk (Kostenlos: https://clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase (Kostenlos: https://supabase.com)
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Datenbank (lokal)
DATABASE_URL=file:./mexc_sniper.db
```

### Optional (für echtes Trading):

```bash
# MEXC Exchange API
MEXC_API_KEY=...
MEXC_SECRET_KEY=...
MEXC_BASE_URL=https://api.mexc.com
```

---

## 🎮 Interface-Nutzung

### 1. **Erste Schritte:**
   - Öffnen Sie http://localhost:3008
   - Klicken Sie "Sign In"
   - Registrieren Sie sich mit E-Mail

### 2. **Dashboard-Features:**
   ```
   ┌─────────────────────────────────┐
   │ 📊 Trading Dashboard            │
   ├─────────────────────────────────┤
   │ • Snipe Targets erstellen       │
   │ • MEXC Calendar sync            │
   │ • Trading-Präferenzen           │
   │ • Position Monitoring           │
   │ • Execution History             │
   └─────────────────────────────────┘
   ```

### 3. **Typischer Workflow:**
   1. Dashboard öffnen
   2. MEXC Calendar synchronisieren
   3. Snipe Target auswählen
   4. Take Profit / Stop Loss einstellen
   5. Auto-Sniping aktivieren
   6. Positionen überwachen

---

## ❓ Häufige Fragen

### F: Kann ich die App jetzt nutzen?
**A:** ✅ **JA, lokal!** Starten Sie mit `make dev` und öffnen Sie http://localhost:3008

### F: Warum funktioniert die Cloud-URL nicht?
**A:** Das Deployment ist fehlgeschlagen wegen:
- 47 Linting-Fehler (blockiert Vercel)
- Veraltete GitHub Actions (blockiert EC2)

### F: Wie bekomme ich die Cloud-Version zum Laufen?
**A:** Folgen Sie der Anleitung in `WIE_DEPLOYEN_UND_NUTZEN.md`

### F: Brauche ich MEXC API Keys?
**A:** ❌ **Nein** für lokales Testen. ✅ **Ja** für echtes Trading.

### F: Wo finde ich detaillierte Fehler?
**A:** 
- `DEPLOYMENT_INSPECTION_REPORT.md` - Technischer Bericht
- `DEPLOYMENT_REPORT_DE.md` - Deutsche Zusammenfassung
- GitHub Actions: https://github.com/murks3r/mexc-sniper-bot/actions

---

## 🆘 Probleme?

### App startet nicht:
```bash
# Cache löschen
rm -rf node_modules .next
bun install
bun run dev
```

### Port bereits belegt:
```bash
# Prozess beenden
lsof -ti:3008 | xargs kill -9

# ODER anderen Port
PORT=3009 bun run dev
```

### Datenbank-Fehler:
```bash
# Migrationen erneut ausführen
bun run db:migrate
```

---

## 📚 Weitere Dokumentation

| Datei | Beschreibung |
|-------|--------------|
| `WIE_DEPLOYEN_UND_NUTZEN.md` | **Vollständige Anleitung** |
| `DEPLOYMENT_INSPECTION_REPORT.md` | Technische Analyse (EN) |
| `DEPLOYMENT_REPORT_DE.md` | Status-Zusammenfassung (DE) |
| `README.md` | Projekt-Übersicht |

---

## ✅ Checkliste für Deployment

- [ ] `bun run format:check` ✅
- [ ] `bun run lint` ✅ (0 Fehler)
- [ ] `bun run type-check` ✅
- [ ] `bun run test` ✅
- [ ] GitHub Actions auf v4 ✅
- [ ] GitHub Secrets konfiguriert ✅
- [ ] Lokal getestet ✅

**Alle ✅? → Pushen Sie zu main!**

---

**Stand:** 2026-01-30  
**Repository:** https://github.com/murks3r/mexc-sniper-bot

**Bei Fragen:** Siehe `WIE_DEPLOYEN_UND_NUTZEN.md` oder öffnen Sie ein Issue.
