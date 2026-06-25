"""
inject_draft_risk.py
====================
Injiziert das Draft-Risiko-Profil (Phase 2, Tab "Risk Profile") in die
Profile-Blobs. Quelle: draft_risk_all.csv (erzeugt von
data-pipeline/scripts/draft_risk_model.py).

Pro Spieler:
  • Market-Range  — wo wird er real gepickt (Consensus → p20/median/p80)
  • Merit-Slot    — wo gehört er hin in einer Durchschnittsdraft (wert-basiert)
  • Bust-Risk     — P(liefert unter Pick-Erwartung) = "feuert-mich-Risiko"
  • Star-Upside   — P(All-Star-Niveau) = "diesen Pick würdest du regretten"
  • Ceiling-Archetyp + Reason-Codes in Klartext (Upside / Risk)

Match: norm_name (ein Risiko-Profil je Spieler = seine Draft-relevante Saison),
identisch zu den anderen Inject-Skripten. Kein Jahr nötig → schließt Intl
(Wembanyama, Sengun) ein, die in unified kein season-Jahr tragen.

Feld im Profil: riskProfile {...}

Run: python inject_draft_risk.py
"""

import gzip
import sqlite3
import zlib
import json
import math
import pandas as pd
from pathlib import Path
from name_utils import norm_name

BASE = Path(__file__).resolve().parent  # backend/ auf Render
DB_PATH = BASE / "data" / "processed" / "prospecttheory.db"
CSV = BASE / "data" / "processed" / "draft_risk_all.csv"
COMP_OUTCOMES_GZ = BASE / "data" / "processed" / "comp_outcomes_all.json.gz"
COMP_OUTCOMES_JSON = BASE / "data" / "processed" / "comp_outcomes_all.json"  # legacy uncompressed fallback


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
    """float oder None (NaN-sicher)."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _factors(cell):
    """'a | b | c' → ['a','b','c'] (leer → [])."""
    if not isinstance(cell, str) or not cell.strip():
        return []
    return [x.strip() for x in cell.split("|") if x.strip()]


def build_lookup() -> dict:
    df = pd.read_csv(CSV)
    lookup: dict[str, dict] = {}
    for r in df.itertuples():
        prof = {
            "consensus": _num(r.consensus),
            "meritSlot": _num(r.merit_slot),
            "marketP20": _num(r.market_p20),
            "marketP50": _num(r.market_p50),
            "marketP80": _num(r.market_p80),
            "ceilingArchetype": (r.ceiling_archetype
                                 if isinstance(r.ceiling_archetype, str) else None),
            "ceilingWA": _num(r.ceiling_wa),
            "bustRisk": _num(r.bust_risk),
            "starUpside": _num(r.star_upside),
            "compStrength": _num(r.comp_strength),
            "upsideFactors": _factors(getattr(r, "upside_factors", "")),
            "riskFactors": _factors(getattr(r, "risk_factors", "")),
            # Sprint-5.5.E: Tier-Probabilities (6 canonical NBA tiers)
            "tierProbs": {
                "intl_career": _num(getattr(r, "p_intl_career", None)),
                "replacement": _num(getattr(r, "p_replacement", None)),
                "roleplayer":  _num(getattr(r, "p_roleplayer", None)),
                "starter":     _num(getattr(r, "p_starter", None)),
                "all_star":    _num(getattr(r, "p_all_star", None)),
                "superstar":   _num(getattr(r, "p_superstar", None)),
            },
            # Distribution-Summary (peak_wa augmented with p_nba mass at -4)
            "pwDistribution": {
                "mode": _num(getattr(r, "pw_mode", None)),
                "p20":  _num(getattr(r, "pw_p20", None)),
                "p50":  _num(getattr(r, "pw_p50", None)),
                "p80":  _num(getattr(r, "pw_p80", None)),
                "nEffective": _num(getattr(r, "n_effective", None)),
            },
            # Confidence indicators (Sprint-5.5.D Outlier-Risk-Flag)
            "outlierRisk":   (r.outlier_risk if isinstance(getattr(r, "outlier_risk", None), str) else None),
            "maxTierProb":   _num(getattr(r, "max_tier_prob", None)),
            "tierEntropy":   _num(getattr(r, "tier_entropy", None)),
            "poolStd":       _num(getattr(r, "pool_std", None)),
        }
        # Risiko-Achsen sind Pflicht; ohne sie kein sinnvolles Profil
        if prof["bustRisk"] is None and prof["starUpside"] is None:
            continue
        key = norm_name(str(r.name))
        # Bei Namens-Kollision: höheres Merit (= kleinerer Slot) gewinnt
        prev = lookup.get(key)
        if prev is None or (prof["meritSlot"] or 99) < (prev["meritSlot"] or 99):
            lookup[key] = prof
    return lookup


def main():
    print("[inject_draft_risk] Loading CSV ...")
    lookup = build_lookup()
    print(f"[inject_draft_risk] Risk profiles: {len(lookup):,}")
    # Sprint-5.4 architecture: outcomeComps are NO LONGER injected into the
    # profile blob. They live as per-prospect static files under
    # data/processed/static/outcome_comps/ and are served lazily by the
    # frontend via /api/outcome_comps/{slug}. Keeps the DB schlank.

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous=OFF")
    rows = conn.execute("SELECT rowid, name, data FROM profiles").fetchall()
    print(f"[inject_draft_risk] Profiles in DB: {len(rows):,}")
    conn.execute("BEGIN TRANSACTION")

    updated = no_match = 0
    for i, row in enumerate(rows, 1):
        p = decompress(row["data"])
        name = p.get("name", row["name"]) or row["name"]
        prof = lookup.get(norm_name(name))
        if prof is None:
            no_match += 1
        elif p.get("riskProfile") != prof:
            p["riskProfile"] = prof
            conn.execute("UPDATE profiles SET data = ? WHERE rowid = ?",
                         (compress(p), row["rowid"]))
            updated += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(rows):,} (updated={updated:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()
    print(f"[inject_draft_risk] Updated: {updated:,} | No match: {no_match:,}")
    print("[inject_draft_risk] Done.")
if __name__ == "__main__":
    main()
