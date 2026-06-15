#!/usr/bin/env python3
"""
inject_usage_reaction.py — Sprint-3.25 (#19) / Sprint-3.27 v2 (streaming)
=========================================================================

Liest data/processed/pbp_usage_reaction_<season>.csv und injiziert pro Spieler
den Scorer- und Passer-Slope ins DB-Profil als `usageReaction` dict.

v2 (Sprint-3.27, 2026-06-15) Wurzel-Fix:
  - Plus die v1 Implementation nutzte `cur.fetchall()` → 10k+ Profile-Blobs auf
    einmal in den Memory. Auf Render Free Tier (512MB) führte das zum
    silent OOM-Kill mid-loop, BEVOR `conn.commit()` lief.
  - Plus die DB enthielt deshalb keinen usageReaction field, obwohl build.sh
    erfolgreich durchlief (Render zeigte "Deploy live").

v2 Architektur:
  - Streaming-Cursor (analog _SqliteProfilesDict in main.py): kein fetchall(),
    sondern für jeden Profile-Row direkt processen.
  - Plus Batch-Commit alle 500 Profile (verhindert WAL-buildup).
  - Plus zwei SEPARATE Connections für SELECT und UPDATE (verhindert Cursor-
    Konflikte beim Mid-Iteration UPDATE).
  - Plus verbose Logging: CSV-Pfad, n_rows, n_dedupe, n_matched, n_updated.
  - Plus final Verify-SELECT zur Self-Validation der Injection.

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
BATCH_COMMIT = 500   # commit every N updates to keep WAL small


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
    # ── CSV-Pfad-Auflösung mit verbose Logging ──
    print(f"[usage_reaction] CWD: {Path.cwd()}")
    print(f"[usage_reaction] CSV_LOCAL: {CSV_LOCAL} (exists={CSV_LOCAL.exists()})")
    print(f"[usage_reaction] CSV_PIPELINE: {CSV_PIPELINE} (exists={CSV_PIPELINE.exists()})")

    csv_path = CSV_LOCAL if CSV_LOCAL.exists() else CSV_PIPELINE
    if not csv_path.exists():
        print(f"❌ CSV not found in either location — SKIPPING usage_reaction injection")
        sys.exit(0)   # SKIP gracefully, don't fail build

    print(f"[usage_reaction] Loading: {csv_path}")
    master = pd.read_csv(csv_path, low_memory=False)
    print(f"[usage_reaction]   {len(master):,} player-seasons loaded")

    if len(master) == 0:
        print(f"[usage_reaction] ⚠ CSV empty — SKIPPING injection")
        sys.exit(0)

    master["_nname"] = master["player_name"].apply(norm_name)
    master = master.sort_values("season").groupby("_nname", as_index=False).tail(1)
    print(f"[usage_reaction]   {len(master):,} after dedupe by normalized name")

    # Build name-index — small memory footprint (~1MB for 1k entries)
    by_name = {row["_nname"]: row for _, row in master.iterrows()}
    print(f"[usage_reaction]   {len(by_name):,} unique normalized names indexed")

    # ── DB injection: separate read + write connections (cursor-safe) ──
    if not DB.exists():
        print(f"❌ DB nicht gefunden: {DB}")
        sys.exit(1)

    read_conn = sqlite3.connect(DB)
    read_conn.row_factory = sqlite3.Row
    write_conn = sqlite3.connect(DB)

    # Count total profiles up front (for progress %)
    total = read_conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
    print(f"[usage_reaction]   DB profiles total: {total:,}")

    # ── Streaming cursor: process row-by-row, batch-commit ──
    n_seen = 0
    n_decode_fail = 0
    n_no_name = 0
    n_no_match = 0
    n_updated = 0

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

        data["usageReaction"] = build_usage_reaction_block(match)
        new_blob = zlib.compress(json.dumps(data).encode("utf-8"))
        write_conn.execute(
            "UPDATE profiles SET data = ? WHERE player_id = ?",
            (new_blob, pid),
        )
        n_updated += 1

        # Periodic commit to keep WAL small + protect against mid-loop crash
        if n_updated % BATCH_COMMIT == 0:
            write_conn.commit()
            print(f"[usage_reaction]   {n_seen}/{total} processed, {n_updated} updated (committed)")

    # Final commit + close
    write_conn.commit()
    read_conn.close()
    write_conn.close()

    print(f"\n[usage_reaction] ── Summary ──")
    print(f"  Profiles seen:        {n_seen:,}")
    print(f"  Decode failures:      {n_decode_fail:,}")
    print(f"  No name in profile:   {n_no_name:,}")
    print(f"  No match in CSV:      {n_no_match:,}")
    print(f"  ✓ Updated with usageReaction: {n_updated:,}")

    # ── Self-Verify: count profiles with usageReaction field ──
    verify_conn = sqlite3.connect(DB)
    n_with_field = verify_conn.execute(
        "SELECT COUNT(*) FROM profiles WHERE data LIKE ?",
        ('%"usageReaction"%',),
    ).fetchone()[0]
    verify_conn.close()
    print(f"  ✓ Verify: profiles containing usageReaction field: {n_with_field:,}")

    if n_with_field == 0 and n_updated > 0:
        print("❌ CRITICAL: updates reported but verify shows 0 — commit didn't persist!")
        sys.exit(1)


if __name__ == "__main__":
    main()
