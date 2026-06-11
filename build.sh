#!/usr/bin/env bash
# =============================================================================
# build.sh — Render Build-Pipeline für prospecttheory-data Service
# =============================================================================
#
# Source of Truth für den Render-Build. Wird über das Render-Dashboard mit
# `bash build.sh` ausgelöst (Build Command). Der Service-Repo-Root ist
# `prospecttheory-web/`; alle Backend-Files liegen unter `backend/`.
#
# Architektur-Notiz (Tobias 2026-06-11):
#   Vorher lebte die komplette 12-Step-Pipeline als 800-Zeichen-String im
#   Render-Dashboard-Build-Command-Feld + Root-Directory=backend. Beim
#   Editieren ging das Root-Directory-Setting verloren → Build crashed mit
#   "requirements.txt not found". Lösung: Build-Logik ins Repo verschoben,
#   Dashboard hält nur noch `bash build.sh`. Versionierte Pipeline-Steps,
#   PR-reviewable, fail-fast.
#
# Wenn ein neuer Inject-Step dazukommt:
#   1. Hier am Ende der INJECT_STEPS-Liste hinzufügen
#   2. Sicherstellen, dass das Script in backend/inject_*.py existiert
#   3. Lokal `bash build.sh` testen, dann PR + Merge
#
# Reihenfolge ist NICHT austauschbar:
#   - build_db.py MUSS zuerst laufen (DB-Schema)
#   - inject_shot_creation_spectrum MUSS vor inject_leverage_efficiency
#     (Letzteres liest shotCreation-Field aus DB)
#   - inject_shooting_m1 als letzter, weil M1-Layer auf v2-Output aufsetzt
#
# Fail-fast: Jeder Step muss exit 0 zurückgeben, sonst Build-Abbruch.
# =============================================================================

set -euo pipefail

# Pretty-Logging — macht Render-Build-Logs lesbarer
log_step() {
  echo ""
  echo "============================================================"
  echo "  $1"
  echo "============================================================"
}

# ─── Working Directory ───
# Repo-Root ist `prospecttheory-web/`; Backend liegt in `backend/`.
# cd statt Root-Directory-Setting, damit Build-Steps versioniert sind.
cd "$(dirname "$0")/backend"
echo "[build.sh] Working directory: $(pwd)"

# ─── Step 1: Python Dependencies ───
log_step "STEP 1/13: Install Python dependencies"
pip install -r requirements.txt

# ─── Step 2: Build SQLite DB aus api_profiles_part*.json ───
log_step "STEP 2/13: Build prospecttheory.db from api_profiles"
python -u build_db.py

# ─── Steps 3-13: Inject-Pipeline ───
# Reihenfolge spiegelt Datenabhängigkeiten wider — siehe ARCHITECTURE.md
# (Sektion: Build-on-Deploy Pipeline).
INJECT_STEPS=(
  "inject_shot_creation_spectrum.py"   # PBP-Shot-Creation: rim/mid/three breakdown
  "inject_leverage_efficiency.py"      # Self-Creation-Weighted eFG% (liest shotCreation)
  "inject_skill_curve.py"              # BartTorvik Cross-Season Skill-Trajectory
  "inject_ogbpm.py"                    # OG-BPM aus BT-Lookup
  "inject_mind_metrics.py"             # PBP-Mind-Metrics (Aggressor, Clutch, etc.)
  "inject_season_advanced.py"          # astP/toP/stlP/blkP/ftr in seasonLines
  "inject_game_logs.py"                # Per-Game Stats für Scouting-Skill-Curve
  "inject_draft_risk.py"               # Risk-Profile (Market/Merit/Bust/Star)
  "inject_nba_role.py"                 # NBA-Rollen-Projektion (pre→post + Floor)
  "inject_added_wins.py"               # Added Wins (P(NBA) × E[AW|NBA])
  "inject_shooting_m1.py"              # Diss-M1 Shooting (Berger 2022, EB+Beta-Reg)
)

STEP=3
for script in "${INJECT_STEPS[@]}"; do
  log_step "STEP $STEP/13: $script"
  if [[ ! -f "$script" ]]; then
    echo "[build.sh] FATAL: $script not found in $(pwd)"
    exit 1
  fi
  python -u "$script"
  STEP=$((STEP + 1))
done

# ─── Build-Validation ───
log_step "BUILD COMPLETE — Validation"
if [[ ! -f "data/processed/prospecttheory.db" ]]; then
  echo "[build.sh] FATAL: prospecttheory.db not created — build pipeline broken"
  exit 1
fi
DB_SIZE=$(du -h data/processed/prospecttheory.db | cut -f1)
echo "[build.sh] prospecttheory.db: $DB_SIZE"
echo "[build.sh] Pipeline finished successfully."
