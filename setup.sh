#!/bin/bash
#
# Dotfiles Automatic Setup Script - Hardened & Safe Version
#
# Expected: apps.list, snap-apps.list in same directory as this script
#

# --- Robustness Flags ---
set -euo pipefail
IFS=$'\n\t'

# --- Ensure PATH is sane ---
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# --- Trap for errors ---
trap 'log_error "❌ An unexpected error occurred at line $LINENO (exit code: $?). Exiting..."; exit 1' ERR

# --- Global Settings ---
DOTFILES_DIR="$(dirname "$(realpath "$0")")"
PACKAGE_MANAGER=""
SHELL_CONFIG_FILE="${SHELL_CONFIG_FILE:-$HOME/.bashrc}"
PACKAGE_MANAGER_UPDATE_DONE=false

# --- Colors ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# --- Check for sudo privileges ---
if ! sudo -v &>/dev/null; then
    log_error "This script requires sudo privileges. Please run with a user that can use sudo."
    exit 1
fi

# --- Ensure shell config file exists ---
if [ ! -f "$SHELL_CONFIG_FILE" ]; then
    touch "$SHELL_CONFIG_FILE"
    log_warning "$SHELL_CONFIG_FILE not found. Created an empty file."
fi

# --- Detect Package Manager ---
detect_package_manager() {
    if command -v apt &>/dev/null; then
        PACKAGE_MANAGER="apt"
    elif command -v dnf &>/dev/null; then
        PACKAGE_MANAGER="dnf"
    elif command -v pacman &>/dev/null; then
        PACKAGE_MANAGER="pacman"
    elif command -v zypper &>/dev/null; then
        PACKAGE_MANAGER="zypper"
    else
        log_error "No supported package manager found (apt, dnf, pacman, zypper)."
        exit 1
    fi
    log_success "Detected package manager: $PACKAGE_MANAGER"
}

# --- Initial Update & Upgrade ---
run_initial_update() {
    if [ "$PACKAGE_MANAGER_UPDATE_DONE" = true ]; then
        return
    fi

    log_success "Running initial package list update and upgrade..."
    case "$PACKAGE_MANAGER" in
        apt)
            sudo apt update -y
            sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y
            ;;
        dnf|zypper)
            sudo "$PACKAGE_MANAGER" check-update || true
            ;;
        pacman)
            sudo pacman -Sy --noconfirm
            ;;
        *)
            log_error "Update failed: Unknown package manager operation."
            exit 1
            ;;
    esac

    PACKAGE_MANAGER_UPDATE_DONE=true
}

# --- Dependency Check ---
check_and_install_core_deps() {
    local dependency="$1"
    local package_name="$2"
    if ! command -v "$dependency" &>/dev/null; then
        log_warning "$dependency not installed. Installing $package_name..."
        run_initial_update
        case "$PACKAGE_MANAGER" in
            pacman)
                sudo pacman -S --noconfirm "$package_name" || { log_error "Failed to install $dependency"; exit 1; }
                ;;
            *)
                sudo "$PACKAGE_MANAGER" install -y "$package_name" || { log_error "Failed to install $dependency"; exit 1; }
                ;;
        esac
        log_success "$dependency installed successfully."
    fi
}

# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 1. DOTFILES REPOSITORY LOCATED AND VERIFIED =====${NC}"
detect_package_manager
check_and_install_core_deps "git" "git"
check_and_install_core_deps "curl" "curl"
log_success "Dotfiles directory: $DOTFILES_DIR"

# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 2. INSTALLING SYSTEM PACKAGES ($PACKAGE_MANAGER) =====${NC}"
APPS_LIST="$DOTFILES_DIR/apps.list"
if [ -f "$APPS_LIST" ]; then
    run_initial_update
    log_success "Installing packages from $APPS_LIST..."
    if [ "$PACKAGE_MANAGER" = "pacman" ]; then
        grep -vE '^\s*#|^\s*$' "$APPS_LIST" | xargs -r -n1 sudo pacman -S --noconfirm || true
    else
        grep -vE '^\s*#|^\s*$' "$APPS_LIST" | xargs -r -n1 sudo "$PACKAGE_MANAGER" install -y || true
    fi
    log_success "System package installation complete."
else
    log_warning "$APPS_LIST not found. Skipping system packages."
fi

# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 3. DEPLOYING CONFIGURATION FILES =====${NC}"
log_warning "Symlinking your configs is recommended over copying."
# Example:
# ln -sf "$DOTFILES_DIR/bashrc" "$HOME/.bashrc"
# ln -sf "$DOTFILES_DIR/config/i3" "$HOME/.config/i3"

# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 4. INSTALLING SNAP APPLICATIONS =====${NC}"
SNAP_APPS_LIST="$DOTFILES_DIR/snap-apps.list"
if [ -f "$SNAP_APPS_LIST" ]; then
    check_and_install_core_deps "snap" "snapd"
    if command -v systemctl &>/dev/null; then
        sudo systemctl enable --now snapd.socket || log_warning "snapd.socket enable failed (may already be active)"
    fi

    while IFS= read -r line || [ -n "$line" ]; do
        # Remove comments and trim whitespace
        app="${line%%#*}"
        app="$(echo "$app" | xargs)"
        [ -z "$app" ] && continue

        # Detect --classic flag
        snap_flags=""
        if [[ "$app" == *"--classic"* ]]; then
            snap_flags="--classic"
            app="${app%%--classic*}"  # Remove --classic from app name
            app="$(echo "$app" | xargs)"
        fi

        # Check if already installed
        if ! snap list | grep -q "^$app "; then
            log_success "Installing Snap app: $app $snap_flags"
            sudo snap install "$app" $snap_flags || log_warning "Failed to install $app (continuing)"
        else
            log_success "Snap app $app already installed."
        fi
    done < "$SNAP_APPS_LIST"
else
    log_warning "$SNAP_APPS_LIST not found. Skipping Snap installation."
fi

# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 5. INSTALLING BUN.JS =====${NC}"
if ! command -v bun &>/dev/null; then
    if curl -fsSL https://bun.sh/install | bash; then
        log_success "Bun.js installed successfully."
    else
        log_error "Bun.js installation failed."
    fi
else
    log_success "Bun.js already installed."
fi

# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 6. CONFIGURE GNOME DASH-TO-DOCK =====${NC}"
if command -v gsettings &>/dev/null; then
    log_success "Setting Dash-to-Dock click-action to 'minimize'..."
    gsettings set org.gnome.shell.extensions.dash-to-dock click-action 'minimize' && \
        log_success "Dash-to-Dock configuration applied successfully."
else
    log_warning "gsettings not found. Skipping Dash-to-Dock configuration."
fi

# -----------------------------------------------------------
echo -e "\n${GREEN}***************************************************${NC}"
log_success "SETUP COMPLETED SUCCESSFULLY!"


# -----------------------------------------------------------
echo -e "\n${GREEN}***************************************************${NC}"
log_success "SETUP COMPLETED SUCCESSFULLY!"
