#!/usr/bin/env bash
set -euo pipefail

# setup-env-from-ssm.sh
# Lädt alle Secrets aus AWS SSM Parameter Store und generiert ${1:-.env.local}
# Verwendung: ./scripts/setup-env-from-ssm.sh [output-file] [ssm-prefix]
# Beispiel: ./scripts/setup-env-from-ssm.sh .env.local /app/mexc-sniper-bot

OUTPUT_FILE="${1:-.env.local}"
SSM_PREFIX="${2:-/app/mexc-sniper-bot}"

echo "📋 Lade Secrets aus AWS SSM Parameter Store ($SSM_PREFIX) → $OUTPUT_FILE"

# Helper function zum Laden von SSM-Parametern
get_ssm_param() {
  local param_name="$1"
  local param_value=$(aws ssm get-parameter \
    --name "$param_name" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")
  
  if [ -z "$param_value" ]; then
    echo "⚠️  Parameter $param_name nicht gefunden (optional)"
    return 1
  fi
  echo "$param_value"
}

# Leere Datei/Header
cat > "$OUTPUT_FILE" <<'EOF'
# Auto-generiert aus AWS SSM Parameter Store
# DO NOT COMMIT THIS FILE - es enthält Secrets!

EOF

# Required: MEXC Keys
echo "📌 Lade MEXC Secrets..."
MEXC_API_KEY=$(get_ssm_param "$SSM_PREFIX/mexc/api-key") || exit 1
MEXC_SECRET_KEY=$(get_ssm_param "$SSM_PREFIX/mexc/secret-key") || exit 1
echo "MEXC_API_KEY=$MEXC_API_KEY" >> "$OUTPUT_FILE"
echo "MEXC_SECRET_KEY=$MEXC_SECRET_KEY" >> "$OUTPUT_FILE"

# Required: Clerk Keys
echo "📌 Lade Clerk Secrets..."
CLERK_SECRET_KEY=$(get_ssm_param "$SSM_PREFIX/clerk/secret-key") || exit 1
CLERK_PUBLISHABLE_KEY=$(get_ssm_param "$SSM_PREFIX/clerk/publishable-key") || exit 1
echo "CLERK_SECRET_KEY=$CLERK_SECRET_KEY" >> "$OUTPUT_FILE"
echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY" >> "$OUTPUT_FILE"

# Optional: Supabase Keys
echo "📌 Lade Supabase Secrets..."
if SUPABASE_URL=$(get_ssm_param "$SSM_PREFIX/supabase/url"); then
  echo "SUPABASE_URL=$SUPABASE_URL" >> "$OUTPUT_FILE"
  echo "NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL" >> "$OUTPUT_FILE"
fi

if SUPABASE_ANON_KEY=$(get_ssm_param "$SSM_PREFIX/supabase/anon-key"); then
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> "$OUTPUT_FILE"
fi

if SUPABASE_SECRET_KEY=$(get_ssm_param "$SSM_PREFIX/supabase/secret-key"); then
  echo "SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY" >> "$OUTPUT_FILE"
fi

if SUPABASE_SERVICE_ROLE_KEY=$(get_ssm_param "$SSM_PREFIX/supabase/service-role-key"); then
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" >> "$OUTPUT_FILE"
fi

# Optional: OpenAI Key
echo "📌 Lade OpenAI Secrets..."
if OPENAI_API_KEY=$(get_ssm_param "$SSM_PREFIX/openai/api-key"); then
  echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> "$OUTPUT_FILE"
fi

# Non-sensitive Env Vars
echo "📌 Setze Non-Sensitive Variablen..."
echo "NODE_ENV=production" >> "$OUTPUT_FILE"
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" >> "$OUTPUT_FILE"
echo "DATABASE_URL=${DATABASE_URL:-}" >> "$OUTPUT_FILE"

# Restrict file permissions (prod-szenario)
chmod 600 "$OUTPUT_FILE"

echo "✅ $OUTPUT_FILE erfolgreich generiert!"
echo "⚠️  WICHTIG: Diese Datei enthält Secrets - nicht committen!"
