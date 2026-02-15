#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRON_JOBS_FILE="$SCRIPT_DIR/mle_coach_cron_jobs.json"
CONFIG_DIR="${CLAWDBOT_CONFIG_DIR:-$HOME/.clawdbot}"

echo "=== MLE Interview Coach Setup ==="
echo ""

# --- Pre-flight checks ---
if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is not installed. Install Docker Desktop first."
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop first."
  exit 1
fi

if [ ! -f "$CRON_JOBS_FILE" ]; then
  echo "ERROR: $CRON_JOBS_FILE not found."
  exit 1
fi

# Check for required env vars (warn, don't fail — .env file may supply them)
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "WARNING: No .env file found at $ENV_FILE"
  echo "You'll need these variables set (via .env or environment):"
  echo "  CLAWDBOT_CONFIG_DIR=$CONFIG_DIR"
  echo "  CLAWDBOT_WORKSPACE_DIR=~/clawd"
  echo "  CLAWDBOT_GATEWAY_TOKEN=<your-token>"
  echo "  CLAUDE_AI_SESSION_KEY=<your-key>"
  echo ""
  read -rp "Continue anyway? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 0
fi

# --- Step 1: Build the Docker image ---
# Uses lightweight Dockerfile that installs moltbot from npm
# (building from source requires the full repo to compile cleanly)
echo ""
echo ">>> Step 1: Building Docker image (moltbot:local)..."
docker build -t moltbot:local -f "$SCRIPT_DIR/Dockerfile.mle-coach" "$SCRIPT_DIR"

# --- Step 2: Install cron jobs ---
echo ""
echo ">>> Step 2: Loading MLE Coach cron jobs..."

# Ensure cron config directory exists
CRON_DIR="$CONFIG_DIR/config/cron"
mkdir -p "$CRON_DIR"

CRON_TARGET="$CRON_DIR/jobs.json"

if [ -f "$CRON_TARGET" ]; then
  echo "Existing jobs.json found at $CRON_TARGET"
  echo "Backing up to jobs.json.bak"
  cp "$CRON_TARGET" "$CRON_TARGET.bak"

  # Merge: add our jobs to existing file (avoid duplicates by id)
  # Uses node since it's guaranteed available after docker build
  node -e "
    const fs = require('fs');
    const existing = JSON.parse(fs.readFileSync('$CRON_TARGET', 'utf8'));
    const incoming = JSON.parse(fs.readFileSync('$CRON_JOBS_FILE', 'utf8'));
    const existingIds = new Set((existing.jobs || []).map(j => j.id));
    let added = 0;
    for (const job of incoming.jobs) {
      if (!existingIds.has(job.id)) {
        existing.jobs.push(job);
        added++;
      }
    }
    fs.writeFileSync('$CRON_TARGET', JSON.stringify(existing, null, 2));
    console.log('Merged: ' + added + ' new jobs added, ' + (incoming.jobs.length - added) + ' already existed.');
  "
else
  cp "$CRON_JOBS_FILE" "$CRON_TARGET"
  echo "Installed 4 cron jobs to $CRON_TARGET"
fi

# --- Step 3: Verify cron jobs ---
echo ""
echo ">>> Step 3: Verifying cron jobs..."
docker compose run --rm moltbot-cli cron list

# --- Step 4: Start the gateway ---
echo ""
echo ">>> Step 4: Starting moltbot gateway (detached)..."
docker compose up -d moltbot-gateway

echo ""
echo "=== Setup Complete ==="
echo ""
echo "The gateway is running. Your MLE Coach cron jobs are:"
echo "  - Morning Kickoff:    9:55 AM  Mon-Fri (PT)"
echo "  - Afternoon Check-in: 12:55 PM Mon-Fri (PT)"
echo "  - EOD Accountability: 5:15 PM  Mon-Fri (PT)"
echo "  - Sunday Preview:     8:00 PM  Sunday  (PT)"
echo ""
echo "All reminders deliver via WhatsApp."
echo ""
echo "Useful commands:"
echo "  docker compose logs -f moltbot-gateway   # watch gateway logs"
echo "  docker compose run --rm moltbot-cli cron list   # list cron jobs"
echo "  docker compose down                       # stop everything"
