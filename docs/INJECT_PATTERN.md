# Backend Inject Script — Pattern Reference

**Status:** Permanent Reference. Plus zu lesen BEVOR ein neuer
`inject_*.py` script geschrieben wird. Plus die Lessons aus Sprint-3.26
+ 3.27 wurzeln hier.

**Wurzel-Regel:**
> Jeder inject script ist ein Memory-disziplinierter Streaming-Loader mit
> Self-Verify am Ende. Plus die Render Free-Tier 512MB Disziplin ist KEIN
> nice-to-have, sondern Existenz-Voraussetzung. Plus build success ≠
> Funktionalität — jeder Step braucht eigene Verifikation.

---

## Wann ein neuer Inject Script

Ein neuer `backend/inject_<name>.py` kommt dazu wenn:

- Plus neue Felder ins `profile.data` dict geschrieben werden müssen (für
  Frontend-Konsumption über `/api/player/{slug}`)
- Plus die Daten aus einer **CSV** im backend `data/processed/` Ordner kommen
- Plus die Daten **nicht** im `api_profiles_part*.json` bereits drin sind
- Plus die Daten **nicht** via 11_compress in den JSONs landen können (z.B.
  weil sie zu groß sind oder erst beim Build berechnet werden)

Plus alle anderen Felder kommen via 11_compress → JSON → build_db direkt
in die DB ohne separaten inject step.

---

## Die 5-Schritt-Architektur

### Schritt 1 — CSV Loading mit verbose Path-Resolution

```python
BASE = Path(__file__).resolve().parent
CSV_LOCAL = BASE / "data" / "processed" / "pbp_<feature>_2025-26.csv"
CSV_PIPELINE = BASE.parent.parent / "data-pipeline" / "data" / "processed" / "pbp_<feature>_2025-26.csv"

def main():
    print(f"[<feature>] CWD: {Path.cwd()}")
    print(f"[<feature>] CSV_LOCAL: {CSV_LOCAL} (exists={CSV_LOCAL.exists()})")
    print(f"[<feature>] CSV_PIPELINE: {CSV_PIPELINE} (exists={CSV_PIPELINE.exists()})")

    csv_path = CSV_LOCAL if CSV_LOCAL.exists() else CSV_PIPELINE
    if not csv_path.exists():
        print(f"❌ CSV not found in either location — SKIPPING")
        sys.exit(0)   # graceful skip, don't fail build
```

Plus die CSV_LOCAL ist die Production-Lokation auf Render. Plus CSV_PIPELINE
ist die Dev-Lokation für lokales Testen. Plus die verbose Prints helfen bei
Debugging wenn Path-Resolution falsch geht.

### Schritt 2 — Master DataFrame + Name-Index

```python
master = pd.read_csv(csv_path, low_memory=False)
print(f"[<feature>]   {len(master):,} player-seasons loaded")

if len(master) == 0:
    print(f"[<feature>] ⚠ CSV empty — SKIPPING")
    sys.exit(0)

master["_nname"] = master["player_name"].apply(norm_name)
master = master.sort_values("season").groupby("_nname", as_index=False).tail(1)
print(f"[<feature>]   {len(master):,} after dedupe by normalized name")

# Name-index: ~1MB für 1k entries, akzeptabel im RAM
by_name = {row["_nname"]: row for _, row in master.iterrows()}
```

Plus `norm_name` aus `name_utils.py` ist die canonical Identity-Quelle.
Plus die Per-Name-Dedupe behält die LATEST Saison (intl-Mind wenn jünger
als NCAA-Mind, etc.).

### Schritt 3 — Streaming Cursor + Separate Connections

**KRITISCH:** kein `fetchall()`. Plus die ist OOM-Garant auf 512MB Free
Tier wenn 10k+ profile-Blobs auf einmal in RAM.

```python
if not DB.exists():
    print(f"❌ DB nicht gefunden: {DB}")
    sys.exit(1)

read_conn = sqlite3.connect(DB)
read_conn.row_factory = sqlite3.Row
write_conn = sqlite3.connect(DB)

total = read_conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
print(f"[<feature>]   DB profiles total: {total:,}")
```

Plus zwei SEPARATE Connections für SELECT (streaming iteration) und UPDATE
(mid-iteration writes). Plus ein einzelner Cursor würde bei UPDATE während
SELECT-iteration locks/race-conditions verursachen.

### Schritt 4 — Batch-Commit Loop

```python
n_seen = n_decode_fail = n_no_name = n_no_match = n_updated = 0
BATCH_COMMIT = 500

for row in read_conn.execute("SELECT player_id, data FROM profiles"):
    n_seen += 1
    pid = row["player_id"]
    data_blob = row["data"]

    try:
        data = json.loads(zlib.decompress(data_blob).decode("utf-8"))
    except Exception:
        n_decode_fail += 1
        continue

    name = data.get("name") or data.get("player_name")
    if not name:
        n_no_name += 1
        continue

    nname = norm_name(name)
    match = by_name.get(nname)
    if match is None:
        n_no_match += 1
        continue

    # ── Build feature block + assign ──
    data["<feature>"] = build_feature_block(match)

    new_blob = zlib.compress(json.dumps(data).encode("utf-8"))
    write_conn.execute(
        "UPDATE profiles SET data = ? WHERE player_id = ?",
        (new_blob, pid),
    )
    n_updated += 1

    if n_updated % BATCH_COMMIT == 0:
        write_conn.commit()
        print(f"[<feature>]   {n_seen}/{total} processed, "
              f"{n_updated} updated (committed)")

write_conn.commit()
read_conn.close()
write_conn.close()
```

Plus die Batch-Commit alle 500 Updates hat zwei Wirkungen:
1. **WAL klein halten** — sonst wächst die SQLite Write-Ahead-Log unkontrolliert
2. **Crash-safe** — bei mid-loop crash sind die letzten ≤500 Updates verloren,
   nicht alle

### Schritt 5 — Summary + Self-Verify SELECT

```python
print(f"\n[<feature>] ── Summary ──")
print(f"  Profiles seen:        {n_seen:,}")
print(f"  Decode failures:      {n_decode_fail:,}")
print(f"  No name in profile:   {n_no_name:,}")
print(f"  No match in CSV:      {n_no_match:,}")
print(f"  ✓ Updated with <feature>: {n_updated:,}")

# Self-Verify: zähle Profile mit dem field NACH commit
verify_conn = sqlite3.connect(DB)
n_with_field = verify_conn.execute(
    "SELECT COUNT(*) FROM profiles WHERE data LIKE ?",
    ('%"<feature>"%',),
).fetchone()[0]
verify_conn.close()
print(f"  ✓ Verify: profiles containing <feature> field: {n_with_field:,}")

if n_with_field == 0 and n_updated > 0:
    print("❌ CRITICAL: updates reported but verify shows 0 — commit didn't persist!")
    sys.exit(1)
```

Plus die Self-Verify ist die ehrliche Antwort auf "build success ≠
Funktionalität". Plus wenn `n_updated > 0` aber `n_with_field = 0`, dann ist
die DB nicht persistiert (OOM mid-loop, WAL nicht aufgesammelt, etc.).
Plus `exit 1` → Render zeigt "Build failed" → wir wissen es eindeutig.

---

## Schema-Pflege (3-Layer Pattern)

Plus bei einem neuen Feld via inject script muss in 3 Stellen geschrieben werden:

### Layer 1 — Inject Script (Backend)
Plus der inject script selbst (`inject_<feature>.py`) schreibt das field
ins `profile.data` dict via DB-UPDATE.

### Layer 2 — Frontend Field-Mapping (App.jsx)
```javascript
// in mapProfile(d)
<feature>: d.<feature> ?? null,
```

Plus die Frontend liest das field aus der API-Response (`/api/player/{slug}`).
Plus die `?? null` fallback ist defensive.

### Layer 3 — Frontend UI Rendering
Plus die UI-Card/Section die das field nutzt:
```jsx
{p.<feature> && p.<feature>.<some_condition> && (
  <Component data={p.<feature>} />
)}
```

Plus die Conditional verhindert Render-Errors bei missing field.

### NICHT in 11_compress (häufiger Fehler!)
Plus ein inject-geschriebenes field MUSS NICHT in `11_compress.py` ins
slim_profile dict. Plus die `mindMetrics`, `usageReaction`, `gameLogs`,
`leverageEff` etc. werden ALLE erst nach 11_compress + build_db.py durch
die inject pipeline geschrieben. Plus die Daten sind in der CSV, NICHT
im unified_board CSV.

---

## build.sh Integration

```bash
INJECT_STEPS=(
  "inject_shot_creation_spectrum.py"
  "inject_leverage_efficiency.py"
  "inject_skill_curve.py"
  "inject_ogbpm.py"
  "inject_mind_metrics.py"
  "inject_season_advanced.py"
  "inject_game_logs.py"
  "inject_<new_feature>.py"        # ← hier neuen step einfügen
  "inject_draft_risk.py"
  ...
)
```

Plus die step-count in den `log_step` strings updaten (von z.B. 14/14 zu
15/15). Plus die Reihenfolge ist KRITISCH:
- Plus die `inject_leverage_efficiency.py` muss NACH `inject_shot_creation_
  spectrum.py` laufen (liest shotCreation field)
- Plus die `inject_shooting_m1.py` muss am Ende (M1-Layer auf v2-Output)
- Plus die `inject_position_overrides.py` IMMER zuletzt (Manual Override)

---

## Common Pitfalls + Fixes

### Pitfall 1 — `cur.fetchall()` Memory Spike
**Symptom:** Build succeeds, deploy live, aber API JSON hat das field nicht.
**Wurzel:** OOM mid-loop, kein commit, Process SIGKILLed, build.sh sieht
keinen non-zero exit.
**Fix:** Streaming cursor (Schritt 3).

### Pitfall 2 — Falsche Column Name in SQL
**Symptom:** Build crashed bei first SELECT, nachfolgende inject steps
laufen nicht, `/api/board` returns 0 prospects.
**Wurzel:** profiles-Tabelle hat `player_id`, NICHT `pid`.
**Fix:** Copy existing inject als Template (NIE from scratch).

### Pitfall 3 — Single Connection für SELECT + UPDATE
**Symptom:** "database is locked" oder weird race conditions.
**Wurzel:** Cursor-Konflikt zwischen streaming SELECT und mid-iteration UPDATE.
**Fix:** Separate `read_conn` + `write_conn` (Schritt 3).

### Pitfall 4 — Missing build.sh Step
**Symptom:** API JSON nicht updated, kein inject-log auf Render.
**Wurzel:** vergessen, den neuen script in `INJECT_STEPS` aufzunehmen.
**Fix:** build.sh editieren + step-count strings updaten.

### Pitfall 5 — `set -euo pipefail` greift nicht bei OOM
**Symptom:** Build "succeeds", aber API hat field nicht.
**Wurzel:** Kernel SIGKILL produziert keinen non-zero exit auf bash level.
**Fix:** Self-Verify SELECT am Ende mit `exit 1` (Schritt 5).

### Pitfall 6 — `norm_name` mismatch
**Symptom:** `n_no_match` ist sehr hoch (>50%), die meisten Profile bekommen
das field nicht.
**Wurzel:** CSV nutzt anderen norm_name als die DB.
**Fix:** beide Seiten müssen `from name_utils import norm_name` nutzen
(single source of truth seit Sprint-3.x).

---

## Testing Checklist

Bevor du eine inject script committest:

- [ ] Lokal getestet (CSV in data-pipeline + DB-Path angepasst)
- [ ] Print-Output zeigt korrekt: csv_loaded, deduped, total_profiles, n_updated
- [ ] Self-Verify-SELECT am Ende zeigt n_with_field > 0
- [ ] Existing inject script als Template kopiert (NIE from scratch)
- [ ] SQL-Statements: `SELECT player_id, data FROM profiles` (NICHT `pid`!)
- [ ] UPDATE WHERE clause: `WHERE player_id = ?` (NICHT `pid`)
- [ ] Streaming-Loop statt `fetchall()` 
- [ ] Separate read + write connections
- [ ] Batch-commit alle 500 Updates
- [ ] CSV-Pfad mit `CSV_LOCAL = BASE / "data" / "processed" / ...`
- [ ] Graceful `sys.exit(0)` wenn CSV fehlt
- [ ] `sys.exit(1)` wenn Self-Verify failure
- [ ] CSV nach `prospecttheory-web/backend/data/processed/` kopiert
- [ ] build.sh INJECT_STEPS Liste erweitert
- [ ] build.sh step-count strings aktualisiert (X/N)
- [ ] Frontend `App.jsx` mapProfile + UI-Card hinzugefügt
- [ ] git diff für inject script angeschaut auf weitere Bugs

---

## Reference Implementations

Plus die canonical Templates für Copy-Paste:

| Template | Sprint | Pattern-Highlights |
|----------|--------|---------------------|
| `inject_mind_metrics.py` | 3.17+3.24 | Master CSV concat (NCAA + Intl), latest-season per name |
| `inject_usage_reaction.py` (v2) | 3.27 | **Sprint-3.27 Streaming-Reference** — separate connections, batch-commit, self-verify |
| `inject_shooting_m1.py` | 3.X | Schöne kompakte Implementation |

Plus die `inject_usage_reaction.py` (v2 nach 3.27 fix) ist die canonical
streaming-reference. Plus beim nächsten inject script: dieser als Template
kopieren.

---

## Historic Context

| Wann | Inject Pipeline | Issue |
|------|-----------------|-------|
| Sprint-3.14 | build_db.py OOM-fix (chunked batching) | Initial 512MB Disziplin |
| Sprint-3.20 | 11_compress 2-Layer schema (UNIFIED_FIELDS + slim_profile) | dokumentiert in PROJECTION_PATTERN.md |
| Sprint-3.26 | `pid` vs `player_id` column bug | Production-stopper |
| Sprint-3.27 | streaming + batch-commit + self-verify | dieser doc |

Plus die heutigen Lessons (3.26 + 3.27) komplementieren das PROJECTION_
PATTERN.md (gestern, 3.21).

---

*Erstellt 2026-06-15 nach Sprint-3.27 deployment. Plus die Doku ist die*
*canonical Reference für künftige inject scripts. Bei neuem inject zuerst*
*hier lesen, dann Template copy, dann checklist.*
