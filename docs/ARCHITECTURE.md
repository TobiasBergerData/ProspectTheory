# ProspectTheory Architecture

Living document. Beschreibt die Module-Struktur und Datenflüsse.

Stand: 2026-06-12

---

## Repos

```
ProspectTheory/                             ← Workspace-Root
├── data-pipeline/                          ← Pipeline-Repo (lokal, nicht deployed)
│   ├── data/
│   │   ├── raw/                            ← BartTorvik, Combine, etc.
│   │   └── processed/                      ← Pipeline-Outputs
│   └── scripts/                            ← Pipeline-Stages
│
└── prospecttheory-web/                     ← Web-Service-Repo (GitHub-tracked, Render-deployed)
    ├── backend/                            ← FastAPI service
    │   ├── main.py                         ← API routes
    │   ├── build.sh                        ← Render Build-Pipeline (Sprint-2)
    │   ├── inject_*.py                     ← Build-on-Deploy Steps
    │   └── data/processed/                 ← Pre-computed JSONs synct from data-pipeline
    ├── frontend/                           ← React/Vite
    │   └── src/App.jsx                     ← Single-file app
    └── render.yaml                         ← Blueprint-Spec (Sprint-2 Architektur)
```

---

## Pipeline-Stages (Reihenfolge)

```
01a-01z  ← Roh-Daten Sammlung (BartTorvik, NBA, Combine, FIBA)
02a-02g  ← Targets + xRAPM + Liga-Weights
02h      ← P(NBA) Logistic Regression
02i      ← E[AW | NBA] Regression
02j      ← Combine Projection (tier_probs, proj_tier, ev_added_wins)
02k      ← Eligibility Framework (Sprint-3.0.A — annotation step) ★ NEU
10b      ← Unified Scoring (aggregiert in unified_board_scores.csv)
10c      ← ML Calibration (LightGBM auf peak_pie)
           - Bayesian-Shrinkage VOR Feature-Engineering (Sprint-3.0.B) ★
           - Training-Set-Filter auf Full+Partial (Sprint-3.0.A) ★
10d      ← Deploy Final
10e      ← Intl Tier Classifier
nba_transition.py ← NBA Role Projection
draft_range_model.py ← Range/Merit-Slot
draft_risk_model.py ← Bust/Star-Probabilities
inject_shooting_v2.py + ... ← Shooting Three-Layer
11       ← Compress for Deploy (api_profiles.json bauen)
           - Multi-Layer tier_layered Composition (Sprint-3.0.C) ★ NEU
sprint3_validate.py ← Pre-Deploy Validation (Sprint-3.0.D) ★ NEU
```

★ = Sprint-3.0 Änderung

---

## Backend Build-on-Deploy (Render)

Bei jedem Render-Deploy läuft `backend/build.sh` mit 13 Steps:

```
STEP 1/13:  pip install -r requirements.txt
STEP 2/13:  build_db.py                       ← lädt api_profiles → SQLite
STEP 3/13:  inject_shot_creation_spectrum.py
STEP 4/13:  inject_leverage_efficiency.py
STEP 5/13:  inject_skill_curve.py
STEP 6/13:  inject_ogbpm.py
STEP 7/13:  inject_mind_metrics.py
STEP 8/13:  inject_season_advanced.py
STEP 9/13:  inject_game_logs.py
STEP 10/13: inject_draft_risk.py
STEP 11/13: inject_nba_role.py
STEP 12/13: inject_added_wins.py
STEP 13/13: inject_shooting_m1.py
STEP 14/13: inject_position_overrides.py      ← Manual Scout-Fixes
```

Source-of-Truth: `backend/build.sh` (versioniert) + `render.yaml` (Blueprint-Spec).
Sprint-2 hat das aus dem Render-Dashboard-Build-Command-Feld herausgezogen.

---

## Single Source of Truth — `model_utils.py`

Nach Sprint-3.0 kapselt `data-pipeline/scripts/model_utils.py` die zentrale Modellierungs-Logik:

```python
# Sample-Confidence (3.0.A)
SAMPLE_FULL_GP_THRESHOLD       = 24
SAMPLE_FULL_MIN_THRESHOLD      = 25
SAMPLE_PARTIAL_GP_THRESHOLD    = 15
SAMPLE_PARTIAL_MIN_THRESHOLD   = 15
classify_sample_confidence(gp, min_per) → str
compute_eligibility_columns(df) → df

# Bayesian-Shrinkage (3.0.B)
DEFAULT_SHRINKAGE_PSEUDO_COUNT = 50
shrink_to_class_prior(series, n_obs, group_keys, eligible_mask, n_pseudo) → series
shrink_features_inplace(df, feature_cols, group_keys, n_obs_col, eligible_tier, n_pseudo) → diagnostics

# Multi-Layer Tier (3.0.C)
TIER_ORDER = ["Negative", "Replacement", "Role Player", "Starter", "All-Star", "Superstar"]
compute_modal_tier(tier_probs) → str
compute_tier_ci(tier_probs, alpha) → (lo, hi)
build_weighted_label(tier_probs, modal_dominance_pp) → str
build_multi_layer_tier(point_estimate, tier_probs, sample_confidence) → dict
```

Importer:
- `02k_eligibility_framework.py` (CSV-Annotation)
- `10c_ml_calibration.py` (Shrinkage + Training-Filter)
- `11_compress_for_deploy.py` (Multi-Layer Tier Composition)
- `sprint3_validate.py` (Validation-Framework)

---

## LEAK-Regex (Data-Leakage-Schutz)

`model_utils.py` enthält eine `LEAK` regex, die Spalten matcht die NICHT als ML-Features verwendet werden dürfen. Sprint-3.0 hat `sample_` zu dieser Regex hinzugefügt — alle `sample_confidence_*` und `sample_n_effective` Felder bleiben automatisch Metadata.

---

## Frontend Architecture Principles (Sprint-3.0)

```
Backend (Build-Time, einmal):     Mathematik / Modell-Berechnung
Frontend (Runtime):                Lookup + Display-Choice
```

Faustregel: Wenn Formel → Backend. Wenn String-Lookup oder einfacher Filter → Frontend.

**Konkret für Multi-Layer Tier:**
- Backend pre-computes `profile.tier_layered` mit allen 5 Sichten (point_estimate, modal, weighted_label, ci_95, sample_confidence)
- Frontend wählt **welche** Sicht angezeigt wird — kein Compute
- METHODS_DICT.md ist single-source-of-truth für Tooltip-Texte

Reusable Components in App.jsx:
- `<TierBadge tier="..." />`
- `<SampleConfidenceBadge confidence="..." nEffective={...} />`
- `<MultiLayerTierDisplay tierLayered={...} mode="..." />`

---

## Build & Deploy

### Local Re-Run

```powershell
# Nach Sprint-3.0 Änderungen:
cd C:\Users\tobia\ProspectTheory\data-pipeline
python scripts\02h_nba_probability.py
python scripts\02i_added_wins_value.py
python scripts\02j_combine_projection.py
python scripts\10b_unified_scoring.py
python scripts\10c_ml_calibration.py
python scripts\10d_deploy_final.py
python scripts\02k_eligibility_framework.py  # annotation
python scripts\recompute_shooting_v2.py
python scripts\enrich_shooting_with_pid.py
python scripts\inject_shooting_v2.py
python scripts\draft_range_model.py
python scripts\draft_risk_model.py
python scripts\nba_transition.py
python scripts\11_compress_for_deploy.py
python scripts\sprint3_validate.py  # Pre-Deploy Gate

# Sync zum backend
copy data\processed\api_profiles_part*.json ..\prospecttheory-web\backend\data\processed\
copy data\processed\unified_board_scores.csv ..\prospecttheory-web\backend\data\processed\

cd ..\prospecttheory-web
git add ...
git commit -m "..."
git push origin main
```

Render Auto-Deploy nimmt sich den Push und baut.

### Validation Gate

`sprint3_validate.py` führt 5 quantitative Checks aus:
1. Eligibility Class Distribution (Konsistenz über Klassen)
2. NBA Recall by Confidence (Backtest 2018-2024)
3. Outlier Filter Effectiveness (Top-25)
4. Bayesian-Shrinkage Calibration (Boozer + Mini-Sample)
5. Multi-Layer Tier Coverage (api_profiles)

Exit-Code 1 bei critical fails → CI/CD könnte das nutzen.

---

## Backlog (Architektur-Bezogene Tasks)

- **#61** Blueprint-Migration — bestehender Render-Service auf `render.yaml`-Spec umstellen
- **#62** Git-Index-Drift-Detector als GitHub Action
- **#37** Comps Pipeline-Re-Sync v3 → v4 + Anthro Coverage
- **3.0.E** International-Spieler eigene Sample-Threshold-Kalibration
- **3.0.F** Per-Feature Pseudo-Count statt einheitlich 50
- **3.0.G** ev_added_wins-CI proportional zu sample_n_effective

---

## Sprint-Historie

| Sprint | Datum | Scope |
|---|---|---|
| Sprint-1 | 2026-06-04 | Boozer-Slug, Stamina, Badges, Self-Sufficiency |
| Sprint-2 | 2026-06-04 | Pipeline-Re-Foundation: xRAPM-Fix, rank-in-class merit_slot, Name-Kollisionen |
| Sprint-2.4 | 2026-06-04 | Risk-Tab Re-Enable, Three-Layer Shooting V2 |
| Sprint-Recovery | 2026-06-11 | Git-Index-Korruption Recovery (4 Commits, 50 MB) |
| **Sprint-3.0** | **2026-06-12** | **Modell-Trustability: Eligibility + Shrinkage + Multi-Layer Tier** |

Vollständige Logs in `DAY_LOG_2026-06-11.md` + `SPRINT_3_0_DESIGN.md`.
