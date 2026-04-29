"""
ProspectTheory API v3.0 — FastAPI backend serving precomputed player data.

Uses compressed api_*.json files from Script 11 (v3 canonical identity schema).

Identity model:
  • Every record keyed by `player_id` (stable, collision-free).
  • URL-safe `slug` for routing (unique per player_id).
  • `name` kept as display text; `name_lower` for case-insensitive search.

Endpoints:
  GET /api/years                         → Available draft years
  GET /api/board?n=500&year=2026         → Big Board (sorted by ppWA)
  GET /api/players/search?q=name         → Search by name / slug / player_id
  GET /api/player/{slug}                 → Full player profile by slug
  GET /api/comps/stats/{slug}            → Statistical comparisons
  GET /api/comps/anthro/{slug}           → Anthropometric comparisons
  GET /api/tiers/{slug}                  → Tier probabilities
  GET /api/players/top?n=50              → Top N by ppWA
  GET /api/players/draft/{year}          → All players from a draft year

All `{slug}` path parameters also accept a player_id (bt:…, rg:…) or a
display name for backwards compatibility. The response always carries
`player_id`, `slug`, and `name` so the frontend can pick the canonical form.

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
import gzip
import json
import os
import sqlite3
import zlib
import threading
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ═══════════════════════════════════════════════════════════
# APP CONFIG
# ═══════════════════════════════════════════════════════════

app = FastAPI(
    title="ProspectTheory API",
    description="NBA Draft Intelligence — Player profiles, comparisons, and tier predictions",
    version="3.0.0",  # canonical identity: player_id PK + slug routing (collision-safe)
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://prospecttheory.io",
        "https://www.prospecttheory.io",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression for all responses (minimum size 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)

# ═══════════════════════════════════════════════════════════
# DATA LOADING (compressed api_*.json from Script 11)
# ═══════════════════════════════════════════════════════════

DATA_DIR = Path(os.getenv("DATA_DIR", "data/processed"))

_profiles = None
_stat_comps = None
_anthro_comps = None
_search_index = None
_years_cache = None   # sorted list of unique draft years


# v3.1: Identity-Lookup-Shims — verhalten sich wie die alten dicts (.get()),
# fragen aber SQLite. Alle Endpoints koennen unveraendert bleiben.
class _SlugToPidShim:
    def get(self, slug, default=None):
        if not slug: return default
        row = _db().execute("SELECT player_id FROM profiles WHERE slug=?", (slug,)).fetchone()
        return row[0] if row else default
    def __contains__(self, slug):
        return self.get(slug) is not None


class _NameToPidShim:
    def get(self, name_lower, default=None):
        if not name_lower: return default
        row = _db().execute(
            "SELECT player_id FROM profiles WHERE name_lower=? LIMIT 1",
            (name_lower,),
        ).fetchone()
        return row[0] if row else default


class _PidToSlugShim:
    def get(self, pid, default=None):
        if not pid: return default
        row = _db().execute("SELECT slug FROM profiles WHERE player_id=?", (pid,)).fetchone()
        return row[0] if row else default


_slug_to_pid = _SlugToPidShim()
_name_to_pid = _NameToPidShim()
_pid_to_slug = _PidToSlugShim()


def _get_years() -> list:
    """Sorted unique draft years from profiles (cached)."""
    global _years_cache
    if _years_cache is None:
        profiles = get_profiles()
        years = sorted({v.get("yr") for v in profiles.values() if v.get("yr")}, reverse=True)
        _years_cache = years
    return _years_cache


# Fields returned by /api/board per player — ALL fields needed for every tab,
# so the front-end NEVER needs a second profile fetch.
_BOARD_FIELDS = [
    "name", "pos", "team", "yr", "source", "made_nba", "tier", "actual",
    "age", "conf_tier", "conf", "ht", "wt", "wingspan",
    # ppWA model v2 + Pfad-3-Output (war ist der primaere Wert, ppwa optional/legacy)
    "war", "ppwa", "pElite", "waFloor", "waCeiling", "waSigma",
    "v2Tier", "v2TierProbs", "v2Conf", "posGroup",
    # Legacy prediction fields (fallback)
    "pred_mu", "pred_sigma", "pred_p_nba", "pred_tier",
    # Tier probabilities (old model — still used as fallback in tier chart)
    "prob_super", "prob_allstar", "prob_starter", "prob_role", "prob_repl", "prob_neg",
    # Core stats (Overview + pReady check)
    "pctl_overall", "pctl", "bpm", "obpm", "dbpm", "ortg",
    "usg", "ts", "pts", "ast", "reb", "stl", "blk",
    "ast_p", "to_p", "orb_p", "drb_p", "stl_p", "blk_p", "ftr",
    "gp", "min", "fg_pct", "efg", "tp_pct", "ft_pct", "two_pct",
    "fta", "ftm", "fga", "fouls_40",
    # Percentiles for box score and advanced stats
    "pctl_pts36", "pctl_reb36", "pctl_ast36", "pctl_ast_to",
    "pctl_stl", "pctl_blk", "pctl_bpm", "pctl_obpm", "pctl_dbpm",
    "pctl_ftr", "pctl_to", "pctl_usg", "pctl_ts", "pctl_orb", "pctl_drb",
    # Shooting zone data (Shooting tab)
    "rim_f", "rim_pct", "mid_f", "mid_pct", "three_f",
    "dunk_r", "dunk_pct",
    # Scores and creation
    "feel", "func_ath", "shoot_score", "def_score", "overall",
    "self_creation", "creation_score", "self_creation_raw", "box_creation",
    "cffr", "cffr_usage_role",
    # Four-factor possession scores (Scouting tab)
    "ff_efg", "ff_tov", "ff_orb", "ff_ftr", "ff_comp",
    # Role inference scores (Scouting tab — 15 roles)
    "role_scorer", "role_playmaker", "role_spacer", "role_driver", "role_crasher",
    "role_onball", "role_rim_prot", "role_rebounder", "role_switch",
    "role_connector", "role_helio", "role_event", "role_zone", "role_micro_spacer",
    "role_versatility",
    # Archetypes and NBA projection
    "archetype", "archetypes_all",
    "career_path", "confidence", "ups",
    "proj_3p", "proj_3pa", "proj_3par", "proj_ts", "proj_prior",
    # Season lines for trajectory
    "seasonLines", "seasons",
    # Recruit rank, source context
    "recRank", "rec_rank", "cls", "bt_url",
    # Badges (pipe-delimited strings)
    "badges", "red_flags", "yellow_badges",
    # Projection drivers
    "projection_boosters", "projection_limiters",
    "v2Boosters", "v2Limiters",
    # 10e: Sekundaeres Intl-Tier-Modell (Board-Spalte + Player-Page-Block)
    "intl_tier",
    "p_intl_eu_impact", "p_intl_eu", "p_intl_top_eu",
    "p_intl_pro", "p_intl_fringe",
]


def load_json(filepath: Path):
    """Load a JSON file (.json or .json.gz). Returns empty dict if missing.
    Wird ab v3.1 nur noch als Fallback genutzt; primary storage = SQLite (s.u.).
    """
    gz_path = Path(str(filepath) + ".gz") if not str(filepath).endswith(".gz") else filepath
    json_path = filepath if not str(filepath).endswith(".gz") else Path(str(filepath)[:-3])

    if gz_path.exists():
        with gzip.open(gz_path, "rt", encoding="utf-8") as f:
            return json.load(f)
    elif json_path.exists():
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        print(f"⚠️  Not found: {filepath}")
        return {}


# ═══════════════════════════════════════════════════════════
# SQLite-Backend (v3.1) — Memory-effizient für Render Free Tier
# ═══════════════════════════════════════════════════════════
# Vorher: 103-MB-JSON wurde komplett in Memory geladen → ~500 MB RAM-Bedarf
# bei Python-dict-Overhead. Render Free Tier hat 512 MB → OOM-Kill beim Start.
#
# Jetzt: prospecttheory.db wird per-Connection geöffnet, queries laden nur die
# gefragten rows. Memory pro Request <1 MB. Lazy-decompress nur für detaillierte
# Profile via /api/player/{slug}.
DB_PATH = Path(os.environ.get("DATA_DIR", "./data/processed")) / "prospecttheory.db"
_db_local = threading.local()

def _db():
    """Thread-local SQLite connection. SQLite-connections sind nicht thread-safe,
    daher pro Worker-Thread eine eigene."""
    conn = getattr(_db_local, "conn", None)
    if conn is None:
        if not DB_PATH.exists():
            raise RuntimeError(f"SQLite database not found at {DB_PATH}")
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        _db_local.conn = conn
    return conn


def _decompress_blob(blob):
    """zlib-decompress + JSON-decode für profiles.data / stat_comps.data / etc."""
    if blob is None:
        return None
    try:
        return json.loads(zlib.decompress(blob).decode("utf-8"))
    except Exception as _err:
        print(f"⚠️ blob decompress failed: {_err}")
        return None


def _ensure_db_present():
    """Beim ersten Zugriff sicherstellen dass die DB da ist."""
    if not DB_PATH.exists():
        print(f"❌ Critical: {DB_PATH} fehlt — Service kann keine Daten servieren.")
        raise RuntimeError(f"DB missing: {DB_PATH}")
    return DB_PATH


class _SqliteProfilesDict:
    """Verhält sich wie ein dict[pid -> profile], lädt aber lazy aus SQLite.
    Notwendig weil bestehende endpoints get_profiles()[pid] und .items() nutzen.
    Nur Code-Pfade die wirklich iterieren (z.B. /api/board) sollten umgestellt werden."""

    def __getitem__(self, pid):
        row = _db().execute(
            "SELECT data FROM profiles WHERE player_id=?", (pid,)
        ).fetchone()
        if row is None:
            raise KeyError(pid)
        return _decompress_blob(row[0]) or {}

    def get(self, pid, default=None):
        try:
            return self[pid]
        except KeyError:
            return default

    def __contains__(self, pid):
        row = _db().execute(
            "SELECT 1 FROM profiles WHERE player_id=? LIMIT 1", (pid,)
        ).fetchone()
        return row is not None

    def __len__(self):
        return _db().execute("SELECT COUNT(*) FROM profiles").fetchone()[0]

    def items(self):
        # NOTE: streamt alle profiles - nicht in memory-kritischen pfaden nutzen.
        # Wird nur fuer Legacy-Code-Pfade gebraucht (z.B. find_player fallback).
        for row in _db().execute("SELECT player_id, data FROM profiles"):
            yield row[0], (_decompress_blob(row[1]) or {})

    def values(self):
        for _pid, prof in self.items():
            yield prof

    def keys(self):
        for row in _db().execute("SELECT player_id FROM profiles"):
            yield row[0]


_profiles_dict = None


def get_profiles() -> dict:
    """SQLite-backed dict-Interface fuer Profile. Memory-Bedarf konstant.
    Endpoints die bestehende get_profiles()[pid] nutzen, funktionieren unveraendert."""
    global _profiles_dict
    if _profiles_dict is None:
        _ensure_db_present()
        _profiles_dict = _SqliteProfilesDict()
    return _profiles_dict


def _ensure_indexes():
    """No-op in v3.1 — SQLite hat eigene Indexes."""
    _ensure_db_present()


def get_stat_comps() -> dict:
    """Lazy stat-comps Lookup ueber SQLite."""
    return _SqliteStatCompsDict()


def get_anthro_comps() -> dict:
    """Lazy anthro-comps Lookup ueber SQLite."""
    return _SqliteAnthroCompsDict()


class _SqliteStatCompsDict:
    """Lazy dict fuer stat_comps - decompress nur bei Lookup."""
    def __getitem__(self, pid):
        row = _db().execute("SELECT data FROM stat_comps WHERE player_id=?", (pid,)).fetchone()
        if row is None: raise KeyError(pid)
        return _decompress_blob(row[0]) or {}
    def get(self, pid, default=None):
        try: return self[pid]
        except KeyError: return default
    def __contains__(self, pid):
        return _db().execute("SELECT 1 FROM stat_comps WHERE player_id=? LIMIT 1", (pid,)).fetchone() is not None
    def __len__(self):
        return _db().execute("SELECT COUNT(*) FROM stat_comps").fetchone()[0]


class _SqliteAnthroCompsDict:
    """Lazy dict fuer anthro_comps."""
    def __getitem__(self, pid):
        row = _db().execute("SELECT data FROM anthro_comps WHERE player_id=?", (pid,)).fetchone()
        if row is None: raise KeyError(pid)
        return _decompress_blob(row[0]) or {}
    def get(self, pid, default=None):
        try: return self[pid]
        except KeyError: return default
    def __contains__(self, pid):
        return _db().execute("SELECT 1 FROM anthro_comps WHERE player_id=? LIMIT 1", (pid,)).fetchone() is not None
    def __len__(self):
        return _db().execute("SELECT COUNT(*) FROM anthro_comps").fetchone()[0]


def get_search_index() -> list:
    """Search-Index aus SQLite. Klein genug (40k entries × ~80 bytes = ~3 MB) fuer In-Memory."""
    global _search_index
    if _search_index is None:
        _ensure_db_present()
        _search_index = []
        for r in _db().execute("SELECT player_id, slug, name, team, pos, year FROM search"):
            _search_index.append({
                "id": r[0], "slug": r[1], "n": r[2],
                "t": r[3] or "", "p": r[4] or "", "y": r[5],
            })
        print(f"Search index lazy-loaded: {len(_search_index):,} entries")
    return _search_index


def find_player(ident: str) -> tuple:
    """SQLite-basiert. 3-stage resolution: player_id -> slug -> name (lower)."""
    if not ident:
        return None, None
    _ensure_db_present()
    pid_candidate = ident.replace("%3A", ":")
    nl = ident.strip().lower()
    # Eine SQL-query mit OR – SQLite waehlt den richtigen Index automatisch.
    row = _db().execute(
        "SELECT player_id, data FROM profiles "
        "WHERE player_id=? OR slug=? OR name_lower=? LIMIT 1",
        (pid_candidate, ident, nl),
    ).fetchone()
    if row is None:
        return None, None
    return row[0], (_decompress_blob(row[1]) or {})


def _identity_fields(pid: str, profile: dict) -> dict:
    """Identity triple. Slug aus profile; falls fehlt, separater SQLite-Lookup."""
    slug = profile.get("slug")
    if not slug and pid:
        row = _db().execute("SELECT slug FROM profiles WHERE player_id=?", (pid,)).fetchone()
        slug = row[0] if row else None
    return {
        "player_id": pid,
        "slug": slug,
        "name": profile.get("name"),
    }


def _pid_to_slug_lookup(pid: str) -> Optional[str]:
    """SQLite version of the old _pid_to_slug dict lookup."""
    if not pid:
        return None
    row = _db().execute("SELECT slug FROM profiles WHERE player_id=?", (pid,)).fetchone()
    return row[0] if row else None


def _name_to_pid_lookup(name: str) -> Optional[str]:
    """SQLite version of the old _name_to_pid dict lookup."""
    if not name:
        return None
    row = _db().execute(
        "SELECT player_id FROM profiles WHERE name_lower=? LIMIT 1",
        (name.strip().lower(),),
    ).fetchone()
    return row[0] if row else None


# ═══════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.on_event("startup")
async def announce_startup():
    """
    KEIN data-loading hier. Der vorige startup-handler hat _ensure_indexes()
    aufgerufen, was den 103-MB-JSON synchron lud — auf Render Free Tier
    (0.1 vCPU) dauert das 30-90 Sekunden, wodurch uvicorn den HTTP-Port erst
    NACH dem Load bindet. Renders Port-Scan-Timeout liegt bei ~60 Sekunden,
    daher 'no open ports detected'.
    Profile-Daten werden jetzt lazy beim ersten Request geladen
    (siehe get_profiles()). Erste Anfrage dauert ~60 Sekunden, alle weiteren
    sind schnell (Memory-Cache via globals).
    """
    print("🚀 ProspectTheory API gestartet — Profile werden lazy beim ersten Request geladen.")


@app.get("/")
async def root():
    return {"name": "ProspectTheory API", "version": app.version}


@app.get("/health")
async def health():
    profiles = get_profiles()
    stats = get_stat_comps()
    return {
        "status": "ok",
        "profiles": len(profiles),
        "stat_comps": len(stats),
    }


@app.get("/api/players/search")
async def search_players(
    q: str = Query(..., min_length=1),
    nba_only: bool = False,
    position: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = Query(25, ge=1, le=100),
):
    """Search players by name (fuzzy, case-insensitive)."""
    _ensure_indexes()
    ql = q.lower()
    results = []
    for entry in get_search_index():
        name = entry.get("n", "")
        if ql not in name.lower():
            continue
        if nba_only and not entry.get("nba"):
            continue
        if position and entry.get("p") != position:
            continue
        if year and entry.get("y") != year:
            continue
        pid = entry.get("id") or _name_to_pid.get(name.lower())
        results.append({
            "player_id": pid,
            "slug": entry.get("slug") or (_pid_to_slug.get(pid) if pid else None),
            "name": name,
            "team": entry.get("t", ""),
            "position": entry.get("p", ""),
            "year": entry.get("y"),
            "made_nba": entry.get("nba", False),
            "tier": entry.get("tier", ""),
            "pred_mu": entry.get("mu"),
            "pred_p_nba": entry.get("pn"),
        })
        if len(results) >= limit:
            break
    return {"query": q, "count": len(results), "results": results}


@app.get("/api/player/{slug}")
async def get_player(slug: str):
    """
    Full player profile. `slug` accepts a slug, player_id, or display name
    (in that priority). Response includes identity triple so the client
    can adopt the canonical slug-based URL.

    seasonLines werden separat aus season_lines-Table geladen (12_json_to_sqlite
    hat sie aus dem profile-blob ausgelagert um Profile kompakter zu halten).
    """
    pid, profile = find_player(slug)
    if profile is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    # Season-Lines aus separater Table joinen
    sl_row = _db().execute(
        "SELECT data FROM season_lines WHERE player_id=?", (pid,)
    ).fetchone()
    if sl_row is not None:
        seasons = _decompress_blob(sl_row[0])
        if seasons is not None:
            profile["seasonLines"] = seasons

    return {**_identity_fields(pid, profile), "profile": profile}


def _lookup_comp_profile(c: dict) -> tuple:
    """
    Resolve an inner comp entry to its (player_id, profile). Comps emitted
    by 11_compress v3 carry `id` + `slug`; legacy comps only have `n`.
    """
    profiles = get_profiles()
    pid = c.get("id")
    if pid and pid in profiles:
        return pid, profiles[pid]
    # Legacy fallback: name-based lookup via our index
    name = c.get("n", "")
    if name:
        fallback_pid = _name_to_pid.get(name.lower())
        if fallback_pid and fallback_pid in profiles:
            return fallback_pid, profiles[fallback_pid]
    return None, {}


@app.get("/api/comps/stats/{slug}")
async def get_statistical_comps(
    slug: str,
    nba_only: bool = False,
    limit: int = Query(15, ge=1, le=50),
):
    """Statistical comparisons for a player (slug / player_id / name)."""
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    comps = get_stat_comps()
    # Primary key: player_id (v3). Legacy fallback: lookup by display name.
    entry = comps.get(pid) or comps.get(profile.get("name", "")) or {}
    comp_list = entry.get("c", [])

    if nba_only:
        comp_list = [c for c in comp_list if c.get("nba")]

    # Enrich comp data with profile info
    # s = Euclidean distance in percentile space; observed range [0.635, 1.716]
    # → normalize to 0–100% similarity: sim = (1.716 - s) / 1.081 * 100
    _S_MAX, _S_RANGE = 1.716, 1.081
    enriched = []
    for c in comp_list[:limit]:
        c_pid, cp = _lookup_comp_profile(c)
        raw_s = c.get("s", _S_MAX)
        similarity = max(0, min(100, round((_S_MAX - raw_s) / _S_RANGE * 100)))
        enriched.append({
            "player_id": c_pid,
            "slug": c.get("slug") or (_pid_to_slug.get(c_pid) if c_pid else None),
            "name": c.get("n", ""),
            # Profile pos is authoritative; comp p-field is a fallback
            "position": cp.get("pos") or c.get("p") or "",
            "similarity": similarity,
            "made_nba": c.get("nba", False) or bool(cp.get("made_nba")),
            "tier": cp.get("v2Tier") or c.get("tier") or cp.get("tier") or "",
            # Key stats from profile for comparison table
            "bpm": cp.get("bpm"),
            "usg": cp.get("usg"),
            "ts": cp.get("ts"),
            "ast_p": cp.get("ast_p"),
            "to_p": cp.get("to_p"),
            "orb_p": cp.get("orb_p"),
            "drb_p": cp.get("drb_p"),
            "blk_p": cp.get("blk_p"),
            "stl_p": cp.get("stl_p"),
            "ftr": cp.get("ftr"),
            "rim_pct": cp.get("rim_pct"),
            "mid_pct": cp.get("mid_pct"),
            "tp_pct": cp.get("tp_pct"),
            "ft_pct": cp.get("ft_pct"),
            "dunk_r": cp.get("dunk_r"),
            "three_par": cp.get("three_par"),
            "min": cp.get("min"),
            "overall": cp.get("overall"),
            "height": cp.get("ht"),
            "badges": cp.get("badges", ""),
        })

    return {**_identity_fields(pid, profile), "count": len(enriched), "comps": enriched}


@app.get("/api/comps/anthro/{slug}")
async def get_anthro_comps(
    slug: str,
    nba_only: bool = False,
    weight_adj: float = 0,
    wingspan_adj: float = 0,
    limit: int = Query(15, ge=1, le=50),
):
    """Anthropometric comparisons with optional weight/wingspan adjustment."""
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    canonical = profile.get("name", "")
    comps = get_anthro_comps()
    entry = comps.get(pid) or comps.get(canonical) or {}
    comp_list = entry.get("c", [])
    measurements = entry.get("m", {})

    # Normalize measurements: combine_* keys → height/weight/wingspan
    m_ht = measurements.get("height") or measurements.get("combine_hgt_no_shoes") or profile.get("ht")
    m_wt = measurements.get("weight") or measurements.get("combine_wgt") or profile.get("wt")
    m_ws = measurements.get("wingspan") or measurements.get("combine_wngspn")
    m_ws_delta = measurements.get("combine_wingspan_delta") or measurements.get("wingspan_delta")

    # Live-search fallback: if no pre-computed comps (e.g. 2026 prospects without combine data),
    # search the entire anthro_comps database using estimated target measurements.
    # Only players in anthro_comps have actual NBA combine measurements (height/weight/wingspan),
    # making them the only valid basis for physical comparison.
    if not comp_list:
        base_ht = m_ht or 78
        # Estimate weight from position/height when unmeasured
        pos = profile.get("pos", "Wing")
        htM = base_ht * 0.0254  # inches → meters
        pos_bmi = 23.5 if pos == "Playmaker" else 26.5 if pos == "Big" else 24.8
        est_wt = round(pos_bmi * htM * htM * 2.205)  # BMI → lbs
        base_wt = est_wt + weight_adj
        # Estimate wingspan via position ape index
        ape = 1.04 if pos == "Playmaker" else 1.06 if pos == "Big" else 1.05
        base_ws = round(base_ht * ape, 1) + wingspan_adj

        all_anthro = get_anthro_comps()
        all_profs = get_profiles()  # Load once outside loop
        # Build NBA player set from pre-computed comps (ground truth).
        # Keys can be pid or name; we resolve both to player_id so the set is
        # collision-safe.
        nba_set = set()
        for _k, _e in all_anthro.items():
            for c in _e.get("c", []):
                if c.get("nba"):
                    cid = c.get("id") or _name_to_pid.get((c.get("n", "") or "").lower())
                    if cid:
                        nba_set.add(cid)
        live = []
        for pkey, pentry in all_anthro.items():
            # pkey is player_id in v3, display name in legacy
            ppid = pentry.get("player_id") or (pkey if ":" in pkey else
                                                _name_to_pid.get(pkey.lower()))
            if ppid == pid:
                continue
            pm = pentry.get("m", {})
            pht = pm.get("combine_hgt_no_shoes") or pm.get("height")
            pwt = pm.get("combine_wgt") or pm.get("weight")
            pws = pm.get("combine_wngspn") or pm.get("wingspan")
            if not pht:  # Must have at least height measurement
                continue
            pp = all_profs.get(ppid, {}) if ppid else {}
            pname_disp = pentry.get("name") or pp.get("name") or (pkey if ":" not in pkey else "")
            ht_d = abs(pht - base_ht)
            wt_d = abs((pwt or base_wt) - base_wt) * 0.5
            ws_d = abs((pws or base_ws) - base_ws) * 1.5
            dist = (ht_d**2 + wt_d**2 + ws_d**2) ** 0.5
            live.append({
                "id": ppid,
                "slug": pentry.get("slug") or (_pid_to_slug.get(ppid) if ppid else None),
                "n": pname_disp, "_dist": dist,
                "nba": ppid in nba_set,
                "tier": pp.get("v2Tier") or pp.get("tier") or "",
                "ht": pht, "wt": pwt, "ws": pws,
            })
        live.sort(key=lambda c: c["_dist"])
        comp_list = live[:50]  # Keep top 50 so nba_only filter still has enough candidates

    if nba_only:
        comp_list = [c for c in comp_list if c.get("nba")]

    # If adjustments on pre-computed comps (live comps already used adjusted base), recalculate
    if weight_adj != 0 or wingspan_adj != 0 and measurements:
        base_ht = m_ht or 78
        base_wt = (m_wt or 200) + weight_adj
        base_ws = (m_ws or 0) + wingspan_adj
        for c in comp_list:
            ht_d = abs((c.get("ht") or base_ht) - base_ht)
            wt_d = abs((c.get("wt") or base_wt) - base_wt) * 0.5
            ws_d = abs((c.get("ws") or base_ws) - base_ws) * 1.5
            c["_dist"] = (ht_d**2 + wt_d**2 + ws_d**2) ** 0.5
        comp_list.sort(key=lambda c: c.get("_dist", 999))

    # Enrich comp measurements from profiles; normalize field names
    # d = Euclidean distance in inch-space; range [0, ~5.6], typical best < 2.0
    # → similarity: linear 0–3" → 100%–0%
    enriched_anthro = []
    for c in comp_list[:limit]:
        c_pid, cp = _lookup_comp_profile(c)
        dist = c.get("_dist", c.get("d", 0)) or 0
        sim = max(0, min(100, round((3.0 - dist) / 3.0 * 100)))
        enriched_anthro.append({
            "player_id": c_pid,
            "slug": c.get("slug") or (_pid_to_slug.get(c_pid) if c_pid else None),
            "name": c.get("n", ""),
            "distance": round(dist, 3),
            "similarity": sim,
            "made_nba": bool(c.get("nba", False)),
            "tier": c.get("tier", cp.get("v2Tier", cp.get("tier", ""))),
            # Measurements: prefer comp-stored values, fall back to profile
            "height": c.get("ht") or cp.get("ht"),
            "weight": c.get("wt") or cp.get("wt"),
            "wingspan": c.get("ws") or cp.get("ws"),
        })

    return {
        **_identity_fields(pid, profile),
        "measurements": {
            "height": m_ht,
            "weight": m_wt,
            "wingspan": m_ws,
            "wingspan_delta": m_ws_delta,
        },
        "adjustments": {"weight": weight_adj, "wingspan": wingspan_adj},
        "count": len(enriched_anthro),
        "comps": enriched_anthro,
    }


@app.get("/api/tiers/{slug}")
async def get_tiers(slug: str):
    """Tier probability distribution."""
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    return {
        **_identity_fields(pid, profile),
        "pred_mu": profile.get("pred_mu"),
        "pred_sigma": profile.get("pred_sigma"),
        "pred_p_nba": profile.get("pred_p_nba"),
        "pred_tier": profile.get("pred_tier"),
        "tiers": {
            "Superstar": profile.get("prob_super"),
            "All-Star": profile.get("prob_allstar"),
            "Starter": profile.get("prob_starter"),
            "Role Player": profile.get("prob_role"),
            "Replacement": profile.get("prob_repl"),
            "Negative": profile.get("prob_neg"),
        },
        "actual": {
            "made_nba": profile.get("made_nba"),
            "tier": profile.get("tier"),
            "peak_pie": profile.get("peak_pie"),
        },
    }


@app.get("/api/years")
async def get_years():
    """Available draft years, sorted descending. Returns latest year for default view."""
    years = _get_years()
    return {
        "years": years,
        "latest": years[0] if years else 2026,
        "api_version": app.version,
    }


@app.get("/api/board")
async def get_board(
    response: Response,
    n: int = Query(200, ge=1, le=2000),
    year: Optional[int] = None,
    position: Optional[str] = None,
):
    """
    Big Board: top N players sorted by ppWA (or pred_mu fallback).
    Returns rich profile data so the frontend does NOT need a second fetch.
    Default n=200 (down from 500) — frontend shows ≤60, this covers all filter combos.
    """
    # Cache-Control: allow CDN/browser to cache for 10 min, serve stale for 1h while revalidating
    response.headers["Cache-Control"] = "public, max-age=600, stale-while-revalidate=3600"

    _ensure_db_present()

    # SQLite-Query: nutzt board-Tabelle mit Indexes auf year + war.
    # Memory-Fussabdruck: ~30 KB fuer 200 rows. Vorher: 500+ MB beim JSON-load.
    # WICHTIG: Klammern um die OR-Bedingung, sonst hat SQL-precedence (OR loose, AND tight)
    # die confidence-clause faelschlich gegen alle anderen filter "veroden".
    where = ["(confidence != 'very_low' OR confidence IS NULL)"]
    params = []
    if year:
        where.append("year=?")
        params.append(year)
    if position:
        where.append("pos=?")
        params.append(position)
    where.append("(age IS NULL OR age <= 24.5)")
    where_sql = " AND ".join(where)

    rows = _db().execute(
        f"SELECT * FROM board WHERE {where_sql} "
        f"ORDER BY COALESCE(war, mu, 0) DESC LIMIT ?",
        params + [n],
    ).fetchall()

    # Wir brauchen zusaetzlich Felder die nur im profiles.data BLOB sind
    # (z.B. badges, Box-Scores, Roles, archetypes_all). Fuer jeden row laden
    # wir on-demand das volle Profile - 200 SELECTs gehen via PK-index in
    # ms-Bereich, kein Memory-Hit.
    pids = [r["player_id"] for r in rows]
    blobs = {}
    if pids:
        # Bulk-fetch im einem Query, ist effizienter als N einzelne
        placeholders = ",".join(["?"] * len(pids))
        for r in _db().execute(
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
        # Erst die board-table-Felder (schnell, denormalized)
        for k in ("team", "pos", "year", "conf", "source", "made_nba", "tier",
                  "mu", "ups", "aspm", "war", "age", "career_path",
                  "overall", "ceiling", "bpm",
                  "prob_super", "prob_allstar", "prob_starter",
                  "prob_role", "prob_repl", "prob_out",
                  "archetype", "confidence",
                  "intl_tier", "p_intl_eu_impact", "p_intl_eu",
                  "p_intl_top_eu", "p_intl_pro", "p_intl_fringe"):
            v = r[k] if k in r.keys() else None
            if v is not None:
                # board.year heisst frontend-seitig 'yr'
                entry["yr" if k == "year" else k] = v
        # Dann die ergaenzenden Felder aus dem profile blob (badges, box-scores,
        # roles, archetypes_all, etc.). Wenn doppelt: blob gewinnt fuer
        # detail-fields, board-table fuer numerics (war/prob_*).
        for field in _BOARD_FIELDS:
            if field in ("name",):
                continue
            if field in entry and entry[field] is not None:
                continue
            v = full.get(field)
            if v is not None:
                entry[field] = v

        results.append(entry)

    return {
        "year": year,
        "count": len(results),
        "players": results,
    }


def _entry_pid(entry: dict) -> str:
    """Resolve a search-index entry to its player_id (v3 has it, legacy doesn't)."""
    pid = entry.get("id")
    if pid:
        return pid
    name = entry.get("n", "")
    return _name_to_pid.get(name.lower()) if name else None


@app.get("/api/players/top")
async def top_players(
    n: int = Query(50, ge=1, le=500),
    year: Optional[int] = None,
    position: Optional[str] = None,
    nba_only: bool = False,
):
    """Top N players by ppWA (Projected Peak Wins Added)."""
    _ensure_indexes()
    profiles = get_profiles()
    candidates = []
    for entry in get_search_index():
        if nba_only and not entry.get("nba"):
            continue
        if position and entry.get("p") != position:
            continue
        if year and entry.get("y") != year:
            continue
        pid = _entry_pid(entry)
        p = profiles.get(pid, {}) if pid else {}
        candidates.append({
            "player_id": pid,
            "slug": entry.get("slug") or (_pid_to_slug.get(pid) if pid else None),
            "name": entry.get("n"),
            "team": entry.get("t"),
            "position": entry.get("p"),
            "year": entry.get("y"),
            "made_nba": entry.get("nba"),
            "tier": p.get("v2Tier") or entry.get("tier"),
            "war": p.get("war"),
            "ppwa": p.get("ppwa"),
            "pElite": p.get("pElite"),
            "pred_mu": entry.get("mu"),
            "pred_p_nba": entry.get("pn"),
        })
    # ppWA as primary sort (fallback: pred_mu)
    candidates.sort(key=lambda x: (-(x.get("war") or x.get("ppwa") or x.get("pred_mu") or 0)))
    return {"count": min(len(candidates), n), "players": candidates[:n]}


@app.get("/api/players/draft/{year}")
async def draft_class(year: int):
    """All players from a specific draft year."""
    _ensure_indexes()
    profiles = get_profiles()
    results = []
    for entry in get_search_index():
        if entry.get("y") == year:
            pid = _entry_pid(entry)
            p = profiles.get(pid, {}) if pid else {}
            results.append({
                "player_id": pid,
                "slug": entry.get("slug") or (_pid_to_slug.get(pid) if pid else None),
                "name": entry.get("n"),
                "team": entry.get("t"),
                "position": entry.get("p"),
                "made_nba": entry.get("nba"),
                "tier": p.get("v2Tier") or entry.get("tier"),
                "war": p.get("war"),
                "ppwa": p.get("ppwa"),
                "pred_mu": entry.get("mu"),
                "pred_p_nba": entry.get("pn"),
            })
    results.sort(key=lambda x: (-(x.get("war") or x.get("ppwa") or x.get("pred_mu") or 0)))
    return {"year": year, "count": len(results), "players": results}


# ═══════════════════════════════════════════════════════════
# STATIC FILES (if frontend built to frontend/dist)
# ═══════════════════════════════════════════════════════════

frontend_dist = Path("frontend/dist")
if frontend_dist.exists():
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
