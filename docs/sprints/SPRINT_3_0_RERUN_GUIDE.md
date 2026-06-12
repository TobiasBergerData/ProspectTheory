# Sprint-3.0 Pipeline Re-Run Guide

Schritt-für-Schritt-Anleitung für lokalen Pipeline-Re-Run mit den neuen Sprint-3.0 Methodiken (Eligibility-Framework, Bayesian-Shrinkage, Multi-Layer Tier Output).

**Voraussetzung:** Sprint-3.0 Code-Änderungen sind im Mount, aber noch nicht in Git committed.

## Schritt 1: Vor-Flight-Check

Verifiziere dass alle Sprint-3.0 Files vorhanden + Imports laufen:

```powershell
cd C:\Users\tobia\ProspectTheory\data-pipeline

# Code-Files prüfen
Test-Path scripts\02k_eligibility_framework.py
Test-Path scripts\model_utils.py
Test-Path scripts\10c_ml_calibration.py
Test-Path scripts\11_compress_for_deploy.py

# Imports validieren
cd scripts
python -c "from model_utils import (classify_sample_confidence, compute_eligibility_columns, shrink_to_class_prior, shrink_features_inplace, build_multi_layer_tier); print('OK')"
cd ..
```

Output muss sein: `OK` plus alle 4 `True`. Wenn nicht → bevor Re-Run starten, Mount-Sync prüfen.

## Schritt 2: Backups anlegen

```powershell
# Existing CSVs als Recovery-Anker speichern
$backupSuffix = "bak_pre_sprint3_$(Get-Date -Format yyyyMMdd_HHmm)"
Copy-Item data\processed\unified_board_scores.csv "data\processed\unified_board_scores.csv.$backupSuffix"
Copy-Item data\processed\added_wins_projection.csv "data\processed\added_wins_projection.csv.$backupSuffix" -ErrorAction SilentlyContinue
Copy-Item data\processed\api_profiles.json "data\processed\api_profiles.json.$backupSuffix" -ErrorAction SilentlyContinue

Write-Host "Backups created with suffix: $backupSuffix"
```

## Schritt 3: Pipeline-Stages ausführen

**3.1 — Kernpipeline (02 + 10):**

```powershell
# Tier-Probabilities + ev_added_wins (02h/i/j)
python scripts\02h_nba_probability.py
python scripts\02i_added_wins_value.py
python scripts\02j_combine_projection.py

# Unified Board + ML-Calibration mit Bayesian-Shrinkage NEU
python scripts\10b_unified_scoring.py
python scripts\10c_ml_calibration.py
python scripts\10d_deploy_final.py
```

**Erwartete neue Outputs in 10c:**
```
-- ELIGIBILITY (Sample-Size Confidence) --
  Full:         15,452
  Partial:      11,306
  Insufficient: 18,112

-- BAYESIAN SHRINKAGE (Sprint-3.0.B, pseudo_count=50) --
  Shrunk 17 per-sample features against class-prior of Full-eligible.
    BPM                  mean    0.45 →   0.43  (max|Δ|= X.XX)
    OBPM                 mean    ... 
    ...

-- ML MODEL --
  Training-Set Filter (Sprint-3.0.A): Full+Partial only
  → ~165 training samples (was ~185)
```

**3.2 — 02k Annotation (für unified_board_scores):**

```powershell
python scripts\02k_eligibility_framework.py
```

Output sollte die Class-by-Class-Distribution zeigen.

**3.3 — Shooting V2 (analog Sprint-2):**

```powershell
python scripts\recompute_shooting_v2.py
python scripts\enrich_shooting_with_pid.py
python scripts\inject_shooting_v2.py
```

**3.4 — Risk Profile + NBA Role + Combine + Compression:**

```powershell
python scripts\draft_range_model.py
python scripts\draft_risk_model.py
python scripts\nba_transition.py
python scripts\11_compress_for_deploy.py
```

**Spot-Check beim 11_compress Output:** Suche im Log nach `tier_layered` — sollte mindestens für Top-Spieler komplett sein.

## Schritt 4: Quick-Validation

```powershell
cd C:\Users\tobia\ProspectTheory\data-pipeline\scripts

python -c @"
import pandas as pd
import json

df = pd.read_csv('../data/processed/added_wins_projection.csv')
top_2026 = df[df.entry_year == 2026].sort_values('ev_added_wins', ascending=False).head(15)
print('Top 15 2026er nach ev_added_wins:')
print(top_2026[['player_name', 'ev_added_wins', 'proj_tier', 'tier_probs']].to_string(index=False))
"@
```

**Was zu prüfen:**
- ✅ Boozer in Top-5
- ✅ Dybantsa, Peterson, Flemings, Wilson alle in Top-15
- ✅ KEINE Mini-Sample-Walk-ons in Top-15 (z.B. Dylan Lakatos, Christian Dedivanaj)
- ✅ tier_probs sind JSON-Strings mit allen 6 Tiers

## Schritt 5: Backend-Sync + Commit + Deploy

Identisch zu Sprint-2-Pattern:

```powershell
# Backend-Sync
cd C:\Users\tobia\ProspectTheory\data-pipeline
copy data\processed\api_profiles_part1.json ..\prospecttheory-web\backend\data\processed\
copy data\processed\api_profiles_part2.json ..\prospecttheory-web\backend\data\processed\
copy data\processed\api_profiles_part3.json ..\prospecttheory-web\backend\data\processed\
copy data\processed\unified_board_scores.csv ..\prospecttheory-web\backend\data\processed\
copy data\processed\added_wins_projection.csv ..\prospecttheory-web\backend\data\processed\

# Commit + Push (alle Sprint-3.0 Files zusammen)
cd ..\prospecttheory-web
git add backend\data\processed\api_profiles*.json
git add backend\data\processed\unified_board_scores.csv
git add backend\data\processed\added_wins_projection.csv
git add ..\data-pipeline\scripts\model_utils.py
git add ..\data-pipeline\scripts\02k_eligibility_framework.py
git add ..\data-pipeline\scripts\10c_ml_calibration.py
git add ..\data-pipeline\scripts\11_compress_for_deploy.py
git add SPRINT_3_0_DESIGN.md
git add SPRINT_3_0_RERUN_GUIDE.md
git add frontend\src\App.jsx  # falls Frontend-Updates dabei

git status   # verify alles staged

git commit -m @"
Sprint-3.0: Modell-Trustability Foundation

3.0.A Eligibility-Framework:
  - Empirisch begründete Sample-Size-Thresholds (p10 NBA-Spieler 2018-2024)
  - sample_confidence_tier als first-class Field
  - 10c filtert Training-Set auf Full+Partial

3.0.B Bayesian-Shrinkage:
  - shrink_to_class_prior für 17 Per-Sample-Features (BPM-Familie, Rates)
  - Pseudo-Count 50 empirisch kalibriert
  - Audit-Trail: {col}_raw erhalten

3.0.C Multi-Layer Tier Output:
  - profile.tier_layered = {point_estimate, modal, weighted_label, ci_95, sample_confidence}
  - Backend-vorberechnet, Frontend nur Display-Selektion
  - Single Source of Truth in model_utils.build_multi_layer_tier

Documents:
  - SPRINT_3_0_DESIGN.md (long-form architecture)
  - SPRINT_3_0_RERUN_GUIDE.md (operational playbook)
"@

git push origin main
```

## Schritt 6: Render-Deploy + Smoke-Test

Auto-Deploy wird via Webhook getriggert. Build-Log beobachten:

```
============================================================
  STEP 1/13: Install Python dependencies
  ...
  STEP 13/13: inject_shooting_m1.py
============================================================
[build.sh] prospecttheory.db: ~185M
[build.sh] Pipeline finished successfully.
```

**Smoke-Test (Sprint-3.0-specific):**

```powershell
# Kingston Flemings sollte jetzt Multi-Layer-Output haben
$resp = Invoke-RestMethod https://api.prospecttheory.io/api/player/kingston-flemings
$resp.profile.tier_layered | ConvertTo-Json

# Erwartet:
# {
#   "point_estimate": "Superstar",
#   "modal": "Role Player",
#   "weighted_label": "Role Player (32%)",
#   "ci_95": ["Negative", "Superstar"],
#   "sample_confidence": "Full"
# }

# Boozer sollte ähnlich, aber confidence tighter sein (mehr dominant modal)
$resp2 = Invoke-RestMethod https://api.prospecttheory.io/api/player/cameron-boozer
$resp2.profile.tier_layered | ConvertTo-Json

# Plus: Dylan Lakatos sollte verschwunden sein aus Top-Rankings
# (Bayesian-Shrinkage hat seinen BPM zur Class-Mean geschrunken)
```

## Rollback-Plan

Falls Sprint-3.0 unerwartete Probleme zeigt:

```powershell
# Zurück zu Backup-Files
cd C:\Users\tobia\ProspectTheory\data-pipeline
Copy-Item "data\processed\unified_board_scores.csv.bak_pre_sprint3_*" data\processed\unified_board_scores.csv -Force
# Plus äquivalent für andere Files

# Code rollback: git revert HEAD
cd ..\prospecttheory-web
git revert HEAD
git push origin main
```

Backup-Files sind in `data\processed\*.bak_pre_sprint3_<timestamp>`.

## Verification-Erwartungen

Nach erfolgreichem Re-Run + Deploy sollten folgende quantitative Aussagen stimmen:

| Test | Vorher | Erwartet nach Sprint-3.0 |
|---|---|---|
| Boozer ev_added_wins | ~hoch | ~ähnlich (3% shrinkage) |
| Boozer tier_layered.point_estimate | Superstar | Superstar |
| Boozer tier_layered.modal | (n/a) | Superstar oder All-Star |
| Kingston Flemings ev_added_wins | 9.18 | etwas niedriger (5-10% shrinkage) |
| Kingston Flemings tier_layered.modal | (n/a) | Role Player |
| Dylan Lakatos in Top-50 | ✓ | ✗ (Insufficient + shrinkage) |
| 2026 Class Insufficient % | ~40% | ~40% (Class-Konsistenz) |
| Total Profile Felder | ~155 | ~159 (tier_layered + sample_confidence_* hinzu) |

Wenn Werte stark abweichen → Designdoc-Review im Block "Methodische Begründung", entscheiden ob Calibration nachjustieren.
