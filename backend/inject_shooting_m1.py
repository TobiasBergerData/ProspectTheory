"""
inject_shooting_m1.py — Schreibt Diss-M1-Shooting-Projection-Werte in die Profile.

Quelle: shooting_diss_predictions.csv (Stage-1 EB + Stage-2 Beta-Regression M1).

Felder pro Spieler (im profile.shooting-Subdict):
    pre_draft_3p_estimate   — Empirical-Bayes Pre-Draft-3P% (0-1)
    proj_nba_3p_pct_m1      — M1-NBA-3P%-Projektion (0-100 als Display %)
    shooting_m1_pool        — "ncaa" oder "intl" (welches Submodell)
    shooting_m1_inputs      — {ft_pct, two_pj_pct, ncaa_3pa} für Transparenz

Match: name_clean (lowercased+stripped) — namesake-deduplicated upstream.

Run: python inject_shooting_m1.py
"""
import sqlite3
import zlib
import json
import math
import pandas as pd
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "data" / "processed" / "prospecttheory.db"
CSV = BASE / "data" / "processed" / "shooting_diss_predictions.csv"
COEFS = BASE / "data" / "processed" / "shooting_diss_coefs.json"


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


def build_lookup() -> dict:
    df = pd.read_csv(CSV)
    df["name_key"] = df["player_name"].astype(str).str.lower().str.strip()
    lookup: dict[str, dict] = {}
    for r in df.itertuples():
        nl = _str(r.name_key) or _str(r.player_name)
        if not nl:
            continue
        lookup[nl] = {
            "preDraft3pEstimate": _num(r.pre_draft_3p_estimate),
            "projNba3pPctM1": _num(r.proj_nba_3p_pct_m1),
            # 2026-05-29: M4 jetzt auf 3PAr (rollenunabhängig) statt 3PA/G.
            "projNba3parM4": _num(getattr(r, "proj_nba_3par_m4", None)),
            "ncaa3parRaw": _num(getattr(r, "ncaa_3par", None)),
            "pool": _str(r.pool),
            "inputs": {
                "ftPct": _num(r.ft_pct),
                "twoPjPct": _num(r.two_pj_pct),
                "ncaa3Pa": _num(r.ncaa_3pa),
                "rawNcaa3p": _num(r.ncaa_3p_raw),
            },
        }
    return lookup


def load_coefs() -> dict:
    if not COEFS.exists():
        return {}
    return json.loads(COEFS.read_text())


def main():
    print("[inject_shooting_m1] Loading shooting M1 predictions …")
    lookup = build_lookup()
    coefs = load_coefs()
    print(f"[inject_shooting_m1] Predictions: {len(lookup):,}  Coefs loaded: {bool(coefs)}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous=OFF")
    rows = conn.execute("SELECT rowid, slug, data FROM profiles").fetchall()
    print(f"[inject_shooting_m1] Profiles in DB: {len(rows):,}")
    conn.execute("BEGIN TRANSACTION")

    updated = no_match = 0
    for i, row in enumerate(rows, 1):
        p = decompress(row["data"])
        # Match by name_clean (lowercased)
        nm = (p.get("name") or "").lower().strip()
        m1 = lookup.get(nm)
        if m1 is None:
            no_match += 1
            continue
        shooting = p.get("shooting", {}) or {}
        shooting["m1"] = m1                       # nest unter shooting.m1.*
        if coefs:
            shooting["m1Coefs"] = coefs
        if p.get("shooting") != shooting:
            p["shooting"] = shooting
            conn.execute("UPDATE profiles SET data = ? WHERE rowid = ?",
                         (compress(p), row["rowid"]))
            updated += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(rows):,} (updated={updated:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()
    print(f"[inject_shooting_m1] Updated: {updated:,} | No match: {no_match:,}")
    print("[inject_shooting_m1] Done.")


if __name__ == "__main__":
    main()
