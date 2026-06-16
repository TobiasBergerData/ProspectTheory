#!/usr/bin/env bash
# =============================================================================
# build.sh — Render Build-Pipeline für prospecttheory-data Service
# =============================================================================
#
# Source of Truth für die 12-Step-Build-on-Deploy-Pipeline. Wird über das
# Render-Dashboard mit `bash build.sh` aufgerufen. Working Directory ist
# `backend/` (Render Root Directory Setting).
#
# Architektur-Hintergrund (Tobias 2026-06-11):
#   Vorher lebte die komplette 12-Step-Pipeline als 800-Zeichen-String im
#   Render-Dashboard-Build-Command-Feld. Beim Editieren ging in einem Build
#   das requirements.txt-Lookup verloren → Build crashed. Lösung: Build-
#   Logik ins Repo, Dashboard hält nur noch `bash build.sh`. Versionierte
#   Pipeline-Steps, PR-reviewbar, fail-fast, lesbare Build-Logs.
#
# Wenn ein neuer Inject-Step dazukommt:
#   1. Hier in der INJECT_STEPS-Liste an der korrekten Position hinzufügen
#   2. Sicherstellen, dass das Script in backend/ existiert
#   3. Lokal `bash build.sh` (aus backend/) testen, dann PR + Merge
#
# Reihenfolge ist KRITISCH:
#   - build_db.py MUSS zuerst laufen (DB-Schema initialisieren)
#   - inject_shot_creation_spectrum MUSS vor inject_leverage_efficiency
#     (Letzteres liest shotCreation-Field aus DB)
#   - inject_shooting_m1 als letzter (M1-Layer setzt auf v2-Output auf)
#
# Fail-fast: set -euo pipefail → jeder Step muss exit 0 zurückgeben.
# =============================================================================

set -euo pipefail

# ─── Pretty-Logging für Render-Build-Logs ───
log_step() {
  echo ""
  echo "============================================================"
  echo "  $1"
  echo "============================================================"
}

# ─── Working Directory robust auflösen ───
# Render Root Directory = backend → wir sind bereits hier.
# Falls jemand das Script aus dem Repo-Root aufruft (lokaler Test),
# wechseln wir defensiv ins backend/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo "[build.sh] Working directory: $(pwd)"

# ─── Step 1: Python Dependencies ───
log_step "STEP 1/16: Install Python dependencies"
pip install -r requirements.txt

# ─── Step 2: Build SQLite DB aus api_profiles_part*.json ───
log_step "STEP 2/16: Build prospecttheory.db from api_profiles"
python -u build_db.py

# ─── Steps 3-13: Inject-Pipeline ───
# Reihenfolge spiegelt Datenabhängigkeiten wider. Siehe ARCHITECTURE.md
# (Sektion: Build-on-Deploy Pipeline) für Begründung pro Step.
INJECT_STEPS=(
  "inject_shot_creation_spectrum.py"   # PBP-Shot-Creation: rim/mid/three Breakdown
  "inject_leverage_efficiency.py"      # Self-Creation-Weighted eFG% (liest shotCreation)
  "inject_skill_curve.py"              # BartTorvik Cross-Season Skill-Trajectory
  "inject_ogbpm.py"                    # OG-BPM aus BT-Lookup
  "inject_mind_metrics.py"             # PBP-Mind-Metrics (Aggressor, Clutch, etc.)
  "inject_season_advanced.py"          # astP/toP/stlP/blkP/ftr in seasonLines
  "inject_game_logs.py"                # Per-Game Stats für Scouting-Skill-Curve
  "inject_usage_reaction.py"           # Sprint-3.25 (#19): Scorer/Passer Slope vs USG
  "inject_half_box_split.py"           # Sprint-3.41: H1/H2 Box-Score Splits (stamina+focus)
  "inject_draft_risk.py"               # Risk-Profile (Market/Merit/Bust/Star)
  "inject_nba_role.py"                 # NBA-Rollen-Projektion (pre→post + Floor)
  "inject_added_wins.py"               # Added Wins (P(NBA) × E[AW|NBA])
  "inject_shooting_m1.py"              # Diss-M1 Shooting (Berger 2022, EB+Beta-Reg)
  "inject_position_overrides.py"       # Manual Scout-driven Position-Fixes (Boozer=Wing)
)

STEP=3
for script in "${INJECT_STEPS[@]}"; do
  log_step "STEP $STEP/16: $script"
  if [[ ! -f "$script" ]]; then
    echo "[build.sh] FATAL: $script not found in $(pwd)"
    exit 1
  fi
  python -u "$script"
  STEP=$((STEP + 1))
done

# ─── Step 16: Static Pre-Computed Responses (Sprint-3.36 Render OOM fix) ───
# Materialisiert /api/board, /api/years, /api/combine als JSON-Files in
# data/processed/static/. Endpoints servieren sie per FileResponse → Peak-Memory
# fällt von ~30 MB/Request auf ~0 MB. Wurzelfix für den 9:05-9:23 AM Crash-Loop.
log_step "STEP 16/16: Export static board JSONs (Render OOM root-cause fix)"
python -u export_board_static.py

# Plus Sprint-4.0: Stats Lab pre-computed data (~10 MB raw / ~2 MB gz)
# Served as static file by /api/stats_lab — no SQL hot-path, same OOM-safe pattern.
log_step "Sprint-4.0 — Stats Lab pre-compute (rows + meta)"
python -u export_stats_lab.py

# ─── Build-Validation ───
log_step "BUILD COMPLETE — Validation"
if [[ ! -f "data/processed/prospecttheory.db" ]]; then
  echo "[build.sh] FATAL: prospecttheory.db not created — build pipeline broken"
  exit 1
fi
if [[ ! -f "data/processed/static/board_all.json" ]]; then
  echo "[build.sh] FATAL: board_all.json not created — static export step failed"
  exit 1
fi
DB_SIZE=$(du -h data/processed/prospecttheory.db | cut -f1)
STATIC_SIZE=$(du -sh data/processed/static/ | cut -f1)
echo "[build.sh] prospecttheory.db: $DB_SIZE"
echo "[build.sh] static/*.json:     $STATIC_SIZE"
echo "[build.sh] Pipeline finished successfully."
