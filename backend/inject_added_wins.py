"""
inject_added_wins.py
====================
Injects the Added-Wins projection (new value model: P(NBA) × E[AW|NBA], team-
anchored impact+production target) into the profile blobs.

Source: added_wins_projection.csv (data-pipeline/scripts/02j_combine_projection.py).
Match:  by `slug` — the canonical UNIQUE player key. NOT by name: there are 8
        distinct "Chris Johnson"s, and name-matching mixes them. Slug encodes
        school+year (chris-johnson-lsu-09) so each maps to exactly one player.

Field written: profile["addedWins"] = {
    ev          : headline expected Added Wins = P(NBA) × E[AW|NBA]
    condNba     : E[Added Wins | reaches NBA]  (honest, modest expectation)
    pNba        : P(reaches NBA)
    floor/ceiling: 25%/75% of the conditional value
    pHighPro    : P(reaches NBA or EuroLeague-tier) — data-driven floor
    intlTier    : categorical fallback-career descriptor
    projTier    : tier name on the Added-Wins scale
    tierProbs   : {Superstar..Negative} probabilities (the upside lives here)
    drivers     : top per-player feature contributions
}

Run: python inject_added_wins.py
"""
import sqlite3
import zlib
import json
import math
import pandas as pd
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "data" / "processed" / "prospecttheory.db"
CSV = BASE / "data" / "processed" / "added_wins_projection.csv"


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


def _num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _str(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s or None


def build_lookup() -> dict:
    df = pd.read_csv(CSV)
    lookup: dict[str, dict] = {}
    for r in df.itertuples():
        slug = _str(getattr(r, "slug", None))
        if not slug:
            continue
        try:
            probs = json.loads(r.tier_probs) if _str(r.tier_probs) else None
        except (json.JSONDecodeError, TypeError):
            probs = None
        lookup[slug] = {
            "ev": _num(r.ev_added_wins),
            "condNba": _num(r.e_aw_given_nba),
            "pNba": _num(r.p_nba),
            "floor": _num(r.aw_floor),
            "ceiling": _num(r.aw_ceiling),
            "pHighPro": _num(r.p_high_pro),
            "intlTier": _str(r.intl_tier),
            "projTier": _str(r.proj_tier),
            "tierProbs": probs,
            "drivers": _str(r.aw_drivers),
        }
    return lookup


def main():
    print("[inject_added_wins] Loading CSV …")
    lookup = build_lookup()
    print(f"[inject_added_wins] Projections (by slug): {len(lookup):,}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous=OFF")
    rows = conn.execute("SELECT rowid, slug, data FROM profiles").fetchall()
    print(f"[inject_added_wins] Profiles in DB: {len(rows):,}")
    conn.execute("BEGIN TRANSACTION")

    updated = no_match = 0
    for i, row in enumerate(rows, 1):
        prof = lookup.get(row["slug"])
        if prof is None:
            no_match += 1
            continue
        p = decompress(row["data"])
        if p.get("addedWins") != prof:
            p["addedWins"] = prof
            conn.execute("UPDATE profiles SET data = ? WHERE rowid = ?",
                         (compress(p), row["rowid"]))
            updated += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(rows):,} (updated={updated:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()
    print(f"[inject_added_wins] Updated: {updated:,} | No match: {no_match:,}")
    print("[inject_added_wins] Done.")


if __name__ == "__main__":
    main()
