#!/usr/bin/env python3
"""
inject_leverage_efficiency.py — Leverage-Weighted Efficiency (LWE)
===================================================================
Computes Self-Creation-Weighted eFG% per player and injects into DB profiles.

METRIC DEFINITION
-----------------
Standard eFG% treats all FGA equally regardless of shot difficulty.
Leverage-Weighted eFG% (lweFG) up-weights shots the player created
for themselves — these are inherently higher-leverage because no
teammate bailout was possible.

  For each zone z:
    eFG_z    = zone_FG% × (1.5 if 3-pointer else 1.0)     [eFG scale]
    weight_z = zone_FGA × (selfPct_z / 100)                [difficulty weight]

  lweFG = Σ(eFG_z × weight_z) / Σ(weight_z)               [weighted average]
  raweFG = Σ(eFG_z × zone_FGA) / Σ(zone_FGA)              [unweighted baseline]
  diffPrem = lweFG − raweFG                                 [difficulty premium, pp]

  Positive diffPrem → player shoots BETTER on self-created shots.
  Negative diffPrem → player shoots WORSE when they create for themselves.

DATA SOURCE
-----------
Uses `shotCreation` field already in profiles (injected by inject_shot_creation_spectrum.py).
Fields used: zone.fga, zone.pct (FG%), zone.selfPct (% of makes self-created).
Minimum threshold: Σ(weight_z) >= 15 (at least 15 leverage-weighted attempts).

INJECTED FIELD: leverageEff
---------------------------
{
  "lweFG":    52.3,   // self-creation-weighted eFG% (0-150)
  "raweFG":   50.1,   // unweighted zone eFG% (should ≈ profile efg)
  "diffPrem": 2.2,    // lweFG − raweFG (difficulty premium, pp)
  "score":    71,     // lweFG percentile in same-year cohort (0-100)
  "premPctl": 68,     // diffPrem percentile in same-year cohort (0-100)
  "usgPctl":  78,     // USG% percentile in same-year cohort (0-100)
  "usg":      30.6,   // raw USG%
  "ts":       65.3,   // raw TS% (context only)
  "lwTotal":  142.8,  // total leverage-weighted attempts (Σ weight_z)
  "zones": {          // only zones with FGA >= 10
    "rim":   {"eFG": 65.3, "selfPct": 41.2, "fga": 312, "lwWeight": 128.5},
    "mid":   {"eFG": 40.0, "selfPct": 93.8, "fga": 40,  "lwWeight": 37.5},
    "three": {"eFG": 59.7, "selfPct": 22.6, "fga": 133, "lwWeight": 30.1},
    "dunk":  {"eFG": 92.3, "selfPct":  5.0, "fga": 42,  "lwWeight":  2.1}
  }
}

PERCENTILE RANKING
------------------
Ranked within same season_year cohort (college classes don't compare across decades).
Players with insufficient data get no `leverageEff` field (not a 0 — absence is explicit).
"""

import sqlite3, zlib, json, sys, traceback
from pathlib import Path
import numpy as np
import pandas as pd
from name_utils import norm_name  # Backlog 1.3: einheitliches Cross-Source-Matching

# ── Paths ──────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent  # backend/ on Render
DB   = BASE / "data" / "processed" / "prospecttheory.db"

# ── Thresholds ─────────────────────────────────────────────────────────────
MIN_LW_WEIGHT  = 15.0   # min Σ(weight_z) to compute lweFG
MIN_ZONE_FGA   = 10     # min FGA in zone to include zone in calculation
MIN_USG        = 8.0    # min USG% to compute USG percentile meaningfully


def compute_lwe(sc: dict) -> dict | None:
    """
    Compute Leverage-Weighted eFG% from shotCreation dict.
    Returns None if insufficient data.

    Zone mapping:
      "rim"   → standard 2-pointer
      "mid"   → standard 2-pointer
      "three" → 3-pointer (eFG × 1.5 multiplier)
      "dunk"  → standard 2-pointer
    """
    ZONES = {
        "rim":   1.0,   # eFG multiplier
        "mid":   1.0,
        "three": 1.5,   # 3-point eFG conversion (FG% × 1.5)
        "dunk":  1.0,
    }

    zones_out = {}
    sum_efg_w = 0.0   # Σ(eFG_z × weight_z)
    sum_w     = 0.0   # Σ(weight_z)       — leverage-weighted denom
    sum_efg_f = 0.0   # Σ(eFG_z × fga_z)  — raw denom numerator
    sum_fga   = 0.0   # Σ(fga_z)          — raw denom

    for zone, efg_mult in ZONES.items():
        zd = sc.get(zone)
        if not zd:
            continue
        fga      = zd.get("fga", 0)
        fg_pct   = zd.get("pct", 0)    # FG% (0-100)
        self_pct = zd.get("selfPct", 0) # % of makes self-created (0-100)

        # Guard against None values (zone recorded but selfPct/pct missing)
        if fga is None or fg_pct is None or self_pct is None:
            continue
        if fga < MIN_ZONE_FGA:
            continue

        efg_z  = float(fg_pct) * efg_mult         # eFG value (e.g., 60.0 or 59.7)
        weight = float(fga) * (float(self_pct) / 100.0)  # leverage weight

        sum_efg_w += efg_z * weight
        sum_w     += weight
        sum_efg_f += efg_z * fga
        sum_fga   += fga

        zones_out[zone] = {
            "eFG":      round(efg_z, 1),
            "selfPct":  round(self_pct, 1),
            "fga":      fga,
            "lwWeight": round(weight, 1),
        }

    if sum_w < MIN_LW_WEIGHT or sum_fga < 1:
        return None

    lw_efg  = sum_efg_w / sum_w
    raw_efg = sum_efg_f / sum_fga

    return {
        "lweFG":   round(lw_efg, 2),
        "raweFG":  round(raw_efg, 2),
        "diffPrem": round(lw_efg - raw_efg, 2),
        "lwTotal": round(sum_w, 1),
        "zones":   zones_out,
    }


def load_all_profiles(conn: sqlite3.Connection) -> list[tuple[str, str, dict]]:
    """Load all profiles from DB. Returns list of (player_id, name_key, profile_dict).
    Tobias 2026-05-06 IDENTITY-FIX: player_id ist PK, name kann duplicates haben."""
    rows = conn.execute("SELECT player_id, name, data FROM profiles").fetchall()
    result = []
    for player_id, name_key, blob in rows:
        try:
            p = json.loads(zlib.decompress(blob))
            result.append((player_id, name_key, p))
        except Exception:
            pass
    return result


def compute_percentiles(records: list[dict]) -> dict[str, dict]:
    """
    Compute per-cohort (season_year) percentiles for lweFG, diffPrem, USG.
    Returns {name_yr_key: {score, premPctl, usgPctl}} mapping.
    """
    # Build DataFrame for percentile computation
    rows = []
    for r in records:
        if r.get("lwe") is None:
            continue
        rows.append({
            "key":     r["key"],
            "yr":      r["yr"],
            "lweFG":   r["lwe"]["lweFG"],
            "diffPrem":r["lwe"]["diffPrem"],
            "usg":     r.get("usg"),
        })

    df = pd.DataFrame(rows)
    if df.empty:
        return {}

    result = {}

    for yr, grp in df.groupby("yr"):
        n = len(grp)
        if n < 10:
            continue

        lw_sorted  = grp["lweFG"].rank(pct=True, method="average")
        dp_sorted  = grp["diffPrem"].rank(pct=True, method="average")
        usg_sorted = grp["usg"].rank(pct=True, method="average", na_option="keep")

        for idx in grp.index:
            key = grp.loc[idx, "key"]
            result[key] = {
                "score":    int(round(lw_sorted.loc[idx] * 100)),
                "premPctl": int(round(dp_sorted.loc[idx] * 100)),
                "usgPctl":  int(round(usg_sorted.loc[idx] * 100)) if not pd.isna(usg_sorted.loc[idx]) else None,
                "usg":      grp.loc[idx, "usg"],
            }

    return result


def main():
    print("=" * 65)
    print("INJECT LEVERAGE-WEIGHTED EFFICIENCY")
    print("  Metric: Self-Creation-Weighted eFG%")
    print("  Source: shotCreation field in DB profiles")
    print("=" * 65)

    if not DB.exists():
        print(f"ERROR: DB not found at {DB}")
        sys.exit(1)

    conn = sqlite3.connect(DB)
    profiles = load_all_profiles(conn)
    print(f"\nLoaded {len(profiles):,} profiles")

    # ── Step 1: Compute raw LWE for each profile ────────────────────────────
    records = []
    n_no_sc = 0
    n_insufficient = 0
    n_computed = 0

    # Tobias 2026-05-06 IDENTITY-FIX: key = player_id (PK), nicht name (kann duplicates).
    for player_id, name_key, p in profiles:
        yr  = p.get("yr")
        usg = p.get("usg")
        ts  = p.get("ts")
        sc  = p.get("shotCreation")

        if not sc:
            n_no_sc += 1
            records.append({"key": player_id, "yr": yr, "usg": usg, "ts": ts, "lwe": None})
            continue

        lwe = compute_lwe(sc)
        if lwe is None:
            n_insufficient += 1
            records.append({"key": player_id, "yr": yr, "usg": usg, "ts": ts, "lwe": None})
            continue

        n_computed += 1
        records.append({"key": player_id, "yr": yr, "usg": usg, "ts": ts, "lwe": lwe})

    print(f"\nComputation results:")
    print(f"  Computed:     {n_computed:,}")
    print(f"  No PBP data:  {n_no_sc:,}")
    print(f"  Too few LW:   {n_insufficient:,}")

    # ── Step 2: Compute percentiles ─────────────────────────────────────────
    print("\nComputing per-year percentiles...")
    pctls = compute_percentiles(records)
    print(f"  Percentile entries: {len(pctls):,}")

    # ── Step 3: Inject into DB ───────────────────────────────────────────────
    # Tobias 2026-05-06 PERF-FIX:
    # 1) records-Lookup als O(1) dict statt O(n) next() — vorher O(n^2)
    # 2) PRAGMA synchronous=OFF + expliziter Transaction
    # 3) Progress-Print alle 5000 Iterationen
    print(f"\nInjecting leverageEff into {len(profiles):,} profiles...")
    rec_map = {r["key"]: r for r in records}
    conn.execute("PRAGMA synchronous=OFF")
    conn.execute("BEGIN TRANSACTION")
    patched = 0
    skipped = 0

    for i, (player_id, name_key, p) in enumerate(profiles, 1):
        rec = rec_map.get(player_id)
        if not rec or rec["lwe"] is None:
            skipped += 1
            if i % 5000 == 0:
                print(f"  ... {i:,} / {len(profiles):,} processed (patched={patched:,})")
            continue

        lwe_data = dict(rec["lwe"])  # copy

        # Merge percentiles
        pctl = pctls.get(player_id)
        if pctl:
            lwe_data["score"]    = pctl["score"]
            lwe_data["premPctl"] = pctl["premPctl"]
            lwe_data["usgPctl"]  = pctl["usgPctl"]
            lwe_data["usg"]      = pctl["usg"]
        else:
            lwe_data["score"]    = None
            lwe_data["premPctl"] = None
            lwe_data["usgPctl"]  = None
            lwe_data["usg"]      = rec.get("usg")

        lwe_data["ts"] = rec.get("ts")

        p["leverageEff"] = lwe_data

        # Re-compress and write — UPDATE per player_id (PK), nicht name
        blob = zlib.compress(json.dumps(p, separators=(',', ':')).encode())
        conn.execute("UPDATE profiles SET data=? WHERE player_id=?", (blob, player_id))
        patched += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(profiles):,} processed (patched={patched:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()

    print(f"  Patched:  {patched:,}")
    print(f"  Skipped:  {skipped:,} (no valid LWE data)")

    # ── Step 4: Validation ───────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("VALIDATION — Top Prospects 2026")
    print("=" * 65)
    conn = sqlite3.connect(DB)

    check_players = [
        "Cameron Boozer", "Cooper Flagg", "Dylan Harper",
        "Ace Bailey", "VJ Edgecombe", "Tre Johnson",
        "Kasparas Jakucionis", "Noa Essengue",
    ]
    # Backlog 1.3: norm_name-basierter Lookup statt SQL-LIKE → robust gegen
    # Akzente UND Punkte (V.J. Edgecombe, Dončić). Einmal Profile laden.
    val_by_nname = {norm_name(n): blob
                    for n, blob in conn.execute("SELECT name, data FROM profiles").fetchall()}

    for name in check_players:
        blob = val_by_nname.get(norm_name(name))
        if not blob:
            print(f"  {name}: NOT FOUND")
            continue
        p = json.loads(zlib.decompress(blob))
        le = p.get("leverageEff")
        if not le:
            print(f"  {name}: No leverageEff")
            continue
        print(
            f"  {name:25s} | "
            f"lweFG={le.get('lweFG',0):5.1f}% "
            f"raweFG={le.get('raweFG',0):5.1f}% "
            f"diffPrem={le.get('diffPrem',0):+5.1f}pp "
            f"score={le.get('score','?'):>3} "
            f"usg={le.get('usg',0):.1f}% "
            f"usgPctl={le.get('usgPctl','?'):>3}"
        )

    # Distribution sanity check
    rows = conn.execute("SELECT data FROM profiles").fetchall()
    conn.close()

    lw_efgs, diff_prems, scores = [], [], []
    for (blob,) in rows:
        try:
            p = json.loads(zlib.decompress(blob))
            le = p.get("leverageEff")
            if le:
                if le.get("lweFG") is not None:
                    lw_efgs.append(le["lweFG"])
                if le.get("diffPrem") is not None:
                    diff_prems.append(le["diffPrem"])
                if le.get("score") is not None:
                    scores.append(le["score"])
        except:
            pass

    print(f"\nDistribution check (N={len(lw_efgs):,}):")
    print(f"  lweFG:   p10={np.percentile(lw_efgs,10):.1f}% p50={np.percentile(lw_efgs,50):.1f}% p90={np.percentile(lw_efgs,90):.1f}%  range=[{min(lw_efgs):.1f},{max(lw_efgs):.1f}]")
    print(f"  diffPrem: p10={np.percentile(diff_prems,10):.1f}pp p50={np.percentile(diff_prems,50):.1f}pp p90={np.percentile(diff_prems,90):.1f}pp")
    print(f"  score:   mean={np.mean(scores):.1f} std={np.std(scores):.1f}  (expect ~50 / ~29)")

    print(f"\n{'='*65}")
    print("Done. Run: git add -f data/processed/prospecttheory.db && git commit && git push")
    print(f"{'='*65}")


if __name__ == "__main__":
    main()
