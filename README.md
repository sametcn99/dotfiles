# Dotfiles Setup

Interactive Linux setup tool built with Bun + TypeScript + OpenTUI.

It helps you configure a new machine by selecting tasks and packages from a terminal UI, then executing them with animated progress feedback.

## Features

- Interactive task selection (run only what you need)
- Interactive package selection (all selected by default)
- Animated installation screen with progress and status indicators
- Optional GitHub repository cloning for the authenticated user
- Linux executable build support via Bun (`--compile`)
- Automated GitHub Release workflow on every push to `main`

## Requirements

- Linux environment
- Bun installed
- Package manager supported by the runtime detection:
	- `apt`
	- `dnf`
	- `zypper`
	- `pacman`
- Optional tools depending on selected tasks:
	- `git` (for GitHub repository cloning)
	- `snap`/`snapd` (for snap packages)
	- `gsettings` (for GNOME settings)

## Installation

```bash
git clone https://github.com/sametcn99/dotfiles.git
cd dotfiles
bun install
```

## Run

```bash
bun run start
```

## Interactive Flow

When you start the app, it runs this flow:

1. Welcome screen (OpenTUI)
2. Task selection screen
3. Pre-check for selected tasks
4. Package/repository selection screen (if installable items exist)
5. Confirmation prompt
6. Animated installation screen
7. Completion summary screen

## OpenTUI Controls

- `↑ / ↓` or `k / j`: Move cursor
- `Space`: Toggle selected item
- `A`: Toggle all items
- `Enter`: Confirm and continue
- `Esc`: Cancel

## Tasks

### 1) Install System Packages

- Source list: `src/lists/apps.list`
- Detects installed packages and only installs missing ones

### 2) Link Dotfiles

- Executes dotfile linking steps in your workflow

### 3) Install Snap Applications

- Source list: `src/lists/snap-apps.list`
- Supports flags such as `--classic`
- Installs `snapd` first if needed

### 4) Configure Gnome Settings

- Applies GNOME tweaks via `gsettings`

### 5) Clone GitHub Repositories

- Uses GitHub API to fetch all repositories of the authenticated user
- Prompts for GitHub token inside the app (paste in the OpenTUI token screen)
- Lets you select which repositories to clone
- Skips repositories already cloned locally
- Default clone directory:
	- `~/Documents/git-repos`

## Environment Variables

Optional clone location override:

```env
GITHUB_CLONE_DIR=/absolute/path/for/clones
```

## Build a Local Executable

```bash
bun build src/index.ts --compile --outfile dotfiles-setup
./dotfiles-setup
```

## CI / Releases

The repository includes a GitHub Actions workflow that:

- Runs on every push to `main`
- Installs dependencies
- Type-checks the project
- Builds a Linux executable with Bun
- Creates a GitHub Release named/tagged as:
	- `<commitShortSha>-<dateTime>`

## Quality Checks

```bash
bun run check
```

This runs:

- Biome checks/fixes
- Duplicate list validation script

## Project Structure

```text
src/
	core/        # system context, logger, interfaces
	tasks/       # executable task implementations
	ui/          # OpenTUI screens and animations
	lists/       # package/app input lists
scripts/
	check_duplicates.ts
```

## Notes

- Some tasks may require sudo permissions.
- Behavior depends on your distro/package-manager environment.
- If a required tool is missing, the app reports a warning and skips related operations.
