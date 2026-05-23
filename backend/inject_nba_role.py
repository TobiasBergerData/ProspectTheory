"""
inject_nba_role.py
==================
Injiziert die NBA-Rollen-Projektion (Phase 3b) in die Profile-Blobs.
Quelle: nba_role_projection_all.csv (data-pipeline/scripts/nba_transition.py).

Pro Spieler: "Was wird aus seinem Pre-Draft-Typ in der NBA?" — kernel-gewichtete
Comps (gleicher Pre-Archetyp × projizierter Wert):
  • projRole    : wahrscheinlichste NBA-Outcome-Rolle (falls er sich etabliert)
  • pEstablish  : P(etabliert eine echte NBA-Rolle)
  • pStick      : P(Role-Player-Wert+, peak_wa≥8) = Floor
  • expWa       : erwarteter peak_wa (talent-gewichtet)
  • compN       : effektive Comp-Zahl (Konfidenz)
  • outcomes    : [{role, p, wa}] — Verteilung inkl. "Did Not Stick", wa = NBA-Rollen-Median-Wert

Match: norm_name (eine Projektion je Spieler), wie inject_draft_risk.
Feld im Profil: nbaRoleProjection {...}

Run: python inject_nba_role.py
"""
import sqlite3
import zlib
import json
import math
import pandas as pd
from pathlib import Path
from name_utils import norm_name

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "data" / "processed" / "prospecttheory.db"
CSV = BASE / "data" / "processed" / "nba_role_projection_all.csv"


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


def _outcomes(cell):
    """'role:p:wa|role:p:wa' → [{'role','p','wa'}] (max 4)."""
    if not isinstance(cell, str) or not cell.strip():
        return []
    out = []
    for part in cell.split("|"):
        bits = part.rsplit(":", 2)
        if len(bits) != 3:
            continue
        role, p, wa = bits
        try:
            out.append({"role": role.strip(), "p": round(float(p), 3), "wa": round(float(wa), 1)})
        except ValueError:
            continue
    return out


def build_lookup() -> dict:
    df = pd.read_csv(CSV)
    lookup: dict[str, dict] = {}
    for r in df.itertuples():
        proj_role = getattr(r, "proj_role", None)
        if not isinstance(proj_role, str) or not proj_role:
            continue
        prof = {
            "projRole": proj_role,
            "pEstablish": _num(r.p_establish),
            "pStick": _num(r.p_stick8),
            "expWa": _num(r.exp_wa),
            "compN": _num(r.comp_n),
            "preArchetype": r.pre_archetype if isinstance(r.pre_archetype, str) else None,
            "outcomes": _outcomes(getattr(r, "outcomes", "")),
        }
        key = norm_name(str(r.name))
        prev = lookup.get(key)
        # Bei Kollision: höheres expWa gewinnt (Draft-relevanter Spieler)
        if prev is None or (prof["expWa"] or -99) > (prev["expWa"] or -99):
            lookup[key] = prof
    return lookup


def main():
    print("[inject_nba_role] Loading CSV …")
    lookup = build_lookup()
    print(f"[inject_nba_role] Role projections: {len(lookup):,}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous=OFF")
    rows = conn.execute("SELECT rowid, name, data FROM profiles").fetchall()
    print(f"[inject_nba_role] Profiles in DB: {len(rows):,}")
    conn.execute("BEGIN TRANSACTION")

    updated = no_match = 0
    for i, row in enumerate(rows, 1):
        p = decompress(row["data"])
        name = p.get("name", row["name"]) or row["name"]
        prof = lookup.get(norm_name(name))
        if prof is None:
            no_match += 1
        elif p.get("nbaRoleProjection") != prof:
            p["nbaRoleProjection"] = prof
            conn.execute("UPDATE profiles SET data = ? WHERE rowid = ?",
                         (compress(p), row["rowid"]))
            updated += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(rows):,} (updated={updated:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()
    print(f"[inject_nba_role] Updated: {updated:,} | No match: {no_match:,}")
    print("[inject_nba_role] Done.")


if __name__ == "__main__":
    main()
