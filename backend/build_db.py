"""
build_db.py — Render Build-on-Deploy: api_*.json → prospecttheory.db.

Architektur (Tobias 2026-05-05):
  Repo enthaelt nur Source-JSONs (alle <90 MB → kein Git LFS noetig).
  Beim Render-Build wird die SQLite-DB on-the-fly aus den JSONs gebaut.
  DB liegt dann auf Render-Disk, Backend liest sie wie bisher.

Vorteile:
  - Verlustfrei (keine Bench-Slim, keine Comp-Reduktion)
  - Kostenlos (kein LFS, keine Bandwidth-Limits, keine externe Storage)
  - User-Performance unveraendert (lokales SQLite, ~5-20 ms Latency)
  - Skalierbar (mehr Spieler = mehr Splits, jedes <90 MB)

Inputs (aus data/processed/):
  api_profiles_part*.json  (gesplittet, jeder <90 MB)  ODER
  api_profiles.json        (single, falls <90 MB)
  api_search_index.json
  api_stat_comps.json
  api_anthro_comps.json
  api_season_lines.json    (optional)

Output:
  data/processed/prospecttheory.db  (~120 MB, NICHT ins Repo)

Build-Time: ca. 30-60 Sekunden auf Render Free Tier.
"""
from __future__ import annotations

import json
import sqlite3
import sys
import zlib
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data" / "processed"
DB_PATH = DATA_DIR / "prospecttheory.db"


def compress(obj):
    """JSON-encode + zlib-compress (level 9 = max)."""
    return zlib.compress(json.dumps(obj, separators=(",", ":")).encode("utf-8"), level=9)


def name_lower(s):
    return str(s or "").strip().lower()


def _float(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def resolve_year(p):
    for k in ("yr", "year", "season_year", "draft_year"):
        v = p.get(k)
        if v is not None:
            try:
                return int(float(v))
            except (TypeError, ValueError):
                pass
    return None


def create_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            player_id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            name_lower TEXT NOT NULL,
            data BLOB NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_profiles_name_lower ON profiles(name_lower)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS board (
            player_id  TEXT PRIMARY KEY,
            slug       TEXT NOT NULL UNIQUE,
            name       TEXT NOT NULL,
            name_lower TEXT NOT NULL,
            team TEXT, pos TEXT, year INTEGER, conf TEXT,
            source TEXT DEFAULT 'ncaa',
            made_nba INTEGER DEFAULT 0, tier TEXT,
            mu REAL, p_nba REAL, ups REAL, aspm REAL,
            war REAL, age REAL,
            career_path TEXT DEFAULT 'NBA',
            overall REAL, ceiling REAL, bpm REAL,
            prob_super REAL, prob_allstar REAL, prob_starter REAL,
            prob_role REAL, prob_repl REAL, prob_out REAL,
            archetype TEXT, confidence TEXT DEFAULT 'full'
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_board_year ON board(year)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_board_war  ON board(war DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_board_name_lower ON board(name_lower)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS search (
            player_id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL, name_lower TEXT NOT NULL,
            team TEXT, pos TEXT, year INTEGER
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_search_name_lower ON search(name_lower)")
    for t in ("stat_comps", "anthro_comps", "season_lines"):
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {t} (
                player_id TEXT PRIMARY KEY,
                slug TEXT,
                data BLOB NOT NULL
            )
        """)


def load_profiles_data():
    """Liest split-files bevorzugt, sonst single api_profiles.json."""
    split_files = sorted(DATA_DIR.glob("api_profiles_part*.json"))
    if split_files:
        merged = {}
        total = 0
        for sp in split_files:
            sz = sp.stat().st_size
            total += sz
            print(f"  Loading {sp.name} ({sz/1e6:.1f} MB)...")
            with open(sp, "r", encoding="utf-8") as f:
                merged.update(json.load(f))
        print(f"  Split-merge: {len(split_files)} parts, {total/1e6:.1f} MB → {len(merged):,} profiles")
        return merged

    single = DATA_DIR / "api_profiles.json"
    if not single.exists():
        raise FileNotFoundError(f"Neither split parts nor {single.name} found in {DATA_DIR}")
    print(f"  Loading {single.name} ({single.stat().st_size/1e6:.1f} MB)...")
    with open(single, "r", encoding="utf-8") as f:
        return json.load(f)


def load_profiles(cur):
    data = load_profiles_data()
    batch_profiles, batch_board, batch_seasons = [], [], []
    skipped = 0
    for key, p in data.items():
        pid = p.get("player_id") or (key if ":" in key else None)
        slug = p.get("slug")
        name = p.get("name") or (key if ":" not in key else "")
        if not pid or not slug or not name:
            skipped += 1
            continue
        nl = name_lower(name)
        sl = p.pop("seasonLines", None)
        if sl:
            batch_seasons.append((pid, None, compress(sl)))
        batch_profiles.append((pid, slug, name, nl, compress(p)))
        batch_board.append((
            pid, slug, name, nl,
            p.get("team", ""), p.get("pos", ""), resolve_year(p),
            p.get("conf", ""), p.get("source", "ncaa"),
            1 if p.get("made_nba") else 0, p.get("tier", ""),
            _float(p.get("pred_mu")), _float(p.get("pred_p_nba")),
            _float(p.get("ups")), _float(p.get("aspm")),
            _float(p.get("war")), _float(p.get("age")),
            p.get("career_path", "NBA"),
            _float(p.get("overall")), _float(p.get("ceiling")), _float(p.get("bpm")),
            _float(p.get("prob_super")), _float(p.get("prob_allstar")),
            _float(p.get("prob_starter")), _float(p.get("prob_role")),
            _float(p.get("prob_repl")), _float(p.get("prob_out")),
            p.get("archetype", ""), p.get("confidence", "full"),
        ))

    cur.executemany(
        "INSERT OR REPLACE INTO profiles (player_id, slug, name, name_lower, data) VALUES (?,?,?,?,?)",
        batch_profiles,
    )
    cur.executemany(
        """INSERT OR REPLACE INTO board
           (player_id, slug, name, name_lower, team, pos, year, conf, source, made_nba, tier,
            mu, p_nba, ups, aspm, war, age, career_path,
            overall, ceiling, bpm,
            prob_super, prob_allstar, prob_starter,
            prob_role, prob_repl, prob_out,
            archetype, confidence)
           VALUES (?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?)""",
        batch_board,
    )
    if batch_seasons:
        cur.executemany(
            "INSERT OR REPLACE INTO season_lines (player_id, slug, data) VALUES (?,?,?)",
            batch_seasons,
        )
    print(f"  → {len(batch_profiles):,} profiles, {len(batch_seasons):,} season_lines"
          + (f" ({skipped:,} skipped)" if skipped else ""))


def load_search(cur):
    path = DATA_DIR / "api_search_index.json"
    if not path.exists():
        return
    print(f"  Loading {path.name} ({path.stat().st_size/1e6:.1f} MB)...")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    batch = []
    items = data.values() if isinstance(data, dict) else data
    for entry in items:
        pid = entry.get("id") or entry.get("player_id")
        slug = entry.get("slug")
        name = entry.get("n") or entry.get("name")
        if not pid or not slug or not name:
            continue
        batch.append((pid, slug, name, name_lower(name),
                      entry.get("team") or entry.get("t"),
                      entry.get("pos") or entry.get("p"),
                      entry.get("year") or entry.get("yr") or entry.get("y")))
    cur.executemany(
        "INSERT OR REPLACE INTO search (player_id, slug, name, name_lower, team, pos, year) VALUES (?,?,?,?,?,?,?)",
        batch,
    )
    print(f"  → {len(batch):,} search entries")


def load_comps(cur, table, filename):
    path = DATA_DIR / filename
    if not path.exists():
        return
    print(f"  Loading {path.name} ({path.stat().st_size/1e6:.1f} MB)...")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    batch = []
    for key, entry in data.items():
        pid = entry.get("player_id") or (key if ":" in key else None)
        slug = entry.get("slug")
        if not pid or not slug:
            continue
        batch.append((pid, slug, compress(entry)))
    cur.executemany(
        f"INSERT OR REPLACE INTO {table} (player_id, slug, data) VALUES (?,?,?)",
        batch,
    )
    print(f"  → {len(batch):,} entries in {table}")


def main():
    print("=" * 65)
    print("BUILD prospecttheory.db (Render Build-on-Deploy)")
    print("=" * 65)
    print(f"  DATA_DIR: {DATA_DIR}")

    if DB_PATH.exists():
        DB_PATH.unlink()
        print("  Deleted old database")

    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    create_tables(cur)

    load_profiles(cur)
    load_search(cur)
    load_comps(cur, "stat_comps", "api_stat_comps.json")
    load_comps(cur, "anthro_comps", "api_anthro_comps.json")

    conn.commit()
    cur.execute("ANALYZE")
    cur.execute("VACUUM")
    conn.commit()
    conn.close()

    db_size = DB_PATH.stat().st_size / 1e6
    print(f"\n  ✅ Built {DB_PATH.name}: {db_size:.1f} MB")
    print("=" * 65)
    return 0


if __name__ == "__main__":
    sys.exit(main())
