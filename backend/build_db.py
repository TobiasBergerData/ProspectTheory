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
            archetype TEXT, confidence TEXT DEFAULT 'full',
            is_current_class INTEGER DEFAULT 0
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_board_year ON board(year)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_board_current ON board(is_current_class)")
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
    for t in ("season_lines", "comps_v5"):
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {t} (
                player_id TEXT PRIMARY KEY,
                slug TEXT,
                data BLOB NOT NULL
            )
        """)


def iter_profiles_data():
    """Sprint-3.34 (2026-06-16 Render OOM fix): streaming generator.

    Sprint-3.29-3.33 grew the profiles payload from 4 to 5 parts (~204 MB total)
    due to the functionalSize dict expansion. The legacy load_profiles_data
    merged everything into one dict — that peaked at ~250 MB resident, which
    combined with SQLite WAL + the upcoming comps_v5 load pushed past the
    512 MB Free Tier cap. All builds since cb298a2 failed.

    Fix: yield (key, profile) one at a time, one part at a time. Peak memory
    drops from ~250 MB merged dict to ~45 MB per part. Same pattern as
    load_comps_v5 (Sprint-3.14).
    """
    split_files = sorted(DATA_DIR.glob("api_profiles_part*.json"))
    if split_files:
        total = 0
        for sp in split_files:
            sz = sp.stat().st_size
            total += sz
            print(f"  Loading {sp.name} ({sz/1e6:.1f} MB)...")
            with open(sp, "r", encoding="utf-8") as f:
                part = json.load(f)
            yield from part.items()
            del part
            import gc
            gc.collect()
        print(f"  Stream-load: {len(split_files)} parts, {total/1e6:.1f} MB total")
        return

    single = DATA_DIR / "api_profiles.json"
    if not single.exists():
        raise FileNotFoundError(f"Neither split parts nor {single.name} found in {DATA_DIR}")
    print(f"  Loading {single.name} ({single.stat().st_size/1e6:.1f} MB)...")
    with open(single, "r", encoding="utf-8") as f:
        data = json.load(f)
    yield from data.items()


def _flag1(v):
    """Sprint-5.7 D: robust 1/0 for is_current_class across int/float/str/bool JSON
    reprs (pandas may serialize the flag as 1, 1.0, "1", "True", or true)."""
    try:
        return 1 if float(v) == 1.0 else 0
    except (TypeError, ValueError):
        return 1 if str(v).strip().lower() == "true" else 0


def load_profiles(cur):
    """Sprint-3.34: stream from generator + batch-insert every CHUNK_SIZE rows.
    Caps peak memory at ~one part (~45 MB) + one chunk (~5 MB) instead of
    holding the full merged dict (~250 MB)."""
    BATCH_SIZE = 2000
    batch_profiles, batch_board, batch_seasons = [], [], []
    total_profiles = total_seasons = skipped = 0

    profile_sql = "INSERT OR REPLACE INTO profiles (player_id, slug, name, name_lower, data) VALUES (?,?,?,?,?)"
    board_sql = """INSERT OR REPLACE INTO board
           (player_id, slug, name, name_lower, team, pos, year, conf, source, made_nba, tier,
            mu, p_nba, ups, aspm, war, age, career_path,
            overall, ceiling, bpm,
            prob_super, prob_allstar, prob_starter,
            prob_role, prob_repl, prob_out,
            archetype, confidence, is_current_class)
           VALUES (?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?)"""
    season_sql = "INSERT OR REPLACE INTO season_lines (player_id, slug, data) VALUES (?,?,?)"

    def flush():
        nonlocal batch_profiles, batch_board, batch_seasons, total_profiles, total_seasons
        if batch_profiles:
            cur.executemany(profile_sql, batch_profiles)
            cur.executemany(board_sql, batch_board)
            total_profiles += len(batch_profiles)
        if batch_seasons:
            cur.executemany(season_sql, batch_seasons)
            total_seasons += len(batch_seasons)
        batch_profiles, batch_board, batch_seasons = [], [], []

    for key, p in iter_profiles_data():
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
            _flag1(p.get("is_current_class")),
        ))

        if len(batch_profiles) >= BATCH_SIZE:
            flush()

    flush()
    print(f"  → {total_profiles:,} profiles, {total_seasons:,} season_lines"
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
    """Load a single comp file into a DB table.

    Sprint-3.14: chunked batch insertion + explicit dict deletion. With
    stat_comps at 42 MB and anthro_comps at 60 MB the original "load whole
    dict, build full batch, insert" pattern held ~150 MB resident per call;
    chunking caps that and lets gc reclaim incrementally.
    """
    path = DATA_DIR / filename
    if not path.exists():
        return
    print(f"  Loading {path.name} ({path.stat().st_size/1e6:.1f} MB)...")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    inserted = 0
    chunk = []
    CHUNK_SIZE = 2000
    for key, entry in data.items():
        pid = entry.get("player_id") or (key if ":" in key else None)
        slug = entry.get("slug")
        if not pid or not slug:
            continue
        chunk.append((pid, slug, compress(entry)))
        if len(chunk) >= CHUNK_SIZE:
            cur.executemany(
                f"INSERT OR REPLACE INTO {table} (player_id, slug, data) VALUES (?,?,?)",
                chunk,
            )
            inserted += len(chunk)
            chunk = []
    if chunk:
        cur.executemany(
            f"INSERT OR REPLACE INTO {table} (player_id, slug, data) VALUES (?,?,?)",
            chunk,
        )
        inserted += len(chunk)
    del data  # free the JSON dict before the next loader runs
    print(f"  → {inserted:,} entries in {table}")


def load_comps_v5(cur):
    """Sprint-3.10.A + Sprint-3.14 streaming variant.

    Sprint-3.14 (Tobias 2026-06-13 Render OOM fix): the original implementation
    merged ALL api_comps_v5_part*.json files into one in-memory dict before
    inserting into SQLite. With 4 split files at ~38 MB each, the merged dict
    plus the simultaneously-loaded api_profiles + stat_comps + anthro_comps
    dicts blew past Render's 512 MB Free-Tier limit and killed the build with
    a connection-reset crash. The fix below processes one split at a time:
    load the JSON, batch-insert into SQLite, free the dict, move on. Peak
    memory drops from ~500 MB merged to ~50 MB per part.
    """
    split_files = sorted(DATA_DIR.glob("api_comps_v5_part*.json"))
    if not split_files:
        single = DATA_DIR / "api_comps_v5.json"
        if not single.exists():
            print("  ⚠ api_comps_v5 not found — skipping v5 comps")
            return
        split_files = [single]

    total_inserted = 0
    total_mb = 0.0
    for sp in split_files:
        sz_mb = sp.stat().st_size / 1e6
        total_mb += sz_mb
        print(f"  Loading {sp.name} ({sz_mb:.1f} MB)...")
        with open(sp, "r", encoding="utf-8") as f:
            part_data = json.load(f)

        batch = []
        for pid, entry in part_data.items():
            if not isinstance(entry, dict):
                continue
            # Slim v5 entries have no separate slug field — looked up via profiles.
            batch.append((str(pid), None, compress(entry)))

        cur.executemany(
            "INSERT OR REPLACE INTO comps_v5 (player_id, slug, data) VALUES (?,?,?)",
            batch,
        )
        total_inserted += len(batch)
        # Free memory immediately before loading the next split.
        del part_data
        del batch

    print(f"  v5 streaming-load: {len(split_files)} parts, {total_mb:.1f} MB → "
          f"{total_inserted:,} entries in comps_v5")


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

    # Sprint-3.14 (Tobias 2026-06-13): commit + gc between stages so each
    # loader has the full Free-Tier memory budget. Without these commits, the
    # WAL grows in memory, and the profile dict from load_profiles_data is
    # held by load_profiles until its function frame exits — combined with
    # the comps_v5 streaming load that follows, we kept blowing past 512 MB.
    import gc
    load_profiles(cur)
    conn.commit()
    gc.collect()

    load_search(cur)
    conn.commit()
    gc.collect()

    # 5.8.2: legacy stat_comps + anthro_comps REMOVED (superseded by comps_v5).
    # No longer produced by 11_compress or consumed by frontend/backend → not loaded.
    # (Saves ~105 MB of source JSON + the two DB tables.)

    load_comps_v5(cur)  # Sprint-3.10.A + Sprint-3.14 streaming load
    conn.commit()
    gc.collect()

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
