#!/bin/bash
#
# Dotfiles Automatic Setup Script
# Configuration files (apps.list, snap-apps.list, etc.) are expected to be 
# in the same directory as this setup.sh script ($DOTFILES_DIR).
#
# --- Robustness Flags ---
# -e: Exit immediately if a command exits with a non-zero status.
# -u: Treat unset variables as an error.
set -eu

# --- Global Settings ---
DOTFILES_DIR="$(dirname "$(realpath "$0")")"
PACKAGE_MANAGER="" # Will be automatically detected
SHELL_CONFIG_FILE="$HOME/.bashrc" # The file where PATH settings will be appended (can be .zshrc etc. depending on preference)
PACKAGE_MANAGER_UPDATE_DONE=false

# --- Terminal Color Functions ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; } # Direct errors to stderr

# --- PACKAGE MANAGER DETECTION ---
detect_package_manager() {
    if command -v apt &> /dev/null; then
        PACKAGE_MANAGER="apt"
        log_success "Detected package manager: APT"
    elif command -v dnf &> /dev/null; then
        PACKAGE_MANAGER="dnf"
        log_success "Detected package manager: DNF"
    elif command -v pacman &> /dev/null; then
        PACKAGE_MANAGER="pacman"
        log_success "Detected package manager: Pacman"
    elif command -v zypper &> /dev/null; then
        PACKAGE_MANAGER="zypper"
        log_success "Detected package manager: Zypper"
    else
        log_error "Critical Error: Supported package manager (apt, dnf, pacman, zypper) not found."
        exit 1
    fi
}

# --- INITIAL SYSTEM UPDATE ---
run_initial_update() {
    if [ "$PACKAGE_MANAGER_UPDATE_DONE" = true ]; then
        return # Return if already run
    fi
    
    log_success "Running initial package list update..."
    case "$PACKAGE_MANAGER" in
        apt) sudo apt update ;;
        dnf|zypper) sudo "$PACKAGE_MANAGER" check-update || true ;; # dnf and zypper check-update may exit non-zero
        pacman) sudo pacman -Sy --noconfirm ;;
        *) log_error "Update failed: Unknown package manager operation." ; exit 1 ;;
    esac
    PACKAGE_MANAGER_UPDATE_DONE=true
}

# --- CORE DEPENDENCY CHECK AND INSTALLATION ---
# Checks if a command is installed and installs the corresponding package if needed.
check_and_install_core_deps() {
    local dependency="$1"
    local package_name="$2" 
    
    if ! command -v "$dependency" &> /dev/null; then
        log_warning "$dependency is not installed. Attempting to install $package_name..."
        run_initial_update # Run update once
        
        # Specific command structure for Pacman
        if [ "$PACKAGE_MANAGER" = "pacman" ]; then
            if sudo pacman -S --noconfirm "$package_name"; then
                log_success "$dependency installed successfully."
            else
                log_error "Failed to install $dependency using Pacman."
                exit 1
            fi
        # Common command structure for others (apt, dnf, zypper)
        else
            if sudo "$PACKAGE_MANAGER" install -y "$package_name"; then
                log_success "$dependency installed successfully."
            else
                log_error "Failed to install $dependency. Check package name ($package_name) for your distribution."
                exit 1
            fi
        fi
    fi
}
# -----------------------------------------------------------

# -----------------------------------------------------------
# 1. INITIAL SETUP AND DIRECTORY VERIFICATION
# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 1. DOTFILES REPOSITORY LOCATED AND VERIFIED =====${NC}"

detect_package_manager # Detect package manager
check_and_install_core_deps "git" "git" # Ensure Git installation
check_and_install_core_deps "curl" "curl" # Ensure Curl installation

log_success "Dotfiles source directory set to: $DOTFILES_DIR"

# -----------------------------------------------------------
# 2. INSTALLING SYSTEM PACKAGES using apps.list
# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 2. INSTALLING SYSTEM PACKAGES ($PACKAGE_MANAGER) =====${NC}"
APPS_LIST="$DOTFILES_DIR/apps.list"

if [ -f "$APPS_LIST" ]; then
    log_success "Installing essential packages from $APPS_LIST..."
    run_initial_update # Run update before installation
    
    # Read all packages in apps.list, filter comments/empty lines, and install.
    # Cleaning the list is beneficial.
    
    # Use --noconfirm instead of -y for Pacman
    if [ "$PACKAGE_MANAGER" = "pacman" ]; then
        grep -vE '^\s*#|^\s*$' "$APPS_LIST" | xargs -r sudo pacman -S --noconfirm
    else
        grep -vE '^\s*#|^\s*$' "$APPS_LIST" | xargs -r sudo "$PACKAGE_MANAGER" install -y
    fi

    log_success "System package installation complete."
else
    log_warning "$APPS_LIST file not found. System package installation skipped."
fi


# -----------------------------------------------------------
# 3. DEPLOYING CONFIGURATION FILES (Symlink Recommended)
# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 3. DEPLOYING CONFIGURATION FILES =====${NC}"
log_warning "This section is for deploying configuration files. Symlinking is highly recommended over copying."
log_success "Example: Symlink bashrc (instead of copy): ln -sf \"$DOTFILES_DIR/bashrc\" \"$HOME/.bashrc\""
log_success "Example: Symlink folder: ln -sf \"$DOTFILES_DIR/config/i3\" \"$HOME/.config/i3\""
#
# NOTE: Customize this section to symlink your specific config files!
# ln -sf "$DOTFILES_DIR/bashrc" "$HOME/.bashrc"
# ln -sf "$DOTFILES_DIR/vimrc" "$HOME/.vimrc"
# 
# log_success "Configuration file deployment complete."


# -----------------------------------------------------------
# 4. INSTALLING SNAP APPLICATIONS using snap-apps.list
# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 4. INSTALLING SNAP APPLICATIONS =====${NC}"
SNAP_APPS_LIST="$DOTFILES_DIR/snap-apps.list"

if [ -f "$SNAP_APPS_LIST" ]; then
    # Check and install Snapd dependency
    check_and_install_core_deps "snap" "snapd"
    
    # If Snapd is installed and systemd is used, enable the service
    if command -v systemctl &> /dev/null && command -v snap &> /dev/null; then
        log_success "Enabling snapd socket service..."
        sudo systemctl enable --now snapd.socket || log_warning "Failed to enable snapd.socket (it may already be running or systemd is not available)."
    fi

    log_success "Installing Snap applications from $SNAP_APPS_LIST..."
    while IFS= read -r app_name || [ -n "$app_name" ]; do
        # Skip empty lines and comments
        app_name="${app_name%%#*}" # Clean comments
        app_name="$(echo "$app_name" | xargs)" # Clean leading/trailing spaces
        if [ -z "$app_name" ]; then continue; fi

        log_success "-> Snap: Installing $app_name..."
        if sudo snap install "$app_name"; then
            : # Success
        else
            log_error "Failed to install Snap application: $app_name. Proceeding..."
        fi
    done < "$SNAP_APPS_LIST"
    log_success "Snap installation complete."
else
    log_warning "$SNAP_APPS_LIST file not found. Snap installation skipped."
fi


# -----------------------------------------------------------
# 5. FNM AND BUN.JS INSTALLATION (JS VERSION MANAGERS)
# -----------------------------------------------------------
echo -e "\n${YELLOW}===== 5. INSTALLING BUN.JS =====${NC}"

# --- Bun.js Installation ---
log_success "Installing Bun.js..."
if curl -fsSL https://bun.sh/install | bash; then
    log_success "Bun.js installed successfully (PATH should be managed by the installer)."
else
    log_error "Bun.js installation failed."
fi


# -----------------------------------------------------------
# 6. CONCLUSION AND NEXT STEPS
# -----------------------------------------------------------
echo -e "\n${GREEN}***************************************************${NC}"
log_success "SETUP COMPLETED SUCCESSFULLY!"