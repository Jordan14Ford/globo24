#!/bin/bash
# Cron wrapper for global-news-pipeline orchestrator.
# Cron runs in a minimal shell with no user PATH — we set it explicitly.
export PATH="/Users/jordanford/.nvm/versions/node/v20.19.4/bin:/usr/local/bin:/usr/bin:/bin"

PROJECT_DIR="/Users/jordanford/Desktop/DC Vibecodathon/global-news-pipeline"
LOG_FILE="/tmp/globo-news-orchestrate.log"

cd "$PROJECT_DIR" || exit 1
echo "--- $(date) ---" >> "$LOG_FILE"
npm run orchestrate >> "$LOG_FILE" 2>&1
