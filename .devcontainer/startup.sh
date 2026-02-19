#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/workspaces/mexc-sniper-bot"
ENV_FILE="$WORKSPACE/.env.local"

echo "🚀 MEXC Sniper Bot – Container-Start"

# ─── .env.local anlegen falls nicht vorhanden ────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  .env.local nicht gefunden – erstelle minimale Vorlage..."
  cat > "$ENV_FILE" << 'EOF'
# ── Auth (Clerk) ─────────────────────────────
# Hol dir die Keys von https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder
CLERK_SECRET_KEY=sk_test_placeholder

# ── Datenbank ────────────────────────────────
# PostgreSQL / Supabase connection string
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mexc_sniper

# ── Supabase (optional) ──────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── MEXC API ─────────────────────────────────
MEXC_API_KEY=
MEXC_API_SECRET=

# ── Rust Backend ────────────────────────────
RUST_API_PORT=3009
RUST_API_URL=http://localhost:3009
EOF
  echo "✅ .env.local erstellt – bitte die fehlenden Werte eintragen!"
else
  echo "✅ .env.local gefunden"
fi

# ─── Dependencies installieren (falls node_modules fehlt) ────────────────────
if [ ! -d "$WORKSPACE/node_modules" ]; then
  echo "📦 Installiere npm-Pakete mit bun..."
  cd "$WORKSPACE" && bun install
else
  echo "✅ node_modules vorhanden"
fi

# ─── Next.js Dev-Server starten ──────────────────────────────────────────────
echo "🌐 Starte Next.js auf Port 3008..."
cd "$WORKSPACE"
exec bun run dev
