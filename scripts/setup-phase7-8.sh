#!/bin/bash
#
# Phase 7 & 8 Setup Helper
# Interaktives Script zum Sammeln und Überprüfen von Secrets
#
# Verwendung: bash scripts/setup-phase7-8.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Phase 7 & 8: Frontend API + GitHub Secrets ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# PHASE 7: Frontend API URL
# ============================================================================

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}PHASE 7: Frontend API URL Configuration${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -p "$(echo -e ${YELLOW}'Hat Phase 6 erfolgreich abgeschlossen? (EC2 läuft?) (j/n): '${NC})" phase6_done

if [[ "$phase6_done" != "j" ]]; then
    echo -e "${RED}❌ Phase 6 muss zuerst abgeschlossen sein!${NC}"
    exit 1
fi

echo ""
echo "🔍 Schritt 1: EC2 öffentliche IP-Adresse"
echo "  Gehe zu: AWS Console → EC2 → Instances → mexc-sniper-bot"
echo "  Kopiere: Public IPv4 address"
echo ""

read -p "$(echo -e ${BLUE}'Gib die EC2 IP-Adresse ein (z.B. 54.179.123.45): '${NC})" ec2_ip

# Validate IP format
if ! [[ $ec2_ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo -e "${RED}❌ Ungültiges IP-Format!${NC}"
    exit 1
fi

ec2_url="http://${ec2_ip}:8080"

echo -e "${GREEN}✓ EC2 URL: $ec2_url${NC}"
echo ""

# Test EC2 connectivity
echo "🔗 Teste Verbindung zu EC2..."
if curl -s -m 5 "$ec2_url/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ EC2 antwortet auf /health${NC}"
else
    echo -e "${YELLOW}⚠️  EC2 nicht erreichbar. Das ist OK wenn der Container noch nicht läuft.${NC}"
fi

echo ""
echo "📝 Schritt 2: NEXT_PUBLIC_API_URL in Vercel setzen"
echo "  Option A: Mit Vercel CLI"
echo "    $ vercel env add NEXT_PUBLIC_API_URL production"
echo "    Eingabe: $ec2_url"
echo ""
echo "  Option B: Via Web Dashboard"
echo "    1. Gehe zu: vercel.com → mexc-sniper-bot → Settings"
echo "    2. Environment Variables"
echo "    3. Erstelle Variable:"
echo "       Name: NEXT_PUBLIC_API_URL"
echo "       Value: $ec2_url"
echo "       Environments: Production ✓"
echo ""

read -p "$(echo -e ${BLUE}'Hast du NEXT_PUBLIC_API_URL in Vercel gesetzt? (j/n): '${NC})" vercel_done

if [[ "$vercel_done" != "j" ]]; then
    echo -e "${YELLOW}⚠️  Bitte setze die Variable in Vercel bevor du fortfährst!${NC}"
fi

echo -e "${GREEN}✓ Phase 7 vorbereitet!${NC}"
echo ""

# ============================================================================
# PHASE 8: GitHub Secrets
# ============================================================================

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}PHASE 8: GitHub Actions Secrets Setup${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Create temporary file for secrets
SECRETS_FILE="/tmp/github_secrets.txt"
> "$SECRETS_FILE"

declare -A secrets_map=(
    ["AWS_ACCOUNT_ID"]="12-stellige AWS Account ID"
    ["AWS_ACCESS_KEY_ID"]="AWS Access Key (beginnt mit AKIA)"
    ["AWS_SECRET_ACCESS_KEY"]="AWS Secret Key (lange Zeichenkette)"
    ["AWS_SSH_PRIVATE_KEY"]="SSH Private Key aus .pem Datei"
    ["AWS_EC2_IP"]="EC2 öffentliche IP-Adresse"
    ["MEXC_API_KEY"]="MEXC API Key"
    ["MEXC_SECRET_KEY"]="MEXC Secret Key"
    ["JWT_SECRET"]="JWT Secret (min. 32 Zeichen)"
)

echo "🔐 Secrets sammeln (Drücke Enter für interaktive Eingabe):"
echo ""

# Collect secrets
for secret_name in "${!secrets_map[@]}"; do
    description="${secrets_map[$secret_name]}"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Secret: $secret_name"
    echo "Beschreibung: $description"
    echo ""
    
    if [[ "$secret_name" == "AWS_SSH_PRIVATE_KEY" ]]; then
        echo "  📝 Wähle eine Option:"
        echo "  1. Datei laden (.pem)"
        echo "  2. Manuell eingeben"
        echo "  3. Überspringen (später manuell)"
        read -p "  Wahl (1-3): " choice
        
        if [[ "$choice" == "1" ]]; then
            read -p "  Pfad zur .pem Datei: " pem_file
            if [[ -f "$pem_file" ]]; then
                echo "$secret_name=" >> "$SECRETS_FILE"
                cat "$pem_file" | sed 's/$/\\n/' | tr -d '\n' >> "$SECRETS_FILE"
                echo "" >> "$SECRETS_FILE"
                echo -e "${GREEN}  ✓ Datei geladen${NC}"
            else
                echo -e "${RED}  ✗ Datei nicht gefunden!${NC}"
            fi
        else
            read -p "  Eingabe (oder Enter zum Überspringen): " secret_value
            if [[ -n "$secret_value" ]]; then
                echo "$secret_name=$secret_value" >> "$SECRETS_FILE"
            fi
        fi
    else
        # Validate specific secrets
        if [[ "$secret_name" == "AWS_ACCOUNT_ID" ]]; then
            read -p "  Eingabe (12 Ziffern): " secret_value
            if [[ ! $secret_value =~ ^[0-9]{12}$ ]]; then
                echo -e "${YELLOW}  ⚠️  Ungültiges Format (sollte 12 Ziffern sein)${NC}"
            fi
        elif [[ "$secret_name" == "JWT_SECRET" ]]; then
            read -p "  Eingabe (min. 32 Zeichen) oder 'generieren': " secret_value
            if [[ "$secret_value" == "generieren" ]]; then
                secret_value=$(openssl rand -base64 32)
                echo -e "${GREEN}  ✓ Generiert: $secret_value${NC}"
            fi
        else
            read -p "  Eingabe (oder Enter zum Überspringen): " secret_value
        fi
        
        if [[ -n "$secret_value" ]]; then
            echo "$secret_name=$secret_value" >> "$SECRETS_FILE"
            echo -e "${GREEN}  ✓ Gespeichert${NC}"
        fi
    fi
    echo ""
done

# ============================================================================
# Summary and GitHub Instructions
# ============================================================================

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Zusammenfassung                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

echo "📋 Gesammelte Secrets:"
cat "$SECRETS_FILE" | grep "=" | cut -d'=' -f1 | while read secret_name; do
    if [[ -n "$secret_name" ]]; then
        echo -e "  ${GREEN}✓${NC} $secret_name"
    fi
done

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "📌 Nächste Schritte: Secrets in GitHub eintragen"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "1️⃣  Gehe zu: https://github.com/RyanLisse/mexc-sniper-bot/settings/secrets/actions"
echo ""
echo "2️⃣  Klick: 'New repository secret' für jeden Secret:"
echo ""

cat "$SECRETS_FILE" | while IFS='=' read key value; do
    if [[ -n "$key" ]]; then
        if [[ "$key" == "AWS_SSH_PRIVATE_KEY" ]]; then
            echo "   Name: $key"
            echo "   Value: (Kompletter Inhalt der .pem Datei)"
        else
            echo "   Name: $key"
            echo "   Value: (Aus der Eingabe oben)"
        fi
        echo ""
    fi
done

echo "3️⃣  Verifizierung:"
echo ""
echo "   • Mache einen Commit zu backend-rust/"
echo "   • git push origin main"
echo "   • GitHub Actions sollte automatisch starten"
echo "   • Überprüfe: Actions → Rust Backend CI/CD → Details"
echo ""

echo "4️⃣  Nach erfolgreichem Deployment:"
echo ""
echo "   curl http://${ec2_ip}:8080/health"
echo ""

echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Phase 7 & 8 vorbereitet! ✓                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"

# Cleanup
rm -f "$SECRETS_FILE"

