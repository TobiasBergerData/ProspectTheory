"""
inject_position_overrides.py — Manuelle Position-Overrides nach Pipeline-Run.

Hintergrund (Tobias 2026-06-12):
Die Pipeline (10c_ml_calibration.py) leitet Position automatisch via
Anthro + Statistik ab. Bei Edge-Cases (Wing-Big-Hybriden, HS-Recruits ohne
Profi-Tape, ungewöhnliche Skill-Sets) ist die automatische Klassifikation
manchmal off — z.B. wenn Anthro für Big spricht, aber Skill-Profil + Movement
+ Spielanlage ein Wing-Profil sind.

Diese Overrides sind expliziter Override mit dokumentierter scout-Begründung.
Sie laufen als allerletzter Pipeline-Step, damit alle anderen Inject-Scripts
auf der DB-Original-Position arbeiten (Comp-Sucht, Role-Inferences, etc.)
und nur das Display-Profil-Feld (was im Frontend angezeigt wird) wird
überschrieben.

Wenn ein Override später wieder revertiert werden soll: einfach Eintrag aus
POSITION_OVERRIDES löschen + Re-Deploy.

Run order: nach allen anderen inject_*.py (letzter Step in build.sh).
"""
import sqlite3
import zlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "data" / "processed" / "prospecttheory.db"


# ─── Position Overrides ──────────────────────────────────────────────────
# Key: player_id (bt:XXXXX) — collision-safe (eindeutig pro Spieler-Karriere)
# Value: { "pos": "Wing|Big|Playmaker", "reason": "scout note for audit trail" }
#
# Wenn neuer Override: hier eintragen. Wenn Override nicht mehr gewünscht:
# Eintrag entfernen. Im nächsten Build wird Position aus 10c-Pipeline gelesen.
POSITION_OVERRIDES = {
    # Cameron Boozer (Duke 2026) — Pipeline klassifiziert als "Big" (78" + Frame),
    # aber Skill-Profil (Creation 22.6% 3PA-self-created, Mid-Range-Tape, Movement,
    # FT-Mechanik) + Schul-Tape zeigen Wing-Versatility. Pod-Konsensus: Wing.
    # Boozer's Anthro ist Power-Wing-typisch, nicht Center.
    "bt:134971": {
        "pos": "Wing",
        "reason": "Wing-Versatility + Power-Wing-Frame; Pod 2026-06-04 Konsens",
    },
}


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
    print("=" * 65)
    print("INJECT POSITION OVERRIDES (manual scout-driven fixes)")
    print("=" * 65)

    if not POSITION_OVERRIDES:
        print("  No overrides defined — skipping.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("BEGIN TRANSACTION")

    updated = 0
    not_found = 0
    no_change = 0

    for pid, override in POSITION_OVERRIDES.items():
        row = conn.execute(
            "SELECT rowid, data FROM profiles WHERE player_id=?", (pid,)
        ).fetchone()
        if row is None:
            print(f"  [{pid}] NOT FOUND in profiles table")
            not_found += 1
            continue

        profile = decompress(row["data"])
        old_pos = profile.get("pos")
        new_pos = override["pos"]

        if old_pos == new_pos:
            print(f"  [{pid}] {profile.get('name', '?')}: already '{new_pos}' — no change")
            no_change += 1
            continue

        profile["pos"] = new_pos
        # Audit trail: alte Pipeline-Pos behalten als pos_pipeline (read-only field)
        profile["pos_pipeline"] = old_pos
        profile["pos_override_reason"] = override["reason"]

        conn.execute(
            "UPDATE profiles SET data = ? WHERE rowid = ?",
            (compress(profile), row["rowid"])
        )
        updated += 1
        print(f"  [{pid}] {profile.get('name', '?')}: {old_pos} → {new_pos}")
        print(f"         reason: {override['reason']}")

    conn.commit()
    conn.close()

    print(f"\n[inject_position_overrides] Updated: {updated} | "
          f"Not found: {not_found} | No-change: {no_change}")
    print("[inject_position_overrides] Done.")


if __name__ == "__main__":
    main()
