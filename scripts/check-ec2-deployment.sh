#!/bin/bash
# EC2 Deployment Verification Script
# Prüft den Status der Deployment auf EC2-Instanz

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funktionen für farbigen Output
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Banner
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║   MEXC Sniper Bot - EC2 Deployment Verification          ║
║   Prüft Prozesse, Ports und Deployment-Status            ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# 1. System-Informationen
print_header "1. SYSTEM-INFORMATIONEN"

print_info "Hostname: $(hostname)"
print_info "Datum: $(date)"
print_info "Uptime: $(uptime -p 2>/dev/null || uptime)"
print_info "Kernel: $(uname -r)"

# 2. Netzwerk-Prozesse prüfen
print_header "2. NETZWERK-PROZESSE UND PORTS"

print_info "Prüfe welche Prozesse auf welchen Ports lauschen..."

# Prüfe ob ss oder netstat verfügbar ist
if command -v ss &> /dev/null; then
    print_success "Verwende 'ss' für Netzwerk-Analyse"
    echo -e "\nAktive Listening Ports:"
    ss -tulpn 2>/dev/null || {
        print_warning "ss benötigt Root-Rechte. Versuche ohne -p flag..."
        ss -tuln
    }
else
    print_warning "ss nicht verfügbar, verwende netstat"
    if command -v netstat &> /dev/null; then
        echo -e "\nAktive Listening Ports:"
        netstat -tulpen 2>/dev/null || {
            print_warning "netstat benötigt Root-Rechte. Versuche ohne -p flag..."
            netstat -tuln
        }
    else
        print_error "Weder ss noch netstat verfügbar!"
    fi
fi

# 3. Prüfe spezifische Ports
print_header "3. PORT-STATUS (22, 3000, 8080, 80)"

check_port() {
    local port=$1
    local description=$2
    
    if command -v ss &> /dev/null; then
        if ss -tuln | grep -q ":$port "; then
            print_success "Port $port ($description) ist aktiv"
            ss -tuln | grep ":$port "
        else
            print_warning "Port $port ($description) ist NICHT aktiv"
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tuln | grep -q ":$port "; then
            print_success "Port $port ($description) ist aktiv"
            netstat -tuln | grep ":$port "
        else
            print_warning "Port $port ($description) ist NICHT aktiv"
        fi
    else
        # Fallback: Versuche direkt zu verbinden
        if timeout 2 bash -c "</dev/tcp/localhost/$port" 2>/dev/null; then
            print_success "Port $port ($description) ist aktiv"
        else
            print_warning "Port $port ($description) ist NICHT aktiv"
        fi
    fi
}

check_port 22 "SSH"
check_port 3000 "Frontend/Next.js"
check_port 8080 "Backend/Rust API"
check_port 80 "HTTP/Nginx"

# 4. Docker Container Status
print_header "4. DOCKER CONTAINER STATUS"

if command -v docker &> /dev/null; then
    print_success "Docker ist installiert"
    
    echo -e "\nLaufende Container:"
    if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null; then
        docker_running=$?
        if [ $docker_running -eq 0 ]; then
            print_success "Docker Container erfolgreich abgefragt"
        fi
    else
        print_warning "Keine Docker-Rechte oder Docker Daemon läuft nicht"
        print_info "Versuche: sudo docker ps"
    fi
    
    echo -e "\nAlle Container (inkl. gestoppte):"
    docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || print_warning "Konnte Container nicht auflisten"
    
    # Prüfe spezifische Container
    echo -e "\nPrüfe MEXC Sniper Container:"
    if docker ps --format "{{.Names}}" | grep -q "mexc-sniper"; then
        print_success "MEXC Sniper Container läuft"
        docker ps --filter "name=mexc-sniper" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        
        # Zeige Logs der letzten 20 Zeilen
        echo -e "\nLetzte Log-Einträge:"
        docker logs --tail 20 $(docker ps --filter "name=mexc-sniper" --format "{{.Names}}" | head -1) 2>/dev/null || print_warning "Konnte Logs nicht abrufen"
    else
        print_warning "Kein MEXC Sniper Container läuft"
    fi
else
    print_error "Docker ist nicht installiert"
fi

# 5. Systemressourcen
print_header "5. SYSTEMRESSOURCEN"

echo -e "Memory Usage:"
free -h 2>/dev/null || {
    print_warning "free command nicht verfügbar"
    cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable" 2>/dev/null || print_error "Kann Memory Info nicht lesen"
}

echo -e "\nDisk Usage:"
df -h / 2>/dev/null || print_warning "df command nicht verfügbar"

echo -e "\nCPU Load:"
uptime

# 6. Node.js / PM2 Prozesse
print_header "6. NODE.JS / PM2 PROZESSE"

if command -v node &> /dev/null; then
    print_success "Node.js ist installiert: $(node --version)"
else
    print_warning "Node.js ist nicht installiert"
fi

if command -v pm2 &> /dev/null; then
    print_success "PM2 ist installiert"
    echo -e "\nPM2 Prozesse:"
    pm2 list 2>/dev/null || print_warning "PM2 kann nicht ausgeführt werden"
else
    print_info "PM2 ist nicht installiert (optional)"
fi

# 7. Rust Backend Binary
print_header "7. RUST BACKEND STATUS"

if pgrep -f "mexc-sniper" > /dev/null; then
    print_success "Rust Backend Prozess läuft"
    ps aux | grep -E "mexc-sniper|PID" | grep -v grep
else
    print_warning "Kein Rust Backend Prozess gefunden"
fi

# 8. Nginx / Web Server
print_header "8. WEBSERVER STATUS"

if command -v nginx &> /dev/null; then
    print_success "Nginx ist installiert"
    if pgrep nginx > /dev/null; then
        print_success "Nginx läuft"
        nginx -v 2>&1
    else
        print_warning "Nginx ist installiert aber läuft nicht"
    fi
else
    print_info "Nginx ist nicht installiert"
fi

# 9. Health Checks
print_header "9. HEALTH CHECKS"

print_info "Teste API-Endpunkte..."

# Backend Health Check
if command -v curl &> /dev/null; then
    echo -e "\nBackend Health (Port 8080):"
    if curl -f -s -m 5 http://localhost:8080/health 2>/dev/null; then
        print_success "Backend /health endpoint ist erreichbar"
    else
        print_warning "Backend /health endpoint nicht erreichbar"
    fi
    
    echo -e "\nBackend Ready (Port 8080):"
    if curl -f -s -m 5 http://localhost:8080/api/admin/ready 2>/dev/null; then
        print_success "Backend /api/admin/ready endpoint ist erreichbar"
    else
        print_warning "Backend /api/admin/ready endpoint nicht erreichbar"
    fi
    
    echo -e "\nFrontend (Port 3000):"
    if curl -f -s -m 5 http://localhost:3000 > /dev/null 2>&1; then
        print_success "Frontend ist erreichbar"
    else
        print_warning "Frontend ist nicht erreichbar"
    fi
else
    print_warning "curl nicht installiert, überspringe Health Checks"
fi

# 10. GitHub Actions Deployment Status (kann nur lokal gemacht werden)
print_header "10. DEPLOYMENT-INFORMATIONEN"

print_info "Um den letzten GitHub Actions Deploy-Status zu prüfen:"
echo -e "  1. Gehe zu: https://github.com/murks3r/mexc-sniper-bot/actions"
echo -e "  2. Prüfe die 'Deploy Pipeline' und 'Deploy Rust Backend to AWS EC2' Workflows"
echo -e "  3. Stelle sicher, dass der letzte Run erfolgreich war (grüner Haken)"

echo -e "\nAlternativ via GitHub CLI (gh):"
if command -v gh &> /dev/null; then
    print_success "GitHub CLI ist installiert"
    echo -e "\nLetzte Workflow Runs:"
    gh run list --limit 5 2>/dev/null || print_warning "Authentifizierung erforderlich: gh auth login"
else
    print_info "GitHub CLI nicht installiert. Installation: https://cli.github.com/"
fi

# 11. Zusammenfassung
print_header "11. ZUSAMMENFASSUNG"

echo -e "Deployment Checkliste:"
echo -e "  [ ] SSH (Port 22) ist erreichbar"
echo -e "  [ ] Frontend (Port 3000) läuft"
echo -e "  [ ] Backend (Port 8080) läuft"  
echo -e "  [ ] HTTP Server (Port 80) läuft (optional)"
echo -e "  [ ] Docker Container sind aktiv"
echo -e "  [ ] Systemressourcen sind OK (Memory, Disk, CPU)"
echo -e "  [ ] Health Checks sind erfolgreich"
echo -e "  [ ] GitHub Actions Deploy war erfolgreich"

print_header "NÄCHSTE SCHRITTE"

echo -e "Wenn Probleme gefunden wurden:"
echo -e ""
echo -e "1. ${YELLOW}Kein automatischer Deploy eingerichtet?${NC}"
echo -e "   → Prüfe .github/workflows/deploy.yml und deploy-rust.yml"
echo -e "   → Stelle sicher, dass GitHub Secrets konfiguriert sind"
echo -e ""
echo -e "2. ${YELLOW}Container laufen nicht?${NC}"
echo -e "   → Manuelles Deployment gemäß README:"
echo -e "     cd /pfad/zum/projekt"
echo -e "     docker-compose up -d"
echo -e "   oder für Rust Backend:"
echo -e "     siehe RUST_DEPLOYMENT_GUIDE.md"
echo -e ""
echo -e "3. ${YELLOW}Frontend läuft nicht?${NC}"
echo -e "   → Prüfe ob Node.js installiert ist"
echo -e "   → Starte mit: npm install && npm run build && npm start"
echo -e "   oder mit PM2: pm2 start npm --name mexc-frontend -- start"
echo -e ""
echo -e "4. ${YELLOW}Backend läuft nicht?${NC}"
echo -e "   → Prüfe Docker Container Logs: docker logs mexc-sniper-blue"
echo -e "   → Oder siehe Rust-Binary Status oben"
echo -e ""

print_success "Verification abgeschlossen!"
echo -e "\nWeitere Hilfe: Siehe README.md und RUST_DEPLOYMENT_GUIDE.md\n"
