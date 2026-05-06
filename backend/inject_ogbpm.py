"""
inject_ogbpm.py
===============
Injects OGBPM (Offensive Game Box Plus-Minus) and DGBPM from the
BartTorvik CSV into profile blobs.

BartTorvik's OGBPM is their game-adjusted offensive impact metric —
more opponent-sensitive than plain OBPM, making it the best available
xRAPM proxy across all years.

Fields added to profiles:
  ogbpm  : float  — Offensive GBPM (BartTorvik)
  dgbpm  : float  — Defensive GBPM (BartTorvik)
  bt_pid : int    — BartTorvik player ID (for game log fetching)

Run: python scripts/inject_ogbpm.py
"""

import sqlite3
import zlib
import json
import pandas as pd
import numpy as np
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent  # backend/ on Render
DB_PATH = BASE / "data" / "processed" / "prospecttheory.db"
BT_CSV  = BASE / "data" / "raw" / "barttorvik_complete_final.csv"

# ── Helpers ────────────────────────────────────────────────────────────────
def compress(obj: dict) -> bytes:
    return zlib.compress(json.dumps(obj, ensure_ascii=False).encode())

def decompress(blob) -> dict:
    if blob is None:
        return {}
    try:
        return json.loads(zlib.decompress(blob).decode())
    except Exception:
        try:
            return json.loads(blob)
        except Exception:
            return {}


def main():
    print("[inject_ogbpm] Loading BT CSV …")
    bt = pd.read_csv(BT_CSV, low_memory=False)
    bt["season_year"] = pd.to_numeric(bt["season_year"], errors="coerce")
    bt["pid"]         = pd.to_numeric(bt["pid"],         errors="coerce")
    bt["OGBPM"]       = pd.to_numeric(bt["OGBPM"],       errors="coerce")
    bt["DGBPM"]       = pd.to_numeric(bt["DGBPM"],       errors="coerce")

    # Build lookup: (name, season_year) → {ogbpm, dgbpm, pid}
    # Use first row per (name, year) if duplicates exist
    bt_dedup = (bt.sort_values("season_year")
                  .dropna(subset=["OGBPM"])
                  .drop_duplicates(subset=["player_name", "season_year"], keep="last"))

    lookup: dict[tuple, dict] = {}
    for _, row in bt_dedup.iterrows():
        key = (row["player_name"], int(row["season_year"]))
        lookup[key] = {
            "ogbpm": round(float(row["OGBPM"]), 2),
            "dgbpm": round(float(row["DGBPM"]), 2) if pd.notna(row["DGBPM"]) else None,
            "pid":   int(row["pid"]) if pd.notna(row["pid"]) else None,
        }

    print(f"[inject_ogbpm] Lookup entries: {len(lookup):,}")

    # Tobias 2026-05-06 PERF-FIX: synchronous=OFF + explizite Transaction
    # + Progress-Print alle 5000 Iterationen.
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous=OFF")

    rows = conn.execute("SELECT rowid, name, data FROM profiles").fetchall()
    print(f"[inject_ogbpm] Profiles in DB: {len(rows):,}")
    conn.execute("BEGIN TRANSACTION")

    updated = skipped = no_match = 0
    for i, row in enumerate(rows, 1):
        p = decompress(row["data"])
        name = p.get("name", row["name"]) or row["name"]
        # profiles use `yr` for season year (e.g. 2025, 2026)
        year_raw = p.get("yr")
        try:
            year = int(year_raw) if year_raw is not None else None
        except (ValueError, TypeError):
            year = None

        if year is None:
            skipped += 1
            if i % 5000 == 0:
                print(f"  ... {i:,} / {len(rows):,} processed (updated={updated:,})")
            continue

        info = lookup.get((name, year))

        if info is None:
            skipped += 1
            if i % 5000 == 0:
                print(f"  ... {i:,} / {len(rows):,} processed (updated={updated:,})")
            continue

        changed = False
        for k, v in info.items():
            if v is not None and p.get(k) != v:
                p[k] = v
                changed = True

        if changed:
            conn.execute(
                "UPDATE profiles SET data = ? WHERE rowid = ?",
                (compress(p), row["rowid"])
            )
            updated += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(rows):,} processed (updated={updated:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()

    print(f"[inject_ogbpm] Updated:   {updated:,}")
    print(f"[inject_ogbpm] No year/match: {skipped:,}")
    print(f"[inject_ogbpm] Done.")


if __name__ == "__main__":
    main()
