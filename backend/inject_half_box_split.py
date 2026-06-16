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

SEASON = "2025-26"
CSV_LOCAL    = BASE / "data" / "processed" / f"pbp_half_box_split_{SEASON}.csv"
CSV_PIPELINE = BASE.parent.parent / "data-pipeline" / "data" / "processed" / f"pbp_half_box_split_{SEASON}.csv"

SAMPLE_MIN_FLOOR_MIN = 10.0
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
    csv_path = CSV_LOCAL if CSV_LOCAL.exists() else CSV_PIPELINE
    if not csv_path.exists():
        print(f"[inject_half_box_split] CSV not found at:")
        print(f"  - {CSV_LOCAL}")
        print(f"  - {CSV_PIPELINE}")
        print(f"  Skipping injection.")
        return
    if not DB.exists():
        sys.exit(f"ERROR: {DB} not found")

    print(f"[inject_half_box_split] Loading {csv_path}")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(df):,} PBP-aggregate rows loaded")

    # NFKD-normalised name lookup (diacritic-resilient)
    name_map = {}
    for _, r in df.iterrows():
        name = r.get("player_name")
        if not isinstance(name, str) or not name.strip():
            continue
        clean = _nfkd(name)
        if not clean:
            continue
        payload = build_player_payload(r, SEASON)
        existing = name_map.get(clean)
        if existing is None:
            name_map[clean] = payload
        else:
            ex_h1, ex_h2 = existing["h1"], existing["h2"]
            ex_tot = (ex_h1["FGA"]+ex_h1["AST"]+ex_h1["STL"]+ex_h1["BLK"]
                      +ex_h2["FGA"]+ex_h2["AST"]+ex_h2["STL"]+ex_h2["BLK"])
            n_h1, n_h2 = payload["h1"], payload["h2"]
            n_tot = (n_h1["FGA"]+n_h1["AST"]+n_h1["STL"]+n_h1["BLK"]
                     +n_h2["FGA"]+n_h2["AST"]+n_h2["STL"]+n_h2["BLK"])
            if n_tot > ex_tot:
                name_map[clean] = payload
    print(f"  {len(name_map):,} unique players")

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
