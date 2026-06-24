# Job Scrapping — Project Context

## Overview
Personal job-scraping + CV generation pipeline for Valeria, with a bilingual web dashboard deployed via GitHub Pages. Firebase-backed shared job tracking and password-gated notes.

## Tech Stack
- **Scraper**: Playwright (Node.js), LinkedIn auth via `li_at` cookie
- **Backend**: Python scripts (filter.py, build_skill_per_category.py, generate_cv.py)
- **Frontend**: Vanilla JS SPA (`site/app.js`, `site/style.css`, `site/index.html`)
- **Database**: Firebase Firestore (shared tracking + notes) + localStorage (cache/fallback)
- **Deploy**: GitHub Actions → GitHub Pages
- **Automation**: macOS launchd (cron replacement) at 7:30 AM and 12:00 PM daily

## Key Files
- `site/app.js` — SPA logic (tracking, modal, stats, pokemon, goal, filters)
- `site/style.css` — all styling (unified section titles use `.modal-body .section-title` pattern)
- `site/index.html` — entry point, footer has `<span id="version">dev</span>` (replaced during deploy)
- `scripts/scraper.js` — main LinkedIn scraper (8 queries, 2 pages)
- `scripts/filter.py` — job filtering pipeline (location, experience, relevance, company, dedup, language)
- `scripts/generate_cv.py` — converts MD → DOCX + PDF; supports `--lang es`
- `scripts/build_skill_per_category.py` — extracts skills from jobs.json
- `cvs/` — CV sources (base-cv.md EN, base-cv-es.md ES) and Generated outputs
- `filtered_jobs.json` — cumulative filtered jobs (source of truth for frontend)
- `jobs.json` — daily raw scrape output
- `linkedin-state.json` — browser session (sensitive, do not commit)
- `.opencode/agents.md` — this file
- `.github/workflows/deploy.yml` — Pages deploy, injects `v{commit_count}` into footer
- `~/.local/bin/daily_scrape.sh` — launchd cron script
- `~/.job-scrapping-daily.log` — cron log

## UI Architecture
- SPA with no router: `BASE` = `window.location.pathname.replace(/\/$/, '') || ''`
- Main view: search, category pills, time filters, tracking filters (♡ ✓ 👎), job cards, pagination
- Stats view: summary cards, 3-month calendar heatmap, per-day history (toggle via 📊 button)
- Modal: job details, CV links, description (500 char truncation with "Ver más"), skills pills, form data pills, stage selector (applied only), notes textarea, tracking buttons, LinkedIn button, status-colored top border
- All views sync: tracking changes in modal/cards → updates badge, filter pills, progress, pokemon, stats

## Tracking System
- `trackedJobs` object keyed by `job.url || (job.title + job.company)`
- Each entry: `{ interested, applied, disliked, dislikeReason, trackedAt, stage?, note? }`
- `interested` and `applied` can coexist. `disliked` is mutually exclusive with both.
- `applied` and `disliked` jobs hidden by default (toggle filters to show)
- Stages: `['Enviada', 'Screening', 'Entrevista', 'Oferta', 'Rechazada']` — only for applied jobs

## Goal System
- Auto mode (default): goal = non-disliked jobs posted in last 24h
- Manual mode: user-defined number, stored in localStorage `daily_goal`
- ℹ️ tooltip explains current mode | toggle switch to change mode
- Milestones: 25% "Wuju, ya llevas buen progreso 🎉", 50% "Ya vamos por la mitad 💪", 75% "Te falta nada 🔥", 100% overlay celebration
- Emojis: 0% 🌅, <25% 🌱, <50% 🔥, <75% 🚀, <100% 🎯, 100% 🏆

## Pokemon System
- Every 5 total applied jobs → random Pokemon from PokeAPI (first 151)
- Reveal overlay on unlock | displayed in header as sprite badges
- Stored in localStorage `pokemon_collection` (array of `{ index, unlockedAt }`)

## Known Bugs & Fixes
- ✅ `set -e` in daily_scrape.sh killed script before commit if scraper exited non-zero (fixed with `|| echo ...`)
- ✅ `updateCardUI` could crash if `filtered[idx]` was undefined (fixed with guard)
- ✅ Modal CSS used `.modal-body` class selector but HTML had `id="modal-body"` (fixed with class)

## Commit Conventions
- `feat:` — features
- `fix:` — bug fixes
- `data:` — data-only changes (cron commits)
- Use `daily_scrape.sh` for automated data commits

## Deploy
- GitHub Actions push → `_site/` build → deploy to Pages
- Version = `git rev-list --count HEAD` (fallback "dev" locally)
- Need `fetch-depth: 0` in checkout for accurate version count

## Local Dev
- `python3 -m http.server 8001 --bind 127.0.0.1` in project root
- Symlinks in `site/data/` and `site/cvs/` replicate deployed structure locally
- API keys, `li_at` token — do not commit
