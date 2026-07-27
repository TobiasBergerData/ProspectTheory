#!/usr/bin/env python3
"""
export_board_static.py — Sprint-3.36 (Render Free Tier OOM root-cause fix)
==========================================================================

Wurzel des Problems (siehe Render-Logs vom 2026-06-16):
  Plus /api/board?n=200 hat pro Request ~30-40 MB Peak-Memory verbraucht
    (200 zlib-Blobs decompress + Python-dict + JSON-Serialization).
  Plus Bei 2-3 concurrent requests vom Frontend (board+years+combine)
    überschritt uvicorn das 512-MB-Cap, OOM-Kill, Crash-Loop alle 1-2 min.

Architektureller Fix:
  Plus build_db.py + alle inject_*.py befüllen die DB einmal.
  Plus DIESER script läuft danach genau EINMAL pro Deploy und materialisiert
    die statischen /api/board, /api/years, /api/combine Responses.
  Plus uvicorn serviert sie via FileResponse → ~0 MB Python-Memory.

Output (alles in DATA_DIR/static/):
  ─ board_2026.json, board_2025.json, ... board_2008.json  (200 Spieler pro Jahr)
  ─ board_all.json                                          (200 Top-Spieler ohne Year-Filter)
  ─ years.json
  ─ combine.json

INPUTS:
  • DATA_DIR/prospecttheory.db  (von build_db.py erstellt)
  • backend/main.py             (Field-Listen + Combine-Logik werden importiert)

OUTPUTS:
  • DATA_DIR/static/*.json      (gzipped optional via Content-Encoding)
  • Console-Logs mit Memory-Footprint pro File
"""
from __future__ import annotations
import json
import os
import sqlite3
import sys
import zlib
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE / "data" / "processed"))
DB_PATH = DATA_DIR / "prospecttheory.db"
STATIC_DIR = DATA_DIR / "static"

# n=200 matched dem aktuellen Frontend-Default (siehe App.jsx fetchBoard).
# Wenn das Frontend irgendwann n>200 anfragt → fällt es automatisch in den
# Legacy-SQL-Fallback in main.py, kein Bruch.
BOARD_N = 200

# ── Field-Liste IMPORT aus main.py (Single Source of Truth) ─────────────────
# Plus Damit Sprint-Drift unmöglich wird: wenn jemand main._BOARD_FIELDS ändert,
# wirkt das hier sofort mit, ohne Copy-Paste-Bug.
sys.path.insert(0, str(BASE))
from main import _BOARD_FIELDS, _load_combine_data  # noqa: E402


def _decompress_blob(blob):
    if blob is None:
        return None
    try:
        return json.loads(zlib.decompress(blob).decode("utf-8"))
    except Exception as err:
        print(f"⚠️ blob decompress failed: {err}")
        return None


def _build_board_payload(conn: sqlite3.Connection, year: int | None, n: int = BOARD_N) -> dict:
    """Reproduziert die exakte Response-Struktur von main.py:get_board().

    Plus Auch hier: keine Felder weglassen, sonst bricht das Frontend. Slim-Field
    pruning passiert NICHT auf dieser Ebene — wir profitieren rein durch die
    Pre-Computation + FileResponse-sendfile() im Serving-Pfad.
    """
    where = ["(confidence != 'very_low' OR confidence IS NULL)"]
    params: list = []
    if year:
        where.append("year=?")
        params.append(year)
    else:
        where.append("is_current_class=1")  # Sprint-5.7 D: default = current draft class
    where.append("(age IS NULL OR age <= 24.5)")
    where_sql = " AND ".join(where)

    rows = conn.execute(
        f"SELECT * FROM board WHERE {where_sql} "
        f"ORDER BY COALESCE(war, mu, 0) DESC LIMIT ?",
        params + [n],
    ).fetchall()

    results = _rows_to_entries(conn, rows)

    return {
        "year": year,
        "count": len(results),
        "players": results,
    }


def _build_market_intl_payload(conn: sqlite3.Connection) -> dict:
    """Sprint Recruiting-Fundament: der VOLLE internationale Markt der
    aktuellen Klasse — ohne Top-N-Cap. Das Board-File (Top-200 nach WAR)
    enthält nur eine Handvoll Internationals, weil die WAR-Sortierung
    NCAA-lastig ist; die Recruiting-Views (College Targets, Level-Up,
    Similar) brauchen aber den ganzen Markt. Gleiche Qualitäts-Filter wie
    das Board (confidence, Alter), gleiches Entry-Format (die Frontend-
    Views laufen unverändert über mapProfile). ~160 Spieler, statisch."""
    rows = conn.execute(
        "SELECT * FROM board WHERE source='intl' AND is_current_class=1 "
        "AND (confidence != 'very_low' OR confidence IS NULL) "
        "AND (age IS NULL OR age <= 24.5) "
        "ORDER BY COALESCE(war, mu, 0) DESC",
    ).fetchall()
    n_total = conn.execute(
        "SELECT COUNT(*) FROM board WHERE source='intl' AND is_current_class=1"
    ).fetchone()[0]
    results = _rows_to_entries(conn, rows)
    return {
        "count": len(results),
        # Ehrlichkeit: wie viele intl-Zeilen die Qualitäts-Filter kosten —
        # keine stille Kappung (aktuell 0, aber das kann sich ändern).
        "n_excluded_quality": n_total - len(results),
        "players": results,
    }


def _rows_to_entries(conn: sqlite3.Connection, rows: list) -> list:
    """board-Rows + Profile-Blobs → Frontend-Player-Entries (exakt das
    Format von main.py:get_board(), Single Source of Truth via _BOARD_FIELDS)."""
    pids = [r["player_id"] for r in rows]
    blobs: dict = {}
    if pids:
        placeholders = ",".join(["?"] * len(pids))
        for r in conn.execute(
            f"SELECT player_id, data FROM profiles WHERE player_id IN ({placeholders})",
            pids,
        ):
            blobs[r["player_id"]] = _decompress_blob(r["data"]) or {}

    results = []
    for r in rows:
        pid = r["player_id"]
        full = blobs.get(pid, {})
        entry = {
            "player_id": pid,
            "slug": r["slug"] or full.get("slug"),
            "name": r["name"],
        }
        for k in ("team", "pos", "year", "conf", "source", "made_nba", "tier",
                  "mu", "ups", "aspm", "war", "age", "career_path",
                  "overall", "ceiling", "bpm",
                  "prob_super", "prob_allstar", "prob_starter",
                  "prob_role", "prob_repl", "prob_out",
                  "archetype", "confidence",
                  "intl_tier", "p_intl_eu_impact", "p_intl_eu",
                  "p_intl_top_eu", "p_intl_pro", "p_intl_fringe",
                  "injury_fallback_season", "display_season"):
            v = r[k] if k in r.keys() else None
            if v is not None:
                entry["yr" if k == "year" else k] = v
        for field in _BOARD_FIELDS:
            if field in ("name",):
                continue
            if field in entry and entry[field] is not None:
                continue
            v = full.get(field)
            if v is not None:
                entry[field] = v
        results.append(entry)

    return results


def _get_years_from_db(conn: sqlite3.Connection) -> list[int]:
    """Wie main._get_years(): unique year-Werte aus board-Tabelle."""
    rows = conn.execute(
        "SELECT DISTINCT year FROM board WHERE year IS NOT NULL ORDER BY year DESC"
    ).fetchall()
    return [r["year"] for r in rows]


def _write_json(path: Path, payload: dict) -> int:
    """Atomic write: tmp → rename, vermeidet kaputte Files bei Crash mid-write.
    Returns size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        # separators=(",",":") wie Starlette JSONResponse — kleiner als default
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    tmp.replace(path)
    return path.stat().st_size


def main():
    print(f"[export_board_static] DB: {DB_PATH}")
    print(f"[export_board_static] STATIC_DIR: {STATIC_DIR}")

    if not DB_PATH.exists():
        print(f"❌ DB nicht gefunden: {DB_PATH}")
        sys.exit(1)

    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row

    # ── 1) Per-Year Board JSONs ─────────────────────────────────────────────
    years = _get_years_from_db(conn)
    print(f"[export_board_static] Years in DB: {len(years)} ({years[:5]}...{years[-2:] if len(years)>5 else ''})")

    total_bytes = 0
    for year in years:
        payload = _build_board_payload(conn, year=year, n=BOARD_N)
        out = STATIC_DIR / f"board_{year}.json"
        size = _write_json(out, payload)
        total_bytes += size
        print(f"  ✓ board_{year}.json  ({len(payload['players']):>4} players, {size/1024:>7.1f} KB)")

    # ── 2) Default Board = current draft class (kein Year-Filter → is_current_class=1) ──
    # Sprint-5.7 D: the default view is now the current class (not the all-time WAR top).
    payload_current = _build_board_payload(conn, year=None, n=BOARD_N)
    out_current = STATIC_DIR / "board_current.json"
    size_current = _write_json(out_current, payload_current)
    total_bytes += size_current
    print(f"  ✓ board_current.json ({len(payload_current['players']):>4} players, {size_current/1024:>7.1f} KB)")

    # ── 2b) Intl-Markt (Recruiting-Fundament): alle current-class intl ──────
    payload_market = _build_market_intl_payload(conn)
    size_market = _write_json(STATIC_DIR / "market_intl.json", payload_market)
    total_bytes += size_market
    print(f"  ✓ market_intl.json ({len(payload_market['players']):>4} players, "
          f"{size_market/1024:>7.1f} KB, quality-excluded: "
          f"{payload_market['n_excluded_quality']})")

    # ── 3) Years-Liste ──────────────────────────────────────────────────────
    years_payload = {
        "years": years,
        "latest": years[0] if years else 2026,
        "api_version": "3.0.0",
    }
    size_years = _write_json(STATIC_DIR / "years.json", years_payload)
    total_bytes += size_years
    print(f"  ✓ years.json       ({len(years):>4} years,   {size_years/1024:>7.1f} KB)")

    # ── 4) Combine-Data (statische NBA-Anthro-DB) ───────────────────────────
    # Plus _load_combine_data() liest CSVs und keine DB-Blobs → günstig
    try:
        combine_players = _load_combine_data()
        combine_payload = {"players": combine_players}
        size_combine = _write_json(STATIC_DIR / "combine.json", combine_payload)
        total_bytes += size_combine
        print(f"  ✓ combine.json     ({len(combine_players):>4} players, {size_combine/1024:>7.1f} KB)")
    except Exception as err:
        print(f"  ⚠ combine.json skipped: {err}")

    conn.close()

    print(f"\n[export_board_static] ── Summary ──")
    print(f"  Files written: {len(years)+2}+ in {STATIC_DIR}")
    print(f"  Total size:    {total_bytes/1024/1024:.2f} MB")
    print(f"  Runtime memory savings per /api/board request: ~30-40 MB → ~0 MB (sendfile)")


if __name__ == "__main__":
    main()
