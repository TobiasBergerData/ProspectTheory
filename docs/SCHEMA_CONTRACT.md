# Schema Contract: Pipeline ↔ Backend ↔ Frontend

Zentraler Kontrakt für alle Felder, die durch das System fließen. Jedes Feld
ist hier dokumentiert mit: Source (welche Pipeline-Stage produziert es),
Consumer (welche Backend/Frontend-Stelle liest es), Schema-Type, Constraints.

**Status:** Living Document, version-stempelt pro Sprint.

**Letzter Sprint:** 3.0 (2026-06-12)

---

## Architektur-Prinzip

```
Pipeline (data-pipeline)              Backend (prospecttheory-web/backend)              Frontend (prospecttheory-web/frontend)
─────────────────────────             ─────────────────────────────────────             ─────────────────────────────────────
Computes Fields                  →   Reads from api_profiles_part*.json           →   Maps to UI state, renders
Writes to api_profiles*.json         Optionally enriches (inject_*.py)                Display only, NO compute
                                     Serves /api/player/{slug}, etc.
```

**Regel:** Jeder berechnete Wert hat exakt einen Computation-Owner — die Pipeline.
Backend reicht durch + enriches mit Build-on-Deploy-Inject-Scripts.
Frontend macht KEINE Mathematik, nur Display-Choice.

---

## Sample-Confidence-Felder (Sprint-3.0.A)

### `profile.sample_confidence_tier`

| Aspekt | Wert |
|---|---|
| Type | `"Full" \| "Partial" \| "Insufficient"` |
| Source | `data-pipeline/scripts/model_utils.classify_sample_confidence` |
| Pipeline-Stage | 10c_ml_calibration (Sprint-3.0.A integration) |
| Backend-Field | unchanged passthrough |
| Frontend-Access | `player.sampleConfidence` |
| Constraints | non-null required, fallback "Unknown" |

### `profile.sample_n_effective`

| Aspekt | Wert |
|---|---|
| Type | `float` (GP × Min_per) |
| Source | `model_utils.compute_eligibility_columns` |
| Frontend-Access | `player.sampleNEffective` |

---

## Bayesian-Shrinkage Felder (Sprint-3.0.B)

### `profile.{BPM,OBPM,DBPM,college_usg,TS_per,...}` (17 Features)

| Aspekt | Wert |
|---|---|
| Type | `float` (shrunken Posterior) |
| Source | `model_utils.shrink_to_class_prior` (applied in 10c) |
| Audit-Trail | `{col}_raw` als Original-Wert erhalten |

---

## Multi-Layer Tier Output (Sprint-3.0.C)

### `profile.tier_layered`

| Aspekt | Wert |
|---|---|
| Type | Nested object (5 fields) |
| Source | `model_utils.build_multi_layer_tier` (called in 11_compress) |
| Reads | `tier_probs` + `proj_tier` aus added_wins_projection.csv |
| Frontend-Access | `player.tierLayered` |

```typescript
type TierLayered = {
  point_estimate:    string,                          // "Superstar" — aus ev_added_wins-Cuts
  modal:             string,                          // "Role Player" — mode(tier_probs)
  weighted_label:    string,                          // "Role Player (32%)" — display-fertig
  ci_95:             [string, string],                // ["Negative", "Superstar"] — CI
  sample_confidence: "Full" | "Partial" | "Insufficient" | "Unknown",
}
```

---

## Existing Core Fields (Sprint-2 stabil)

### `profile.tier`, `profile.predicted_tier`, `profile.proj_tier`

Legacy Single-Tier-Fields. Bleiben für Backward-Compatibility. Frontend
nutzt diese als Fallback wenn `tier_layered` fehlt.

### `profile.addedWins`

Nested object mit `ev`, `tierProbs`, `floor`, `ceiling`, etc.
Source: `inject_added_wins.py` im Backend-Build-Time.

### `profile.shooting`

Nested object mit `skill`, `intent`, `volume`, `touchTier`, `nNcaa3pa`, etc.
Source: `inject_shooting_v2.py` (data-pipeline-side) + `inject_shooting_m1.py`
(Backend-Build-Time).

---

## Pipeline-Output Files (Sprint-3.0)

Diese müssen aus data-pipeline kommen und im prospecttheory-web/backend
synchron sein:

| File | Producer | Consumer |
|---|---|---|
| `api_profiles_part1.json` | `11_compress_for_deploy.py` | Backend `build_db.py` |
| `api_profiles_part2.json` | `11_compress_for_deploy.py` | Backend `build_db.py` |
| `api_profiles_part3.json` | `11_compress_for_deploy.py` | Backend `build_db.py` |
| `api_search_index.json` | `11_compress_for_deploy.py` | Backend search |
| `api_stat_comps.json` | `11_compress_for_deploy.py` | Backend `build_db.py` |
| `api_anthro_comps.json` | `11_compress_for_deploy.py` | Backend `build_db.py` |
| `shooting_diss_predictions.csv` | `recompute_shooting_v2.py` | Backend `inject_shooting_m1.py` |
| `added_wins_projection.csv` | `02j_combine_projection.py` | Backend `inject_added_wins.py` |
| `draft_risk_all.csv` | `draft_risk_model.py` | Backend `inject_draft_risk.py` |
| `nba_role_projection_all.csv` | `nba_transition.py` | Backend `inject_nba_role.py` |
| Plus PBP CSVs (`pbp_*.csv`) | upstream Pipeline | various inject_*.py |

**Validation-Gate** (sprint3_validate.py) prüft Coverage und Konsistenz aller
dieser Files vor Backend-Sync.

---

## Cross-Repo Workflow für neue Felder

Wenn ein neues Feld eingeführt wird, das durch alle drei Schichten fließt:

1. **Pipeline (`data-pipeline` Repo):** Compute-Logic in
   `model_utils.py` (Single Source of Truth) + Apply in passender Stage.
   Test im sprint3_validate-Block.

2. **Schema-Contract:** Eintrag in dieser Datei (SCHEMA_CONTRACT.md).
   Field-Name, Type, Source, Constraints.

3. **Backend (`prospecttheory-web` Repo):**
   Field-Name in `UNIFIED_FIELDS` von `11_compress_for_deploy.py` hinzufügen
   damit es durchgereicht wird. Optional `inject_*.py` falls Backend-Enrich
   nötig.

4. **Frontend (`prospecttheory-web` Repo):**
   `App.jsx` mapping erweitern. Display-Component bauen oder bestehende
   reusen.

5. **Documentation:** Eintrag in `METHODS_DICT.md` für Tooltip-Source.

**Atomic Push:** Pipeline-Change wird ZUERST gepusht, dann Backend+Frontend
in einem Commit nach Pipeline-Re-Run. So vermeiden wir API-Field-Drift
zwischen Pipeline und Backend.

---

## Versioning

Schema-Contract wird pro Sprint aktualisiert. Major-Changes (Breaking)
bekommen Migration-Notes hier:

### Sprint-3.0 → Sprint-3.1 (geplant)

- Keine Breaking Changes geplant
- Sprint-3.1 fokus: Creation Pillar v3 (eigene Felder neu)
- Sprint-3.2 fokus: Archetype Audit (eigene Felder neu)
