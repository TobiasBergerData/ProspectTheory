# Sprint-2 Pipeline-Re-Run Guide

**Datum:** 2026-06-04
**Voraussetzung:** Sprint-2 commits gepusht (siehe Repo-Stand unten)
**Erwartete Dauer:** 30-60min Compute auf Tobias' PC + Verifikation

---

## Was bereits gepusht ist (Sprint-1 + Sprint-2 main)

**prospecttheory-web (main):**
```
5f65521  fix(self-sufficiency): sample-size filter for pressure verdicts
4c47a98  refactor(badges): deduplicate BADGE_DEFS + canonical-source headers
236f9be  fix(mind-tab): exempt Match Stamina from Bayesian shrinkage
c95d7f9  fix(backend): slug-prefix fallback in find_player()
2be1a75  chore(frontend): park Risk Profile tab + backlog doc
```

**prospecttheory-data (main, lokal — Tobias muss pushen):**
```
26f6e22  fix(pipeline): role_event mapping pulls from role_zone_pressure
8a14654  refactor(pipeline): rename nba_peak_wins_added.csv → nba_target_peak_wa.csv
```

**Side-Branch (vorbereitet, wartet auf Re-Run-Erfolg):**
```
prospecttheory-web/sprint-2-risk-tab-enable:
  1607389  feat(frontend): re-enable Risk Profile tab post pipeline re-run
```

---

## Safety-Snapshots (bereits gesetzt)

```
Tags (prospecttheory-web):
  pod-safe-state-2026-06-04       → 37bca05 (Pre-Overlay Pod-State)
  pod-pre-tabpark-2026-06-04      → 1b82efe
  pod-pre-sprint1-2026-06-04      → 2be1a75 (Pre-Sprint-1)
  pod-pre-sprint2-2026-06-04      → 2be1a75 (Pre-Sprint-2)

Backup (Mount-Side):
  prospecttheory-web/backend/data/processed/_backup_pre_sprint2/
    draft_risk_all.csv (Pod-State)
    added_wins_projection.csv (Pod-State)
    nba_role_projection_all.csv (Pod-State)
    nba_added_wins_peak.csv (Pod-State)
```

---

## Pipeline-Re-Run-Schritte (auf Tobias' Windows-PC)

### Schritt 1 — Data-Pipeline Push (falls noch nicht erfolgt)

```powershell
cd C:\Users\tobia\ProspectTheory\data-pipeline
git log --oneline -3
# sollte zeigen:
#   26f6e22 fix(pipeline): role_event mapping pulls from role_zone_pressure
#   8a14654 refactor(pipeline): rename nba_peak_wins_added.csv → nba_target_peak_wa.csv

git push origin main
```

### Schritt 2 — Alte Files säubern (wegen Naming-Refactor)

```powershell
# Im data-pipeline Verzeichnis
cd C:\Users\tobia\ProspectTheory\data-pipeline\data\processed

# Lösche den ALTEN Namen (wird durch nba_target_peak_wa.csv ersetzt)
Remove-Item nba_peak_wins_added.csv -Force -ErrorAction SilentlyContinue
```

### Schritt 3 — Pipeline-Re-Run (sequenziell, mit Checkpoints)

```powershell
cd C:\Users\tobia\ProspectTheory\data-pipeline

# Stage 1: NBA Target peak_wa (neu mit Naming-Refactor)
python scripts\02e_compute_nba_target.py
# Erwarteter Output: data\processed\nba_target_peak_wa.csv (NEUER NAME!)
# Sanity-Check: 1700+ Spieler, peak_wa zwischen -5 und 30

# Stage 2: Added Wins Computation
python scripts\02f_added_wins.py
python scripts\02h_nba_probability.py
python scripts\02i_added_wins_value.py

# Stage 3: NBA Transition (mit qcut-fix)
python scripts\nba_transition.py
# CHECKPOINT: kein crash bei qcut

# Stage 4: Combine projection
python scripts\02j_combine_projection.py
# CHECKPOINT: print "Tier mix 2026 class" zeigt realistische Verteilung

# Stage 5: Draft Range Model (mit rank-in-class merit_slot)
python scripts\draft_range_model.py
# CHECKPOINT: print "NAMED CASES" zeigt z.B. Boozer mit merit_slot=1, 
# nicht alle Top-Spieler auf merit_slot=1.0 (Bug-Indikator wäre Cap-Cluster)

# Stage 6: Draft Risk Model
python scripts\draft_risk_model.py
# CHECKPOINT: bust_risk + star_upside Werte plausibel

# Stage 7: Compress for Deploy
python scripts\11_compress_for_deploy.py
# Erwarteter Output: api_profiles_part1-3.json mit role_event = role_zone_pressure Werte
```

### Schritt 4 — Verify-Pass (BEVOR Backend-Sync)

```powershell
cd C:\Users\tobia\ProspectTheory\data-pipeline

# Quick sanity check on key 2026 prospects
python -c "import pandas as pd; df = pd.read_csv('data/processed/draft_risk_all.csv'); e26 = df[df.year == 2026].nlargest(10, 'merit_slot' if False else None); print(e26[['name','merit_slot','consensus','bust_risk','star_upside']].head(15))"

# Check that merit_slot has differentiated values (NOT all 1.0 or 15.9)
python -c "import pandas as pd; df = pd.read_csv('data/processed/draft_risk_all.csv'); e26 = df[df.year == 2026]; print('Unique merit_slot values:', e26.merit_slot.nunique()); print(e26.merit_slot.value_counts().head(10))"
```

**Erwartung:** 
- Boozer/Flemings/Wilson sind nahe merit_slot 1-3
- KEINE Cluster bei 1.0 oder 15.9
- bust_risk + star_upside sind floats zwischen 0-1

### Schritt 5 — Backend-Sync

```powershell
cd C:\Users\tobia\ProspectTheory

# Copy refreshed CSVs to backend
Copy-Item data-pipeline\data\processed\draft_risk_all.csv prospecttheory-web\backend\data\processed\ -Force
Copy-Item data-pipeline\data\processed\added_wins_projection.csv prospecttheory-web\backend\data\processed\ -Force
Copy-Item data-pipeline\data\processed\nba_role_projection_all.csv prospecttheory-web\backend\data\processed\ -Force
Copy-Item data-pipeline\data\processed\api_profiles_part1.json prospecttheory-web\backend\data\processed\ -Force
Copy-Item data-pipeline\data\processed\api_profiles_part2.json prospecttheory-web\backend\data\processed\ -Force
Copy-Item data-pipeline\data\processed\api_profiles_part3.json prospecttheory-web\backend\data\processed\ -Force
```

### Schritt 6 — Pre-Deploy Spot-Check

```powershell
cd C:\Users\tobia\ProspectTheory\prospecttheory-web

# Verify CSVs sind aktuell
Get-ChildItem backend\data\processed\draft_risk_all.csv, backend\data\processed\added_wins_projection.csv | Select-Object Name, LastWriteTime, Length

# Git status
git status --short backend\data\processed\
```

### Schritt 7 — Commit + Push Backend-Daten

```powershell
git add backend\data\processed\draft_risk_all.csv backend\data\processed\added_wins_projection.csv backend\data\processed\nba_role_projection_all.csv backend\data\processed\api_profiles_part1.json backend\data\processed\api_profiles_part2.json backend\data\processed\api_profiles_part3.json

git commit -m "data: refresh post-Sprint-2 pipeline re-run (rank-in-class merit + event-mapping fix + naming refactor)"

git push origin main
# → Render Auto-Deploy startet, ~3-5min Build
```

### Schritt 8 — Risk-Tab Re-Enable Merge

Nach Schritt 7 + Verifikation dass Backend-Deploy stabil:

```powershell
# Merge prepared side-branch zu main
git checkout main
git merge sprint-2-risk-tab-enable --no-ff -m "merge: re-enable Risk Profile tab after pipeline re-run"
git push origin main
# → Frontend rebuild + Risk-Tab live
```

---

## Rollback-Plan (falls etwas schiefläuft)

### Stage A — Pipeline-Crash beim Re-Run
```powershell
# Pipeline-Patches sind im git tracked; lokale CSVs noch unverändert (Backup im _backup_pre_sprint2/)
# Falls Schritt 3 crashed:
# - Lese stderr für den Crash-Punkt
# - Sende mir den Output zur Analyse

# Falls du komplett rollbacken willst:
cd C:\Users\tobia\ProspectTheory\data-pipeline
git reset --hard origin/main^  # zurück zum pre-Sprint-2 pipeline state
```

### Stage B — Backend-Deploy crashed nach Schritt 7
```powershell
# Render-Service down? Zurück auf Pod-Safe-State:
cd C:\Users\tobia\ProspectTheory\prospecttheory-web
git revert HEAD --no-edit  # neuer revert commit
git push origin main
# Render redeploy mit alten Daten
```

### Stage C — Big Board zeigt falsche Werte nach Deploy
```powershell
# Restore from Mount-side backup:
cd C:\Users\tobia\ProspectTheory\prospecttheory-web
Copy-Item backend\data\processed\_backup_pre_sprint2\* backend\data\processed\ -Force
git add backend\data\processed\
git commit -m "data: rollback to pre-Sprint-2 snapshot"
git push origin main
```

### Stage D — Nuke-Option (komplett zurück)
```powershell
cd C:\Users\tobia\ProspectTheory\prospecttheory-web
git reset --hard pod-pre-sprint2-2026-06-04
git push --force-with-lease origin main
# Render redeploy with absolute pod-safe state.
# 1607389 Risk-Tab-Enable Branch bleibt unangetastet für späteres Recovery.
```

---

## Erwartete Effekte nach erfolgreichem Deploy

```
BIG BOARD:
  Sortierung nach ev_added_wins kann leicht abweichen von Pod-State.
  Top-3 sollten Boozer / Flemings / Wilson bleiben (Modell-grundlagen unverändert).
  AAchtung wenn nicht: möglicher Indikator für ungewolltes Modell-Drift.

PROFILE-TAB:
  Role-Inference: "event" Field zeigt jetzt defensive STL+BLK+DRB
                  (vor Sprint-2 war es offensive self_creation+ast+ftr).
                  Frontend hatte das schon vorher visuell so behandelt;
                  jetzt sind Pipeline-Daten + Frontend-Anzeige semantisch
                  konsistent.

RISK-TAB (neu sichtbar):
  merit_slot zeigt rank-in-class statt globalem Quantil.
  Top-3 sollten merit_slot 1, 2, 3 zeigen (Boozer/Flemings/Wilson).
  Mittelfeld zeigt differenzierte Werte 4-15 (kein 15.9-Cluster).
  bust_risk + star_upside bewertet pro Spieler.
  Steal/Bust-Gap = consensus - merit_slot.
```

---

## Validation-Checkliste vor Schritt 8 (Risk-Tab Merge)

```
□ Big Board zeigt Pod-Top-3 (Boozer / Flemings / Wilson)
□ Backend /api/board?year=2026 returnt 200 OK
□ Profile-Tab Boozer: role_event Wert ≈ role_zone Wert (beide defensive)
□ Render-Logs zeigen keine inject_*-Crashes
□ Spot-Check 5 Spieler — alle relevanten Felder present
□ Render Service-Recovered Event nach Deploy
```

Wenn alle Boxen ✓ → Schritt 8 (Risk-Tab Merge) ist safe.
