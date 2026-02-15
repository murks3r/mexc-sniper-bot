#!/usr/bin/env bash
set -euo pipefail

# run-ec2-fix.sh
# Automatisches Merge + EC2/Docker-Fixes fuer murks3r/mexc-sniper-bot
# Verwendung: chmod +x run-ec2-fix.sh && ./run-ec2-fix.sh
# Autor: Copilot assistant (Anpassung fuer Codespaces)

REPO_ROOT="$(pwd)"
BACKUP_BRANCH="main-backup-before-ec2"
MERGE_SOURCE_BRANCH="copilot/remove-vercel-ai-docs"
FIX_BRANCH="fix/ec2-docker-paths"
PR_TITLE="[WIP] EC2 deployment: merge ${MERGE_SOURCE_BRANCH} -> main + fix Docker contexts"
PR_BODY="Automated PR: merge ${MERGE_SOURCE_BRANCH} into main and apply EC2/Docker fixes (Cargo time lock, Dockerfile.frontend, docker-compose.prod.yml, nginx.conf, .dockerignore, next.config.ts, docs). Run validations locally in Codespaces."

# Files/dirs to move to removed-backup/ (safer than delete)
REMOVE_PATHS=(
  "vercel.json"
  "public/vercel.svg"
  "scripts/setup-vercel-cron.md"
  "scripts/get-cron-secret.sh"
  "scripts/setup-cron-jobs.sql"
  ".claude"
  ".codex"
  ".cursor"
  ".daddy"
  ".factory"
  ".opencode"
  ".qlty"
  ".roo"
  ".serena"
  ".roomodes"
  "AGENT.md"
  "AGENTS.md"
  "CLAUDE.md"
  "ANSWER_YOUR_QUESTION.md"
  "YOUR_QUESTION_ANSWERED.md"
  "ALL_PHASE_7_8_FILES_READY.md"
  "DOCUMENTATION_INDEX_PHASE_7_8.md"
  "PHASE_7_8_COMPLETE_ANSWER.md"
  "PHASE_7_8_QUICK_CHECKLIST.md"
  "PHASE_7_8_SECRETS_CHECKLIST.md"
  "PHASE_7_8_START_HERE.md"
  "full-test-output.txt"
  "test-results.xml"
  "empty-module.js"
  ".mcp.json"
)

echo "1) Sicherstellen: Arbeitsverzeichnis ist ein git-Repo und clean"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Fehler: Das aktuelle Verzeichnis ist kein Git-Repository." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Arbeitsverzeichnis ist nicht sauber. Bitte stash/commit lokal zuerst." >&2
  git status --porcelain
  exit 1
fi

echo "2) Backup-Branch anlegen ($BACKUP_BRANCH)"
git fetch origin main:main
git branch -f "$BACKUP_BRANCH" main
git push -u origin "$BACKUP_BRANCH"

echo "3) Merge-Versuch: $MERGE_SOURCE_BRANCH → main (lokal)"
git checkout main
git pull origin main

# Fetch the source branch
git fetch origin "$MERGE_SOURCE_BRANCH":"$MERGE_SOURCE_BRANCH" || true

if git merge --no-ff --no-commit "$MERGE_SOURCE_BRANCH"; then
  echo "Merge erfolgreich (keine Konflikte). Commit und weiter."
  git commit -m "Merge ${MERGE_SOURCE_BRANCH} -> main (automated)"
else
  echo "Merge hat Konflikte. Bitte loese die Konflikte manuell in Codespaces:"
  echo "  git status"
  echo "  # bearbeite die Konflikt-Dateien"
  echo "  git add <resolved-files>"
  echo "  git commit"
  echo "Danach weiter mit diesem Skript oder manuell fortfahren."
  exit 2
fi

echo "4) Erstelle Feature-Branch fuer Fixes: $FIX_BRANCH"
git checkout -b "$FIX_BRANCH"

echo "5) Dateien sichern (verschieben) - moved to removed-backup/"
mkdir -p removed-backup
for p in "${REMOVE_PATHS[@]}"; do
  if [ -e "$p" ] || git ls-files --error-unmatch "$p" >/dev/null 2>&1; then
    echo "  Sichern: $p"
    # try git mv if tracked, else mv
    if git ls-files --error-unmatch "$p" >/dev/null 2>&1; then
      mkdir -p "removed-backup/$(dirname "$p")"
      git mv -f "$p" "removed-backup/$p" || true
    else
      mkdir -p "removed-backup/$(dirname "$p")"
      mv -f "$p" "removed-backup/$p" || true
    fi
  fi
done

# If any files were moved with git, they are staged. If not, no-op.
git add -A removed-backup || true

echo "6) Update backend-rust/Cargo.toml -> lock 'time' and AWS SDK versions"
CARGO_TOML="backend-rust/Cargo.toml"
if [ ! -f "$CARGO_TOML" ]; then
  echo "Fehler: $CARGO_TOML nicht gefunden!" >&2
  exit 1
fi

# Add or replace entries in [dependencies]
python3 - <<'PY'
import re,sys
fn="backend-rust/Cargo.toml"
text=open(fn,'r',encoding='utf-8').read()
# Ensure [dependencies] exists
if "[dependencies]" not in text:
    text = "[dependencies]\n\n" + text
# Replace or ensure lines
def upsert(k,v):
    global text
    # pattern for e.g. time = "..."
    pat=re.compile(r'^\s*'+re.escape(k)+r'\s*=\s*".*"$', re.MULTILINE)
    line=f'{k} = "{v}"'
    if pat.search(text):
        text=pat.sub(line, text)
    else:
        # insert after [dependencies]
        text=text.replace("[dependencies]", "[dependencies]\n"+line+"\n",1)
upsert("time","=0.3.36")
upsert("aws-config","1.1.0")
upsert("aws-sdk-dynamodb","1.12.0")
open(fn,'w',encoding='utf-8').write(text)
print("Updated",fn)
PY

git add "$CARGO_TOML"

echo "7) Erzeuge/Ersetze Dockerfile.frontend (root)"
cat > Dockerfile.frontend <<'EOF'
# Frontend multi-stage Dockerfile (build from repo root)
FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN npm install -g bun@stable
RUN bun install --frozen-lockfile

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Runner (standalone output)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S next && adduser -S next -G next

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER next
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
EOF
git add Dockerfile.frontend

echo "8) Erzeuge/Ersetze docker-compose.prod.yml (root)"
cat > docker-compose.prod.yml <<'EOF'
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://backend:8080
    depends_on:
      - backend
    restart: unless-stopped

  backend:
    build:
      context: ./backend-rust
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - RUST_LOG=info
      - DATABASE_URL=${DATABASE_URL}
      - MEXC_API_KEY=${MEXC_API_KEY}
      - MEXC_SECRET_KEY=${MEXC_SECRET_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped
EOF
git add docker-compose.prod.yml

echo "9) Erzeuge/Ersetze nginx.conf (root)"
cat > nginx.conf <<'EOF'
events { worker_connections 1024; }

http {
  upstream frontend { server frontend:3000; }
  upstream backend  { server backend:8080; }

  server {
    listen 80;
    server_name _;

    location / {
      proxy_pass http://frontend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
  }
}
EOF
git add nginx.conf

echo "10) Erzeuge/aktualisiere .dockerignore (root)"
cat > .dockerignore <<'EOF'
node_modules
.next
.git
.DS_Store
.vscode
.env.local
.env.production
backend-rust
docs
*.md
EOF
git add .dockerignore

echo "11) Erzeuge backend-rust/.dockerignore"
mkdir -p backend-rust
cat > backend-rust/.dockerignore <<'EOF'
target
.git
.DS_Store
*.md
EOF
git add backend-rust/.dockerignore

echo "12) Update next.config.ts (ersetzen/backup)"
if [ -f next.config.ts ]; then
  cp next.config.ts next.config.ts.bak || true
fi
cat > next.config.ts <<'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: process.cwd(),
  },
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
EOF
git add next.config.ts
[ -f next.config.ts.bak ] && git add next.config.ts.bak || true

echo "13) Erstelle docs/DIRECTORY_STRUCTURE.md"
mkdir -p docs
cat > docs/DIRECTORY_STRUCTURE.md <<'EOF'
# Projekt-Struktur - final (EC2 / Docker)

mexc-sniper-bot/
├── app/                      # Next.js app (falls verwendet)
├── src/                      # Frontend source (falls verwendet)
├── public/                   # Static assets
├── backend-rust/             # Rust backend (self-contained)
│   ├── src/
│   ├── Cargo.toml            # time = "=0.3.36"
│   └── Dockerfile
├── Dockerfile.frontend       # Frontend multi-stage build (context = root)
├── docker-compose.prod.yml   # Production orchestration (frontend/backend/nginx)
├── nginx.conf                # Reverse proxy config for Docker
├── .dockerignore             # Exclude files from frontend build
├── backend-rust/.dockerignore
├── docs/                     # Documentation (incl. DIRECTORY_STRUCTURE.md)
└── package.json              # Frontend dependencies

Build contexts:
- Frontend: context = `.` (root)
- Backend: context = `./backend-rust`
- Nginx: mounts `./nginx.conf`
EOF
git add docs/DIRECTORY_STRUCTURE.md

echo "14) Commit changes"
git commit -m "chore(ec2): remove Vercel/AI artifacts (moved to removed-backup) and add EC2 Docker fixes (Dockerfile.frontend, docker-compose.prod.yml, nginx.conf, .dockerignore, next.config.ts, docs, Cargo.toml time lock)"

echo "15) Push Branch and open PR"
git push --set-upstream origin "$FIX_BRANCH"

# Try to open PR with gh if available
if command -v gh >/dev/null 2>&1; then
  echo "Oeffne PR via GitHub CLI..."
  gh pr create --title "$PR_TITLE" --body "$PR_BODY" --base main --head "$FIX_BRANCH" --reviewer @me || true
  echo "PR erstellt (oder existierte bereits). Bitte im Browser pruefen."
else
  echo "GitHub CLI (gh) nicht gefunden. Bitte PR manuell erstellen:"
  echo "  git push origin $FIX_BRANCH"
  echo "  then create a PR from $FIX_BRANCH -> main in GitHub UI"
fi

echo "16) Validations (lokal in Codespaces) - optional, wird ausgefuehrt wenn Tools vorhanden sind"
echo "  16.1) Rust check (backend-rust)"
if command -v cargo >/dev/null 2>&1; then
  echo "    running: cargo check (backend-rust)"
  (cd backend-rust && cargo check) || echo "cargo check failed (see above)"
else
  echo "    cargo not found in PATH (skip Rust check)"
fi

echo "  16.2) Docker build tests (frontend & backend)"
if command -v docker >/dev/null 2>&1; then
  echo "    building frontend image..."
  docker build -f Dockerfile.frontend -t mexc-frontend:pr-test . || echo "docker build frontend failed"
  echo "    building backend image..."
  docker build -f backend-rust/Dockerfile -t mexc-backend:pr-test ./backend-rust || echo "docker build backend failed"
  echo "    building compose..."
  docker-compose -f docker-compose.prod.yml build || echo "docker-compose build failed"
else
  echo "    docker not found (skip Docker builds)"
fi

echo "Fertig. PR wurde erstellt (falls gh verfuegbar). Bitte oeffne die PR in GitHub und ueberpruefe CI."
echo ""
echo "Naechste Schritte:"
echo " - Falls CI fehlschlaegt, pruefe die Logs und loese Probleme lokal in Codespaces."
echo " - Moegliche manuelle Merge-Konfliktloesung: git checkout main; git merge <branch>; loese Konflikte; git commit; git push"
echo ""
echo "Hinweis: Wenn du moechtest, kann ich weitere Automatisierungen (z.B. CI-Konfigs) vorbereiten."

echo "Repo root: $REPO_ROOT"
exit 0
