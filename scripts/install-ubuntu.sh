#!/usr/bin/env bash
# LokSystem Ubuntu / Debian installer.
#
# Features:
#   1. Detects the current CPU architecture (amd64 / arm64)
#   2. Downloads a specific or latest GitHub release .deb package
#   3. Installs the package and repairs missing dependencies
#   4. Installs Xvfb and related libraries for headless mode
#   5. Creates a helper script at /opt/LokSystem/start-loksystem.sh
#   6. Optionally creates a systemd service for headless mode
#   7. Creates a desktop entry for the current user
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/iOfficeAI/LokSystem/main/scripts/install-ubuntu.sh | bash
#   LOKSYSTEM_VERSION=1.8.25 bash install-ubuntu.sh
#   LOKSYSTEM_MODE=desktop bash install-ubuntu.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SUDO=''
DEB_ARCH=''
VERSION=''
MODE=''
DEB_FILENAME=''
DOWNLOAD_URL=''
DEB_PATH=''

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

cleanup() {
    if [[ -n "${DEB_PATH:-}" ]]; then
        rm -rf "$(dirname "$DEB_PATH")" 2>/dev/null || true
    fi
}
trap cleanup EXIT

banner() {
    echo -e "${CYAN}${BOLD}=============================================="
    echo "      LokSystem Installer for Ubuntu"
    echo "==============================================${NC}"
}

check_prerequisites() {
    [[ "$(uname -s)" == "Linux" ]] || die "This installer only supports Linux."
    command -v apt-get >/dev/null 2>&1 || die "This installer requires apt-get (Debian/Ubuntu)."

    if [[ $EUID -ne 0 ]]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO='sudo'
            warn "Running without root; sudo will be used for privileged steps."
        else
            die "Please run as root or install sudo first."
        fi
    fi
}

detect_arch() {
    local machine
    machine="$(uname -m)"
    case "$machine" in
        x86_64|amd64)
            DEB_ARCH='amd64'
            ;;
        aarch64|arm64)
            DEB_ARCH='arm64'
            ;;
        *)
            die "Unsupported architecture: $machine (expected x86_64/amd64 or aarch64/arm64)."
            ;;
    esac

    info "Detected architecture: ${BOLD}${machine}${NC} -> package arch ${BOLD}${DEB_ARCH}${NC}"
}

resolve_version() {
    if [[ -n "${LOKSYSTEM_VERSION:-}" ]]; then
        VERSION="$LOKSYSTEM_VERSION"
        info "Using requested version: ${BOLD}v${VERSION}${NC}"
    else
        info "Resolving latest LokSystem release..."
        if command -v curl >/dev/null 2>&1; then
            VERSION="$(curl -fsSL 'https://api.github.com/repos/iOfficeAI/LokSystem/releases/latest' | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')"
        elif command -v wget >/dev/null 2>&1; then
            VERSION="$(wget -qO- 'https://api.github.com/repos/iOfficeAI/LokSystem/releases/latest' | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')"
        else
            die "Install curl or wget before running this script."
        fi

        [[ -n "$VERSION" ]] || die "Unable to resolve the latest release. Set LOKSYSTEM_VERSION manually, for example: LOKSYSTEM_VERSION=1.8.25 bash $0"
        info "Latest release: ${BOLD}v${VERSION}${NC}"
    fi

    DEB_FILENAME="LokSystem-${VERSION}-linux-${DEB_ARCH}.deb"
    DOWNLOAD_URL="https://github.com/iOfficeAI/LokSystem/releases/download/v${VERSION}/${DEB_FILENAME}"
}

download_deb() {
    local tmpdir
    tmpdir="$(mktemp -d)"
    DEB_PATH="${tmpdir}/${DEB_FILENAME}"

    info "Downloading ${BOLD}${DEB_FILENAME}${NC}"
    info "Source: ${DOWNLOAD_URL}"

    if command -v curl >/dev/null 2>&1; then
        curl -fSL --progress-bar -o "$DEB_PATH" "$DOWNLOAD_URL" || die "Download failed."
    else
        wget --show-progress -q -O "$DEB_PATH" "$DOWNLOAD_URL" || die "Download failed."
    fi

    success "Download complete: $(du -h "$DEB_PATH" | cut -f1)"
}

install_deb() {
    info "Installing LokSystem package..."
    $SUDO dpkg -i "$DEB_PATH" 2>/dev/null || true

    info "Repairing dependencies..."
    $SUDO apt-get install -f -y

    success "LokSystem v${VERSION} installed"

    if command -v LokSystem >/dev/null 2>&1 || [[ -x /usr/bin/LokSystem ]]; then
        success "Binary available at $(command -v LokSystem 2>/dev/null || echo '/usr/bin/LokSystem')"
    else
        warn "Installation completed, but the LokSystem binary was not found in the expected path."
    fi
}

install_headless_deps() {
    info "Installing headless dependencies..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y --no-install-recommends \
        xvfb \
        libxkbcommon-x11-0 \
        libgtk-3-0 \
        libnotify4 \
        libnss3 \
        libxss1 \
        libasound2 \
        libgbm1 \
        >/dev/null
    success "Headless dependencies installed"
}

create_service_script() {
    local script_dir='/opt/LokSystem'
    local script_path="${script_dir}/start-loksystem.sh"

    info "Creating helper script: ${script_path}"
    $SUDO mkdir -p "$script_dir"

    $SUDO tee "$script_path" >/dev/null <<'SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

PIDFILE='/var/run/loksystem.pid'
LOGFILE='/var/log/loksystem.log'
WORKDIR="${LOKSYSTEM_WORKDIR:-$HOME}"

start() {
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "LokSystem is already running (PID: $(cat "$PIDFILE"))"
        return 1
    fi

    echo "Starting LokSystem WebUI..."
    cd "$WORKDIR" || exit 1

    nohup xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' \
        /usr/bin/LokSystem --webui --remote --no-sandbox \
        >"$LOGFILE" 2>&1 &

    echo $! >"$PIDFILE"
    sleep 3

    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        local ip
        ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
        echo "LokSystem started successfully (PID: $(cat "$PIDFILE"))"
        echo "WebUI: http://${ip:-localhost}:25808"
    else
        echo "LokSystem failed to start. Check logs: $LOGFILE"
        rm -f "$PIDFILE"
        return 1
    fi
}

stop() {
    if [[ ! -f "$PIDFILE" ]]; then
        echo "LokSystem is not running"
        return 1
    fi

    local pid
    pid="$(cat "$PIDFILE")"
    echo "Stopping LokSystem (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -9 "$pid" 2>/dev/null || true
    pkill -f 'LokSystem --webui' 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "LokSystem stopped"
}

restart() {
    stop || true
    sleep 1
    start
}

status() {
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "LokSystem is running (PID: $(cat "$PIDFILE"))"
        ss -tlnp 2>/dev/null | grep 25808 || netstat -tlnp 2>/dev/null | grep 25808 || true
    else
        echo "LokSystem is not running"
        rm -f "$PIDFILE" 2>/dev/null || true
    fi
}

logs() {
    if [[ -f "$LOGFILE" ]]; then
        tail -f "$LOGFILE"
    else
        echo "Log file not found: $LOGFILE"
    fi
}

case "${1:-}" in
    start) start ;;
    stop) stop ;;
    restart) restart ;;
    status) status ;;
    logs) logs ;;
    '')
        echo "Usage: start-loksystem.sh {start|stop|restart|status|logs}"
        echo "Environment variables:"
        echo "  LOKSYSTEM_WORKDIR  LokSystem working directory (default: \$HOME)"
        ;;
    *)
        echo "Usage: start-loksystem.sh {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
SCRIPT_EOF

    $SUDO chmod +x "$script_path"
    success "Helper script created: ${script_path}"
}

create_systemd_service() {
    if ! command -v systemctl >/dev/null 2>&1; then
        info "systemd not available; skipping service creation."
        return
    fi

    local service_path='/etc/systemd/system/loksystem.service'
    info "Creating systemd service: ${service_path}"

    $SUDO tee "$service_path" >/dev/null <<'SERVICE_EOF'
[Unit]
Description=LokSystem AI Agent Desktop App (WebUI Mode)
Documentation=https://github.com/iOfficeAI/LokSystem
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/bin/xvfb-run --auto-servernum --server-args=-screen\ 0\ 1920x1080x24 /usr/bin/LokSystem --webui --remote --no-sandbox
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    $SUDO systemctl daemon-reload
    success "systemd service created"
    echo "  sudo systemctl start loksystem"
    echo "  sudo systemctl stop loksystem"
    echo "  sudo systemctl enable loksystem"
    echo "  sudo systemctl status loksystem"
    echo "  journalctl -u loksystem -f"
}

create_desktop_entry() {
    local desktop_dir="${HOME}/.local/share/applications"
    local desktop_file="${desktop_dir}/loksystem.desktop"

    mkdir -p "$desktop_dir"

    cat >"$desktop_file" <<'DESKTOP_EOF'
[Desktop Entry]
Name=LokSystem
Comment=AI Agent Cowork Platform
Exec=/usr/bin/LokSystem --no-sandbox %U
Icon=LokSystem
Terminal=false
Type=Application
Categories=Office;Utility;Development;
MimeType=x-scheme-handler/loksystem;
StartupWMClass=LokSystem
DESKTOP_EOF

    success "Desktop entry created: ${desktop_file}"
}

print_summary() {
    echo
    echo -e "${GREEN}${BOLD}LokSystem v${VERSION} installation complete${NC}"
    echo "  Binary:  /usr/bin/LokSystem"
    echo "  Helper:  /opt/LokSystem/start-loksystem.sh"
    echo

    if [[ "$MODE" == 'headless' ]]; then
        echo "Headless mode commands:"
        echo "  /opt/LokSystem/start-loksystem.sh start"
        echo "  /opt/LokSystem/start-loksystem.sh status"
        echo "  /opt/LokSystem/start-loksystem.sh stop"
        if command -v systemctl >/dev/null 2>&1; then
            echo "  sudo systemctl start loksystem"
            echo "  sudo systemctl enable loksystem"
        fi
        echo "  WebUI default URL: http://localhost:25808"
        echo "  Optional workdir: export LOKSYSTEM_WORKDIR=/path/to/workspace"
    else
        echo "Desktop mode command:"
        echo "  LokSystem --no-sandbox"
    fi

    echo "  Docs:   https://github.com/iOfficeAI/LokSystem"
    echo "  Issues: https://github.com/iOfficeAI/LokSystem/issues"
}

main() {
    banner
    MODE="${LOKSYSTEM_MODE:-headless}"
    case "$MODE" in
        headless|desktop) ;;
        *) die "Unsupported LOKSYSTEM_MODE: $MODE (expected headless or desktop)." ;;
    esac

    info "Install mode: ${BOLD}${MODE}${NC}"
    check_prerequisites
    detect_arch
    resolve_version
    download_deb
    install_deb

    if [[ "$MODE" == 'headless' ]]; then
        install_headless_deps
        create_service_script
        create_systemd_service
    fi

    create_desktop_entry
    print_summary
}

main "$@"
