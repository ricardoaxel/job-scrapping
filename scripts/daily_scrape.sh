#!/bin/bash
set -e
cd "$(dirname "$0")/.."
LOG="$HOME/.job-scrapping-daily.log"

echo "[$(date)] Iniciando scraper..." >> "$LOG"

MODE=full node scripts/scraper.js >> "$LOG" 2>&1

if git diff --quiet jobs.json filtered_jobs.json; then
  echo "[$(date)] Sin cambios, nada que commitear" >> "$LOG"
else
  git add jobs.json filtered_jobs.json
  git commit -m "daily scrape $(date +%Y-%m-%d)"
  git push origin main >> "$LOG" 2>&1
  echo "[$(date)] Scrape y push completados" >> "$LOG"
fi
