#!/bin/bash
#
# Dotfiles Setup Bootstrapper
#
# This script prepares the environment (installs Bun) and then delegates
# the full setup process to the TypeScript application in ./src
#

set -euo pipefail

# --- Colors ---
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# --- Check for sudo ---
# We need sudo for the subsequent system modifications
if ! sudo -v &>/dev/null; then
    log_error "This script requires sudo privileges to set up system packages."
    exit 1
fi

echo "--- Bootstrap: Checking Prerequisites ---"

# --- Install Core Dependencies (curl, unzip) for Bun ---
if ! command -v curl &>/dev/null; then
    echo "Installing curl..."
    if command -v apt &>/dev/null; then sudo apt update && sudo apt install -y curl
    elif command -v dnf &>/dev/null; then sudo dnf install -y curl
    elif command -v pacman &>/dev/null; then sudo pacman -Sy --noconfirm curl
    elif command -v zypper &>/dev/null; then sudo zypper install -y curl
    fi
fi


# --- Install Bun ---
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun &>/dev/null; then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    
    # Ensure it's in path for this session immediately
    if [ -d "$HOME/.bun/bin" ]; then
        export PATH="$HOME/.bun/bin:$PATH"
    fi
else
    log_success "Bun is already installed."
fi

# --- Verify Bun Installation ---
if ! command -v bun &>/dev/null; then
    log_error "Bun installation failed or not found in PATH."
    log_error "Please run 'source ~/.bashrc' or add ~/.bun/bin to your PATH manually and retry."
    exit 1
fi

BUN_VERSION=$(bun --version)
log_success "Bun verified (v$BUN_VERSION)."

# --- Run the TypeScript Application ---
echo "--- Starting Setup Application ---"

# Install types if needed (optional, often not strictly needed for runtime if just using built-ins, 
# but good practice if dependencies exist)
if [ -f "package.json" ]; then
    echo "Installing dependencies..."
    bun install --silent
fi

echo "launching src/index.ts..."
bun run src/index.ts

