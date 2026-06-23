#!/usr/bin/env python3
"""
inject_half_box_split.py — Sprint-3.41 (Tobias 2026-06-16)
===========================================================

Liest data/processed/pbp_half_box_split_<season>.csv und injiziert pro Spieler
ein halfSplits-Object in den profiles-Table.

Pattern wie inject_usage_reaction.py:
  Plus CSV_LOCAL    (für Render-Deploy: CSV liegt direkt im backend-Repo)
  Plus CSV_PIPELINE (lokal: data-pipeline-Repo hat die Source)

halfSplits Schema:
  {
    season: "2025-26",
    h1: {min, FGM, FGA, TPM, TPA, FTM, FTA, AST, STL, BLK, ORB, DRB, TO},
    h2: {min, FGM, FGA, TPM, TPA, FTM, FTA, AST, STL, BLK, ORB, DRB, TO},
    sample_floor_pass: bool   // both halves >= 10 min recorded
  }
"""
from __future__ import annotations
import json
import sqlite3
import sys
import unicodedata
import zlib
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "processed" / "prospecttheory.db"

# Sprint-3.43 (Tobias 2026-06-17): scan all 9 NCAA seasons available.
# Per-player: pick LATEST season where both halves ≥ 10 min recorded.
# Fallback: lower threshold (5 min) if no valid latest exists.
SEASONS = ["2017-18", "2018-19", "2019-20", "2020-21", "2021-22",
           "2022-23", "2023-24", "2024-25", "2025-26"]
SAMPLE_MIN_FLOOR_MIN     = 10.0   # primary floor
SAMPLE_RELAXED_FLOOR_MIN = 5.0    # fallback floor for older / limited samples
BATCH_COMMIT = 500


def _nfkd(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c)).lower().strip()


def build_player_payload(row: pd.Series, season: str) -> dict:
    def _half(h: int) -> dict:
        return {
            "min":  float(row.get(f"h{h}_min", 0) or 0),
            "FGM":  int(row.get(f"h{h}_FGM", 0) or 0),
            "FGA":  int(row.get(f"h{h}_FGA", 0) or 0),
            "TPM":  int(row.get(f"h{h}_3PM", 0) or 0),
            "TPA":  int(row.get(f"h{h}_3PA", 0) or 0),
            "FTM":  int(row.get(f"h{h}_FTM", 0) or 0),
            "FTA":  int(row.get(f"h{h}_FTA", 0) or 0),
            "AST":  int(row.get(f"h{h}_AST", 0) or 0),
            "STL":  int(row.get(f"h{h}_STL", 0) or 0),
            "BLK":  int(row.get(f"h{h}_BLK", 0) or 0),
            "ORB":  int(row.get(f"h{h}_ORB", 0) or 0),
            "DRB":  int(row.get(f"h{h}_DRB", 0) or 0),
            "TO":   int(row.get(f"h{h}_TO",  0) or 0),
        }
    h1 = _half(1)
    h2 = _half(2)
    return {
        "season": season,
        "team":   row.get("team"),
        "h1": h1,
        "h2": h2,
        "sample_floor_pass": bool(h1["min"] >= SAMPLE_MIN_FLOOR_MIN
                                  and h2["min"] >= SAMPLE_MIN_FLOOR_MIN),
    }


def main():
    if not DB.exists():
        sys.exit(f"ERROR: {DB} not found")

    # Load each season's CSV that exists (local first, pipeline fallback)
    print(f"[inject_half_box_split] Scanning {len(SEASONS)} seasons:")
    season_dfs = {}
    for season in SEASONS:
        local = BASE / "data" / "processed" / f"pbp_half_box_split_{season}.csv"
        pipeline = BASE.parent.parent / "data-pipeline" / "data" / "processed" / f"pbp_half_box_split_{season}.csv"
        path = local if local.exists() else pipeline
        if not path.exists():
            print(f"  {season}: not found, skip")
            continue
        df = pd.read_csv(path, low_memory=False)
        season_dfs[season] = df
        print(f"  {season}: {len(df):,} rows")
    if not season_dfs:
        print("  No CSVs found at all — skipping injection.")
        return

    # Per-player season selection: latest with ≥10 min/half, fallback to ≥5 min.
    # Iterate seasons newest-to-oldest, pick first that passes the floor.
    name_map = {}  # clean_name -> (chosen_season, payload, floor_passed)
    passed_strict = set()
    passed_relaxed = set()
    for season in reversed(SEASONS):
        df = season_dfs.get(season)
        if df is None:
            continue
        for _, r in df.iterrows():
            name = r.get("player_name")
            if not isinstance(name, str) or not name.strip():
                continue
            clean = _nfkd(name)
            if not clean or clean in passed_strict:
                continue
            h1m = float(r.get("h1_min", 0) or 0)
            h2m = float(r.get("h2_min", 0) or 0)
            if h1m >= SAMPLE_MIN_FLOOR_MIN and h2m >= SAMPLE_MIN_FLOOR_MIN:
                payload = build_player_payload(r, season)
                name_map[clean] = payload
                passed_strict.add(clean)
    # Pass 2: relaxed floor for those not yet picked
    for season in reversed(SEASONS):
        df = season_dfs.get(season)
        if df is None:
            continue
        for _, r in df.iterrows():
            name = r.get("player_name")
            if not isinstance(name, str) or not name.strip():
                continue
            clean = _nfkd(name)
            if not clean or clean in passed_strict or clean in passed_relaxed:
                continue
            h1m = float(r.get("h1_min", 0) or 0)
            h2m = float(r.get("h2_min", 0) or 0)
            if h1m >= SAMPLE_RELAXED_FLOOR_MIN and h2m >= SAMPLE_RELAXED_FLOOR_MIN:
                payload = build_player_payload(r, season)
                # Plus mark sample_floor_pass=False so frontend shows caveat
                payload["sample_floor_pass"] = False
                name_map[clean] = payload
                passed_relaxed.add(clean)

    print(f"\n  Strict-floor pass (≥10 min/half): {len(passed_strict):,}")
    print(f"  Relaxed-floor pass (≥5 min/half):  {len(passed_relaxed):,}")
    print(f"  Total unique players: {len(name_map):,}")

    # Plus per-season distribution of picks (sanity)
    from collections import Counter
    season_counts = Counter(p["season"] for p in name_map.values())
    print(f"\n  Season distribution of picks:")
    for season in SEASONS:
        if season in season_counts:
            print(f"    {season}: {season_counts[season]:,}")

    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT slug, name, data FROM profiles")
    rows = cur.fetchall()
    print(f"  {len(rows):,} profiles in DB")

    n_injected = 0
    n_skipped = 0
    pending = []
    for slug, name, blob in rows:
        clean = _nfkd(name or "")
        if not clean or clean not in name_map:
            n_skipped += 1
            continue
        try:
            profile = json.loads(zlib.decompress(blob).decode("utf-8"))
        except Exception:
            n_skipped += 1
            continue
        profile["halfSplits"] = name_map[clean]
        new_blob = zlib.compress(json.dumps(profile).encode("utf-8"))
        pending.append((new_blob, slug))
        if len(pending) >= BATCH_COMMIT:
            cur.executemany("UPDATE profiles SET data=? WHERE slug=?", pending)
            conn.commit()
            n_injected += len(pending)
            pending.clear()
    if pending:
        cur.executemany("UPDATE profiles SET data=? WHERE slug=?", pending)
        conn.commit()
        n_injected += len(pending)

    print(f"\n✓ Injected halfSplits into {n_injected:,} profiles "
          f"({n_skipped:,} unmatched)")
    conn.close()


if __name__ == "__main__":
    main()
