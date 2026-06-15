#!/usr/bin/env python3
"""
inject_usage_reaction.py — Sprint-3.25 (#19)
=============================================

Liest data/processed/pbp_usage_reaction_<season>.csv (Output von compute_
usage_reaction.py) und injiziert pro Spieler den Scorer- und Passer-Slope
ins DB-Profil als `usageReaction` dict.

WURZEL-AUSSAGE
--------------
Wie reagiert der Spieler bei erhöhter Usage? Plus skaliert er Scoring + Passing
oder dropt er ab? Plus die Slope kommt aus per-Game Linear Regression von
PTS/poss (resp AST/poss) vs USG.

INJECTED FIELD: usageReaction (in profile.data)
-----------------------------------------------
{
  "season":       "2025-26",
  "n_games":      11,
  "limited_sample": false,    # True wenn n_games < MIN_RELIABLE_GAMES
  "scorer_slope": 0.010,      # +0.01 = +1 PTS/100 poss pro 1 USG-pt
  "scorer_slope_lo": -0.005,
  "scorer_slope_hi":  0.025,
  "scorer_r2":    0.05,
  "scorer_p":     0.42,
  "passer_slope":-0.020,
  "passer_slope_lo": -0.030,
  "passer_slope_hi": -0.010,
  "passer_r2":    0.30,
  "passer_p":     0.04,
  "usg_range": {"mean": 21.7, "sd": 2.8, "min": 17, "max": 28}
}

Plus die Sample-Size-Flag: limited_sample wenn n_games < 15.
"""
from __future__ import annotations
import sqlite3, zlib, json, sys
from pathlib import Path
import pandas as pd
import numpy as np
from name_utils import norm_name

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "processed" / "prospecttheory.db"

CSV_LOCAL = BASE / "data" / "processed" / "pbp_usage_reaction_2025-26.csv"
CSV_PIPELINE = BASE.parent.parent / "data-pipeline" / "data" / "processed" / "pbp_usage_reaction_2025-26.csv"

MIN_RELIABLE_GAMES = 15


def safe_num(v):
    if v is None or (isinstance(v, float) and (pd.isna(v) or not np.isfinite(v))):
        return None
    try:
        f = float(v)
        return f if np.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def round_or_none(v, d):
    n = safe_num(v)
    return round(n, d) if n is not None else None


def build_usage_reaction_block(row) -> dict:
    n_games = int(safe_num(row.get("n_games")) or 0)
    return {
        "season":          str(row.get("season", "")),
        "n_games":         n_games,
        "limited_sample":  n_games < MIN_RELIABLE_GAMES,

        "scorer_slope":    round_or_none(row.get("scorer_slope"), 4),
        "scorer_slope_lo": round_or_none(row.get("scorer_slope_lo"), 4),
        "scorer_slope_hi": round_or_none(row.get("scorer_slope_hi"), 4),
        "scorer_r2":       round_or_none(row.get("scorer_r2"), 3),
        "scorer_p":        round_or_none(row.get("scorer_p"), 4),

        "passer_slope":    round_or_none(row.get("passer_slope"), 4),
        "passer_slope_lo": round_or_none(row.get("passer_slope_lo"), 4),
        "passer_slope_hi": round_or_none(row.get("passer_slope_hi"), 4),
        "passer_r2":       round_or_none(row.get("passer_r2"), 3),
        "passer_p":        round_or_none(row.get("passer_p"), 4),

        "usg_range": {
            "mean": round_or_none(row.get("usg_mean"), 1),
            "sd":   round_or_none(row.get("usg_sd"), 1),
            "min":  round_or_none(row.get("usg_min"), 1),
            "max":  round_or_none(row.get("usg_max"), 1),
        },
    }


def main():
    csv_path = CSV_LOCAL if CSV_LOCAL.exists() else CSV_PIPELINE
    if not csv_path.exists():
        print(f"ERROR: pbp_usage_reaction CSV not found:")
        print(f"  {CSV_LOCAL}")
        print(f"  {CSV_PIPELINE}")
        sys.exit(1)
    print(f"Loading: {csv_path}")
    master = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(master):,} player-seasons")

    master["_nname"] = master["player_name"].apply(norm_name)
    # Per normalized name: keep latest season
    master = master.sort_values("season").groupby("_nname", as_index=False).tail(1)
    print(f"  {len(master):,} after dedupe by name (latest season)")

    # ── DB injection ──
    if not DB.exists():
        print(f"ERROR: DB nicht gefunden: {DB}")
        sys.exit(1)

    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT player_id, data FROM profiles")
    rows = cur.fetchall()
    print(f"  DB profiles: {len(rows):,}")

    # Build name-index from master
    by_name = {row["_nname"]: row for _, row in master.iterrows()}

    updated = 0
    for pid, data_blob in rows:
        try:
            data = json.loads(zlib.decompress(data_blob).decode("utf-8"))
        except Exception:
            continue

        name = data.get("name") or data.get("player_name")
        if not name:
            continue
        nname = norm_name(name)
        match = by_name.get(nname)
        if match is None:
            continue

        data["usageReaction"] = build_usage_reaction_block(match)

        new_blob = zlib.compress(json.dumps(data).encode("utf-8"))
        cur.execute("UPDATE profiles SET data = ? WHERE player_id = ?", (new_blob, pid))
        updated += 1

    conn.commit()
    conn.close()
    print(f"\n✓ Updated {updated:,} profiles with usageReaction")


if __name__ == "__main__":
    main()
