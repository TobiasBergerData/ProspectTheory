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

# Sprint-3.43/3.44 (Tobias 2026-06-17): scan all 9 NCAA seasons available.
# Per-player: pick LATEST season with sufficient sample. Build full multi-season
# payload with career-aggregate as default view (Pro-grade).
#
# Sample-Floor uses TRUE SHOT ATTEMPTS (TSA = FGA + 0.44·FTA) instead of minutes,
# weil pre-2025-26 PBP keine Substitution-Events hat und min-tracking dort
# unreliable ist (siehe Boxer/Haliburton-Audit). TSA arbeitet konsistent.
SEASONS = ["2017-18", "2018-19", "2019-20", "2020-21", "2021-22",
           "2022-23", "2023-24", "2024-25", "2025-26"]
SAMPLE_TSA_FLOOR_STRICT  = 30.0   # ~30 attempts per half (rotation player season)
SAMPLE_TSA_FLOOR_RELAXED = 12.0   # fallback for limited samples
BATCH_COMMIT = 500


def _tsa(h: dict) -> float:
    return h.get("FGA", 0) + 0.44 * h.get("FTA", 0)


def _sample_floor_strict(h1: dict, h2: dict) -> bool:
    return _tsa(h1) >= SAMPLE_TSA_FLOOR_STRICT and _tsa(h2) >= SAMPLE_TSA_FLOOR_STRICT


def _sample_floor_relaxed(h1: dict, h2: dict) -> bool:
    return _tsa(h1) >= SAMPLE_TSA_FLOOR_RELAXED and _tsa(h2) >= SAMPLE_TSA_FLOOR_RELAXED


def _nfkd(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c)).lower().strip()


def _half_from_row(row: pd.Series, h: int) -> dict:
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


def _sum_halves(halves: list[dict]) -> dict:
    """Sum a list of per-season half dicts into a single career-aggregate dict."""
    out = {k: 0 for k in ["min","FGM","FGA","TPM","TPA","FTM","FTA",
                          "AST","STL","BLK","ORB","DRB","TO"]}
    for h in halves:
        for k in out:
            out[k] += h.get(k, 0) or 0
    out["min"] = round(out["min"], 1)
    return out


def build_player_payload(row: pd.Series, season: str) -> dict:
    """Legacy single-season payload (kept for backward compat)."""
    h1 = _half_from_row(row, 1)
    h2 = _half_from_row(row, 2)
    return {
        "season": season,
        "team":   row.get("team"),
        "h1": h1,
        "h2": h2,
        "sample_floor_pass": _sample_floor_strict(h1, h2),
    }


def build_multi_season_payload(season_rows: list[tuple[str, pd.Series]]) -> dict:
    """Sprint-3.44 Pro-Mode: build multi-season payload with career aggregate.

    Plus seasons = sorted list of (season, row) tuples (oldest → newest).
    Plus output: {primary_season, has_career, career, seasons: {season: {...}}}
    """
    seasons = {}
    h1_halves, h2_halves = [], []
    teams_seen = set()
    for season, row in season_rows:
        h1 = _half_from_row(row, 1)
        h2 = _half_from_row(row, 2)
        team = row.get("team")
        if isinstance(team, str) and team:
            teams_seen.add(team)
        seasons[season] = {
            "team": team,
            "h1": h1,
            "h2": h2,
            "sample_floor_pass": _sample_floor_strict(h1, h2),
        }
        h1_halves.append(h1)
        h2_halves.append(h2)

    # Career aggregate: sum counts across seasons
    career_h1 = _sum_halves(h1_halves)
    career_h2 = _sum_halves(h2_halves)

    # Primary season = the most recent one that passes sample-floor
    primary = None
    for season in sorted(seasons.keys(), reverse=True):
        if seasons[season]["sample_floor_pass"]:
            primary = season
            break
    if primary is None and seasons:
        primary = sorted(seasons.keys())[-1]   # fallback: most recent regardless

    return {
        "primary_season": primary,
        "has_career": len(seasons) >= 2,
        "seasons_n": len(seasons),
        "career": {
            "seasons_n": len(seasons),
            "seasons": sorted(seasons.keys()),
            "teams": sorted(teams_seen),
            "h1": career_h1,
            "h2": career_h2,
            "sample_floor_pass": _sample_floor_strict(career_h1, career_h2),
        },
        "seasons": seasons,
        # Plus für Backward-Compat: top-level h1/h2 = primary season (legacy frontend reads these)
        "season": primary,
        "team":   seasons.get(primary, {}).get("team") if primary else None,
        "h1": seasons.get(primary, {}).get("h1") if primary else career_h1,
        "h2": seasons.get(primary, {}).get("h2") if primary else career_h2,
        "sample_floor_pass": seasons.get(primary, {}).get("sample_floor_pass", False) if primary else False,
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

    # Sprint-3.44 Pro-Mode: collect ALL seasons per player, then build
    # multi-season payload with career aggregate + per-season detail.
    from collections import defaultdict
    player_seasons = defaultdict(list)  # clean_name -> [(season, row), ...]
    for season in SEASONS:
        df = season_dfs.get(season)
        if df is None:
            continue
        for _, r in df.iterrows():
            name = r.get("player_name")
            if not isinstance(name, str) or not name.strip():
                continue
            clean = _nfkd(name)
            if not clean:
                continue
            # Plus TSA-based pre-filter (works across all seasons)
            h1_tsa = float(r.get("h1_FGA", 0) or 0) + 0.44 * float(r.get("h1_FTA", 0) or 0)
            h2_tsa = float(r.get("h2_FGA", 0) or 0) + 0.44 * float(r.get("h2_FTA", 0) or 0)
            if h1_tsa < SAMPLE_TSA_FLOOR_RELAXED or h2_tsa < SAMPLE_TSA_FLOOR_RELAXED:
                continue  # skip seasons with effectively zero playing time
            player_seasons[clean].append((season, r))

    name_map = {}
    seasons_n_dist = []
    for clean, season_rows in player_seasons.items():
        # Sort by season (chronological)
        season_rows.sort(key=lambda x: x[0])
        payload = build_multi_season_payload(season_rows)
        name_map[clean] = payload
        seasons_n_dist.append(len(season_rows))

    from collections import Counter
    n_dist = Counter(seasons_n_dist)
    print(f"\n  Total unique players (1+ seasons ≥5 min/half): {len(name_map):,}")
    print(f"  Seasons-per-player distribution:")
    for n in sorted(n_dist.keys()):
        print(f"    {n} season(s): {n_dist[n]:,}")

    # Plus primary-season distribution
    primary_counts = Counter(p["primary_season"] for p in name_map.values() if p.get("primary_season"))
    print(f"\n  Primary-season distribution:")
    for season in SEASONS:
        if season in primary_counts:
            print(f"    {season}: {primary_counts[season]:,}")

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
