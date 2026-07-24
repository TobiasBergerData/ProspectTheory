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
  GET /api/comps/stats/{slug}            → Statistical comparisons (v3 legacy)
  GET /api/comps/anthro/{slug}           → Anthropometric comparisons (v3 legacy)
  GET /api/comps/v5/{slug}               → NBA-Profi 5-dim Comp Engine (Sprint-3.10)
  GET /api/tiers/{slug}                  → Tier probabilities
  GET /api/players/top?n=50              → Top N by ppWA
  GET /api/youth                         → ANGT Youth Radar (U18 tournament production)
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


# Tobias 2026-06-03 v2: JSONResponse NaN/Inf cleaner (monkey-patch)
# Some api_profiles entries (multi-year aggregated rows for older NCAA cohorts)
# contain NaN or Inf floats stored in SQLite blobs. Python json.dumps with
# default allow_nan=True writes these, so they end up in the blobs. Starlette's
# default JSONResponse uses allow_nan=False → ValueError → 500.
#
# Strategy: monkey-patch JSONResponse.render to recursively replace NaN/Inf
# with None before serialization. Works for ALL endpoints without touching
# the FastAPI() instantiation.
def _nan_safety_install():
    import math as _msafe
    import json as _jsafe
    from fastapi.responses import JSONResponse as _JR

    def _clean(obj):
        if isinstance(obj, dict):
            return {k: _clean(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_clean(v) for v in obj]
        if isinstance(obj, float):
            if _msafe.isnan(obj) or _msafe.isinf(obj):
                return None
        return obj

    def _safe_render(self, content):
        return _jsafe.dumps(
            _clean(content),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")

    _JR.render = _safe_render

_nan_safety_install()

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
_comps_v5 = None       # Sprint-3.10.A NBA-Profi 5-dim Comps Engine
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
    # Sprint-5.5.J Phase 6: projected_war = 10c ML Calibration
    # composite peak_wa (Tobias' "ppwa peak modeling" with kollin-
    # cleaned features + humble-gates). Primary source for Big Board
    # headline (frontend mapProfile reads d.projected_war first).
    "war", "ppwa", "projected_war", "pElite", "waFloor", "waCeiling", "waSigma",
    "v2Tier", "v2TierProbs", "v2Conf", "posGroup",
    # Added-Wins projection (NEW primary metric) — MUST be sent or the board falls
    # back to legacy ppWA and mixes scales (Tobias 2026-05-25).
    "addedWins",
    # Legacy prediction fields (fallback)
    "pred_mu", "pred_sigma", "pred_p_nba", "pred_tier",
    # Tier probabilities (old model — still used as fallback in tier chart)
    "prob_super", "prob_allstar", "prob_starter", "prob_role", "prob_repl", "prob_neg",
    # Sprint-5.5.E RF Proximity engine output (nested object).
    # riskProfile.tierProbs.{intl_career,replacement,roleplayer,starter,all_star,superstar}
    # riskProfile.pwDistribution.{mode,p20,p50,p80,nEffective}
    # riskProfile.outlierRisk = "low" | "medium" | "high"
    # Used by Big Board RangeView + TierBoardView + Hero-Card single-source-of-truth.
    "riskProfile",
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
    # Phase 2D (Tobias 2026-05-17): Intl-only Percentiles (Wemby-FTR-Fix).
    # Frontend swappt für source=intl auf diese Cohort-internen Werte.
    "pctl_ftr_intl", "pctl_ts_intl", "pctl_efg_intl", "pctl_usg_intl",
    "pctl_ast_intl", "pctl_to_intl", "pctl_orb_intl", "pctl_drb_intl",
    "pctl_stl_intl", "pctl_blk_intl", "pctl_bpm_intl", "pctl_obpm_intl",
    "pctl_dbpm_intl", "pctl_ortg_intl",
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
    # Sprint-5.11: International Career Model (intl_tier_model_v2) — eigenes Board
    "pred_intl_tier", "intl_level_ev", "p_intl_career",
    "prob_intl_euroleague", "prob_intl_topkont", "prob_intl_starknat",
    "prob_intl_solide", "prob_intl_unterbau",
    # Sprint-5.13 Recruiting-Board: Karriere-Comps + aktuelles Umfeld-Level
    "intl_comps", "conf_strength",
    # Tobias 2026-05-05: Injury-Saison-Fallback
    # injury_fallback_season = die uebersprungene (verletzte) Saison
    # display_season = die Saison fuer UI (Team/Class-Anzeige) — bleibt aktuelle Saison
    # Stats kommen aus Vorsaison (Pred-Basis), Display zeigt aktuelle Saison
    "injury_fallback_season", "display_season",
    # Tobias 2026-05-05: FIBA-Bridge + Pro-Liga Early-Bloomer (intl)
    "fiba_youth_dominance", "fiba_senior_early",
    "fiba_career_peak_per", "fiba_total_apps",
    "pro_early_bloomer",
    "intl_first_pro_season", "intl_first_pro_bpm", "intl_first_pro_league",
    # Tobias 2026-05-05: Potential-Tier (P>=30%) + counting-stats imputation flag
    "potential_tier", "counting_stats_imputed",
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


# 5.8.2: get_stat_comps / get_anthro_comps + their lazy SQLite dict classes
# REMOVED — legacy stat/anthro comps superseded by comps_v5 (see route_comps_v5).


class _SqliteCompsV5Dict:
    """Sprint-3.10.A: Lazy DB-Wrapper for NBA-Profi 5-dim Comps Engine.

    Plus identical pattern wie _SqliteStatCompsDict/_SqliteAnthroCompsDict.
    Plus entries enthalten: 5 dimensions × top-K comps + cohort/cluster forecasts +
    functional_position + combine_coverage + triangulated forecast.
    """
    def __getitem__(self, pid):
        row = _db().execute("SELECT data FROM comps_v5 WHERE player_id=?", (pid,)).fetchone()
        if row is None: raise KeyError(pid)
        return _decompress_blob(row[0]) or {}
    def get(self, pid, default=None):
        try: return self[pid]
        except KeyError: return default
    def __contains__(self, pid):
        return _db().execute("SELECT 1 FROM comps_v5 WHERE player_id=? LIMIT 1", (pid,)).fetchone() is not None
    def __len__(self):
        return _db().execute("SELECT COUNT(*) FROM comps_v5").fetchone()[0]


def get_comps_v5() -> dict:
    """Sprint-3.10.A: NBA-Profi 5-dim Comps Engine accessor."""
    global _comps_v5
    if _comps_v5 is None:
        _comps_v5 = _SqliteCompsV5Dict()
    return _comps_v5


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
    """SQLite-basiert. Mehrstufige Resolution:
      1) Exact: player_id → slug → name_lower
      2) Slug-Prefix-Fallback (NEU 2026-06-04, Tobias): wenn Stage 1 leer und ident
         wie ein Slug-Präfix aussieht (lowercase + hyphens), suche `slug LIKE 'ident-%'`.
         Bei mehreren Treffern gewinnt der neueste entry_year (frischester Prospect).

    Warum Prefix-Fallback?
      Frontend, Sitemap und externe Links nutzen historisch unterschiedliche Slug-
      Präzisionen (z.B. 'cameron-boozer' vs canonical 'cameron-boozer-duke-26').
      Backend ist die einzige Stelle die OHNE Frontend-Kenntnis robust gegen
      Slug-Verkürzungen sein kann. Statt 404 → canonical Profile zurückliefern.
      Frontend kann via response.slug die URL auf canonical replaceState aktualisieren.
    """
    if not ident:
        return None, None
    _ensure_db_present()
    pid_candidate = ident.replace("%3A", ":")
    nl = ident.strip().lower()

    # ── Stage 1: exact match (player_id | slug | name_lower) ──
    row = _db().execute(
        "SELECT player_id, data FROM profiles "
        "WHERE player_id=? OR slug=? OR name_lower=? LIMIT 1",
        (pid_candidate, ident, nl),
    ).fetchone()
    if row is not None:
        return row[0], (_decompress_blob(row[1]) or {})

    # ── Stage 2: slug-prefix fallback ──
    # Trigger nur wenn ident slug-shaped ist (lowercase + hyphens, kein space/colon).
    # Schützt gegen False-Positive bei Name-Lookups wie "Cameron Boozer".
    is_slug_shaped = (
        ident
        and ident == ident.lower()
        and " " not in ident
        and ":" not in ident
        and "-" in ident
    )
    if not is_slug_shaped:
        return None, None

    # profiles-Table hat KEINE entry_year column (nur player_id, slug, name,
    # name_lower, data). Daher: kleine Kandidaten-Liste holen (slug DESC = oft
    # frischestes Jahr-Suffix zuerst, z.B. '-26' > '-21'), dann data parsen
    # um echte yr/entry_year aus dem Profile-Blob zu lesen. Bei <=20 Kandidaten
    # vernachlässigbarer Overhead (Prefix-Match ist seltener Edge-Case).
    rows = _db().execute(
        "SELECT player_id, data FROM profiles "
        "WHERE slug LIKE ? "
        "ORDER BY slug DESC "
        "LIMIT 20",
        (f"{ident}-%",),
    ).fetchall()
    if not rows:
        return None, None

    # Wähle Kandidat mit höchstem yr (Profile-Field, von 10_composite_scores
    # gesetzt). Bei ties: erster nach slug DESC gewinnt.
    best_pid, best_profile, best_yr = None, None, float("-inf")
    for pid, data_blob in rows:
        prof = _decompress_blob(data_blob) or {}
        try:
            yr = float(prof.get("yr") or prof.get("draftYear") or 0)
        except (TypeError, ValueError):
            yr = 0
        if yr > best_yr:
            best_yr = yr
            best_pid = pid
            best_profile = prof
    if best_pid is None:
        # Fallback (alle ohne yr): nehme ersten nach slug DESC
        best_pid, first_blob = rows[0]
        best_profile = _decompress_blob(first_blob) or {}
    return best_pid, best_profile


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
    return {
        "status": "ok",
        "profiles": len(profiles),
    }


# ── ANTHRO DATA ENDPOINT (Tobias 2026-05-06) ──
# Liefert NBA-Anthropometrik für Body-Tab Scatter.
# Drei Quellen gemerged:
#   1. wingspan_all_2026-03-13.csv (1.835 NBA-Spieler) — primär für ht+ws (alle vollständig)
#   2. barttorvik_with_nba_and_combine_COMPLETE.csv — für weight via Name-Match
#   3. fallback: keine Combine-Daten → wt None (Frontend imputiert via Position-BMI)
#
# WICHTIG (Tobias 2026-05-06): Höhe IMMER mit Schuhen. Wingspan-CSV ist no-shoes,
# wir addieren +1.0″ Standard-Schuh-Lift damit Display konsistent ist.
_combine_cache = None
SHOE_LIFT_INCHES = 1.25  # Tobias 2026-05-06: NBA-Standard-Schuh-Lift


def _to_pos_group(pos_str: str) -> str:
    """Mappe Position-String → Playmaker/Wing/Big.
    PG → Playmaker · C/PF-C → Big · alles andere (SG/SF/PF/F) → Wing."""
    if not pos_str:
        return ""
    cp = str(pos_str).upper().strip()
    if cp == "C" or cp.endswith("-C") or cp == "PF-C" or cp == "C-PF":
        return "Big"
    if cp == "PG" or cp.startswith("PG"):
        return "Playmaker"
    return "Wing"


def _to_inches(val) -> float:
    try:
        v = float(val) if val not in (None, "") else 0.0
        return v
    except (TypeError, ValueError):
        return 0.0


def _load_combine_data():
    """Lazy-load + cache anthro measurements als list[dict].
    Output pro Spieler: name, pos (group), pos_raw, ht (with shoes), ws, wt, sr, *_verified flags.

    Tobias 2026-05-09: Combine 2026 verifizierte Werte überschreiben imputierte.
    verified_2026 Flag im wingspan-CSV signalisiert echte (nicht imputierte) Werte."""
    global _combine_cache
    if _combine_cache is not None:
        return _combine_cache
    import csv as _csv

    raw_dir = DATA_DIR.parent / "raw"
    wingspan_path = raw_dir / "wingspan_all_2026-03-13.csv"
    combine_path = raw_dir / "barttorvik_with_nba_and_combine_COMPLETE.csv"
    combine_2026_path = raw_dir / "combine_2026_verified.csv"  # Tobias 2026-05-09

    # Step 0: Load 2026 verified Combine data (preferred over imputation)
    verified_2026 = {}
    if combine_2026_path.exists():
        with open(combine_2026_path, "r", encoding="utf-8") as f:
            for r in _csv.DictReader(f):
                name = (r.get("player_name") or "").strip().lower()
                if not name:
                    continue
                ht_ws = _to_inches(r.get("height_with_shoes_in"))
                ws    = _to_inches(r.get("wingspan_in"))
                wt    = _to_inches(r.get("weight_lbs"))
                sr    = _to_inches(r.get("standing_reach_in"))
                verified_2026[name] = {
                    "ht": round(ht_ws, 1) if ht_ws > 0 else None,
                    "ws": round(ws, 1) if ws > 0 else None,
                    "wt": round(wt, 1) if wt > 0 else None,
                    "sr": round(sr, 1) if sr > 0 else None,
                }

    # Step 1: Build weight-lookup from Combine (per name_lower)
    wt_lookup = {}
    year_lookup = {}
    if combine_path.exists():
        with open(combine_path, "r", encoding="utf-8") as f:
            for r in _csv.DictReader(f):
                name = (r.get("player_name") or r.get("combine_player_name") or "").strip().lower()
                if not name:
                    continue
                wt = _to_inches(r.get("combine_weight_lbs") or r.get("combine_wgt"))
                if wt > 0 and name not in wt_lookup:
                    wt_lookup[name] = round(wt, 1)
                yr_str = r.get("combine_year") or r.get("SEASON")
                try:
                    if yr_str and name not in year_lookup:
                        year_lookup[name] = int(float(yr_str))
                except (TypeError, ValueError):
                    pass

    # Step 2: Wingspan CSV ist Primärquelle (1.835 Spieler mit ht+ws)
    out = []
    if not wingspan_path.exists():
        _combine_cache = []
        return _combine_cache

    with open(wingspan_path, "r", encoding="utf-8") as f:
        for r in _csv.DictReader(f):
            ht_no_shoes = _to_inches(r.get("height_wo_shoes_in"))
            ws = _to_inches(r.get("wingspan_in"))
            if ht_no_shoes <= 0 or ws <= 0:
                continue
            # Höhe mit Schuhen: +1.0″ Standard-Lift
            ht_with_shoes = ht_no_shoes + SHOE_LIFT_INCHES
            name = (r.get("player") or "").strip()
            name_lower = name.lower()
            wt = wt_lookup.get(name_lower)
            year = year_lookup.get(name_lower)
            raw_pos = r.get("primary_pos") or r.get("pos2") or ""

            # Tobias 2026-05-09: Override mit verifizierten 2026er Combine-Werten wenn vorhanden
            v26 = verified_2026.get(name_lower)
            final_ht = round(ht_with_shoes, 1)
            final_ws = round(ws, 1)
            final_wt = wt
            final_sr = None
            ht_verified = ws_verified = wt_verified = sr_verified = False

            if v26:
                if v26.get("ht"):  final_ht = v26["ht"]; ht_verified = True
                if v26.get("ws"):  final_ws = v26["ws"]; ws_verified = True
                if v26.get("wt"):  final_wt = v26["wt"]; wt_verified = True
                if v26.get("sr"):  final_sr = v26["sr"]; sr_verified = True

            out.append({
                "name": name,
                "year": year,
                "pos_raw": raw_pos,
                "pos": _to_pos_group(raw_pos),
                "ht": final_ht,
                "ws": final_ws,
                "wt": final_wt,
                "sr": final_sr,  # NEW: Standing Reach
                "ht_verified": ht_verified,
                "ws_verified": ws_verified,
                "wt_verified": wt_verified,
                "sr_verified": sr_verified,
                "ht_source": "combine_2026" if ht_verified else "measured_with_shoe_lift",
                "wt_source": "combine_2026" if wt_verified else ("combine" if wt is not None else "imputed"),
            })

    # Step 3: Add 2026er-only entries (Players not yet in wingspan_all CSV)
    existing_names = {row["name"].lower() for row in out}
    for name_lower, v in verified_2026.items():
        if name_lower in existing_names:
            continue
        # Try to recover the original-case name from the verified CSV
        with open(combine_2026_path, "r", encoding="utf-8") as f:
            for r in _csv.DictReader(f):
                if (r.get("player_name") or "").strip().lower() == name_lower:
                    out.append({
                        "name": r.get("player_name").strip(),
                        "year": 2026,
                        "pos_raw": r.get("position") or "",
                        "pos": _to_pos_group(r.get("position") or ""),
                        "ht": v.get("ht"),
                        "ws": v.get("ws"),
                        "wt": v.get("wt"),
                        "sr": v.get("sr"),
                        "ht_verified": v.get("ht") is not None,
                        "ws_verified": v.get("ws") is not None,
                        "wt_verified": v.get("wt") is not None,
                        "sr_verified": v.get("sr") is not None,
                        "ht_source": "combine_2026",
                        "wt_source": "combine_2026" if v.get("wt") else "missing",
                    })
                    break

    _combine_cache = out
    return out


@app.get("/api/combine")
async def get_combine_data(response: Response):
    """NBA Anthropometrik (Wingspan-DB 1.835 Spieler + Combine-Weights).
    Höhe IMMER mit Schuhen (Wingspan-CSV no-shoes + SHOE_LIFT_INCHES Standard-Lift).
    Weight-Daten aus Combine wenn vorhanden, sonst null (Frontend imputiert).

    Sprint-3.36: Static-File-Pfad als Hot-Path, SQL-Fallback wenn fehlt.
    Combine ändert sich pro Deploy einmal → CDN-Cache 1h."""
    static = _serve_static_or_none("combine.json", response, max_age=3600)
    if static:
        return static
    response.headers["X-Source"] = "sql-fallback"
    return {"players": _load_combine_data()}


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
            _normalize_season_minutes(seasons)
            profile["seasonLines"] = seasons

    return {**_identity_fields(pid, profile), "profile": profile}


# ─── Season-Minutes Normalisierung (Sprint-5.11 Einheiten-Fix) ────────────
# Das seasonLines-`min`-Feld ist inzwischen QUELLENÜBERGREIFEND bereits MPG —
# verifiziert an bekannten Spielern: Zach Edey 2024 = 31.7, Cooper Flagg 2025 =
# 29.1, Dylan Harper = 35.0, Cameron Boozer 2026 = 33.4 (reale Minuten/Spiel).
# Wären es Prozentwerte, lägen Starter bei 70–95; Maximum ist aber 42 → MPG.
#
# Der frühere pauschale ×0.40 auf NCAA-Saisons (alte Annahme: BartTorvik min =
# Min%) korrumpierte diese bereits korrekten MPG-Werte: NCAA wurde auf ~40 %
# gestaucht (Edey 31.7 → 12.7), INTL blieb korrekt (~20–40) → sichtbarer
# Mismatch. Deshalb: KEINE pauschale Klassen-Konvertierung mehr. Wir rescalen
# nur noch physikalisch unmögliche MPG (> 48 = Legacy-Prozentwert), falls je
# eine alte %-Kohorte durchrutscht. Aktuelle Daten (max 42) triggern das nie.
_MAX_PLAUSIBLE_MPG = 48.0   # 40-min-Spiel + reichlich OT-Puffer

def _normalize_season_minutes(seasons):
    """Lässt echte MPG unangetastet; rescaled nur Legacy-%-Werte (min > 48)."""
    if not isinstance(seasons, list):
        return
    for s in seasons:
        if not isinstance(s, dict):
            continue
        m = s.get("min")
        if m is None or not isinstance(m, (int, float)):
            continue
        if m > _MAX_PLAUSIBLE_MPG:      # unmöglich als MPG → Legacy-Min% → MPG
            s["min"] = round(m * 0.40, 1)


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


# 5.8.2: /api/comps/stats route REMOVED — legacy stat comps superseded by comps_v5.


# 5.8.2: /api/comps/anthro route REMOVED — legacy anthro comps superseded by
# comps_v5. (Body-Tab anthropometry is served separately via the /anthro endpoint.)


# ═══════════════════════════════════════════════════════════════════════════
# Sprint-3.10.A: NBA-Profi 5-dim Comps Engine v5
# ═══════════════════════════════════════════════════════════════════════════
@app.get("/api/comps/v5/{slug}")
async def route_comps_v5(slug: str):
    """v5 Multi-Dimensional NBA-Profi Comp Engine — gibt complete v5 payload.

    Plus return-Struktur:
      - identity (player_id, slug, name)
      - functional_position (Layer 7, 8-way classification)
      - pos_group (canonical 3-way)
      - dimensions: {style, skill, physical, trajectory, outcome} mit top-5 mixed
      - dimensions_nba: same dimensions filtered to NBA-careered top-3
      - cohort_forecast (Layer 3 age-stage)
      - cluster_forecast (Layer 4 archetype)
      - triangulated_forecast (Layer 3 + 4 combined)
      - combine_coverage (Sprint-3.8.E disclosure flag)
      - meta (calibration verdict + sample sizes)

    Plus methodisch: 5 separate Comp-Dimensionen + Bayesian-shrunk forecasts
    mit 95% Credibility Intervals. Plus backtest-validated EXCELLENT calibration.
    """
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    comps_v5 = get_comps_v5()
    entry = comps_v5.get(pid, {})

    if not entry:
        return {
            **_identity_fields(pid, profile),
            "available": False,
            "reason": "v5 comp data not available for this player",
        }

    # Sprint-3.12 (Tobias 2026-06-13): Individual Player Forecast.
    # Methodological motivation: Layer 3 (cohort) and Layer 4 (cluster) forecasts
    # are AGGREGATE estimates — every player in the same age+position cohort
    # gets the same numbers, regardless of how good they actually are. A
    # second-round Wing and a top-5 Wing both inherit "Wing 18.5-19.5" cohort
    # outcomes. That is the right thing for those layers (they are baselines),
    # but the user needs a forecast that ACTUALLY discriminates.
    #
    # 10c already computes per-player tier probabilities from the LightGBM model.
    # We expose them here as the "Individual" forecast — the primary view in the
    # UI — with the existing Cohort/Cluster layers retained as context baselines.
    #
    # Tier semantics (consistent with Sprint-3.11):
    #   Roleplayer+: P(WAR >= 0.9)  = super + allstar + starter + role
    #   Starter+:    P(WAR >= 3.2)  = super + allstar + starter
    #   All-Star+:   P(WAR >= 6.6)  = super + allstar
    #   Bust (<0):   P(WAR < 0)     = neg
    individual_forecast = None
    if profile:
        _ps = profile.get("prob_super")
        _pa = profile.get("prob_allstar")
        _pst = profile.get("prob_starter")
        _pr = profile.get("prob_role")
        _prep = profile.get("prob_repl")
        _pn = profile.get("prob_neg") or profile.get("prob_out")
        if any(v is not None for v in [_ps, _pa, _pst, _pr, _prep, _pn]):
            # Fill None with 0 only after presence check (preserve true zeros).
            _ps = _ps or 0; _pa = _pa or 0; _pst = _pst or 0
            _pr = _pr or 0; _prep = _prep or 0; _pn = _pn or 0
            # Detect scale: 10c outputs are typically already in percent (0-100).
            _total = _ps + _pa + _pst + _pr + _prep + _pn
            _scale = 1.0 if _total > 1.5 else 100.0
            individual_forecast = {
                "pct_all_star_plus":    round((_ps + _pa) * _scale, 1),
                "pct_starter_plus":     round((_ps + _pa + _pst) * _scale, 1),
                "pct_role_player_plus": round((_ps + _pa + _pst + _pr) * _scale, 1),
                "pct_busted":           round(_pn * _scale, 1),
                "source":               "10c_lightgbm_tier_probs",
                "war_point_estimate":   profile.get("war") or profile.get("ppwa"),
                # Plus raw tier probs für transparency in tooltip
                "tier_probs": {
                    "superstar":    round(_ps * _scale, 1),
                    "all_star":     round(_pa * _scale, 1),
                    "starter":      round(_pst * _scale, 1),
                    "roleplayer":   round(_pr * _scale, 1),
                    "replacement":  round(_prep * _scale, 1),
                    "negative":     round(_pn * _scale, 1),
                },
            }

    # Plus die slim v5 entry hat compact keys (fp, pg, cc, cohort, cluster, forecast).
    # Plus die response struct expand zu human-readable fields.
    return {
        **_identity_fields(pid, profile),
        "available": True,
        "functional_position": entry.get("fp", ""),
        "pos_group": entry.get("pg", ""),
        "combine_coverage": entry.get("cc", False),
        # Sprint-3.12 — primary forecast (player-specific from 10c model).
        "individual_forecast": individual_forecast,
        # 5 Comp-Dimensionen (mixed top-5)
        "dimensions": {
            "style":      entry.get("style", []),
            "skill":      entry.get("skill", []),
            "physical":   entry.get("physical", []),
            "trajectory": entry.get("trajectory", []),
            "outcome":    entry.get("outcome", []),
        },
        # NBA-Only top-3 (Frontend default-view)
        "dimensions_nba": {
            "style":      entry.get("style_nba", []),
            "skill":      entry.get("skill_nba", []),
            "physical":   entry.get("physical_nba", []),
            "trajectory": entry.get("trajectory_nba", []),
        },
        # Sprint-3.7 Layer 3+4 forecasts + Sprint-3.8.C triangulation
        "cohort_forecast":       entry.get("cohort"),
        "cluster_forecast":      entry.get("cluster"),
        "triangulated_forecast": entry.get("forecast"),
        # Meta
        "meta": {
            "version": "v5_sprint_3.10",
            "calibration_verdict": "EXCELLENT (backtest MAE 0.78-3.40% across all 6 forecast types)",
            "methodology": "NBA-Profi Standard: 5 dims + Bayesian shrinkage + 95% CIs + Multi-Forecast Triangulation",
        },
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


# ═══════════════════════════════════════════════════════════
# Sprint-3.36: Static pre-computed responses (Render Free Tier OOM fix)
# ═══════════════════════════════════════════════════════════
# Wurzel: /api/board?n=200 verbrauchte ~30-40 MB Peak-Memory pro Request
# (zlib-decompress + JSON-Serialization). Bei concurrent requests → OOM-Loop.
# Lösung: export_board_static.py schreibt die Responses einmal pro Deploy in
# data/processed/static/. Endpoint serviert per FileResponse → ~0 MB Memory.
# Fallback auf SQL-Pfad wenn Static-File fehlt (defensive).
STATIC_DIR = Path(os.environ.get("DATA_DIR", "data/processed")) / "static"
# Muss mit export_board_static.BOARD_N übereinstimmen (Hot-Path-Default).
BOARD_N_STATIC = 200


def _serve_static_or_none(filename: str, response: Response, max_age: int = 600) -> Optional[FileResponse]:
    """Serviert eine Datei aus STATIC_DIR mit Cache-Control. Returns None falls
    die Datei fehlt — Caller fällt dann auf SQL-Pfad zurück (graceful)."""
    fpath = STATIC_DIR / filename
    if not fpath.exists():
        return None
    return FileResponse(
        fpath,
        media_type="application/json",
        headers={
            "Cache-Control": f"public, max-age={max_age}, stale-while-revalidate=3600",
            "X-Source": "static",  # Plus für Debugging: ist die Response pre-computed?
        },
    )


def _serve_static_gz_or_none(filename: str, response: Response, max_age: int = 600) -> Optional[FileResponse]:
    """Sprint-4.0: serviert pre-gzippte Datei mit Content-Encoding: gzip.
    Browser dekodiert transparent — wir sparen ~80% Bandbreite vs raw JSON,
    ohne uvicorn-CPU für on-the-fly-gzip zu kosten."""
    fpath = STATIC_DIR / f"{filename}.gz"
    if not fpath.exists():
        return None
    return FileResponse(
        fpath,
        media_type="application/json",
        headers={
            "Cache-Control": f"public, max-age={max_age}, stale-while-revalidate=3600",
            "Content-Encoding": "gzip",
            "X-Source": "static-gz",
        },
    )


@app.get("/api/outcome_comps/{slug}")
async def get_outcome_comps(slug: str, response: Response):
    """Sprint-5.4: per-prospect empirical comp pool for the Outcome-Curve KDE.
    Lazy-loaded by the frontend when a Player-page mounts the OutcomeDistributionCurve.
    Pre-computed by export_outcome_comps_static.py during build, served as a
    static file → zero DB hit, browser/edge cacheable per slug."""
    from name_utils import norm_name
    key = norm_name(slug)
    static = _serve_static_or_none(f"outcome_comps/{key}.json", response, max_age=600)
    if static:
        return static
    raise HTTPException(status_code=404, detail=f"outcome_comps for slug={slug!r} not found")

@app.get("/api/stats_lab")
async def get_stats_lab(response: Response):
    """Sprint-4.0: Static rows + columns for the Stats Lab page.
    ~2 MB gzipped, ~7.6k rows × ~100 cols. Cached aggressively client-side."""
    static = _serve_static_gz_or_none("stats_lab.json", response, max_age=600)
    if static:
        return static
    static = _serve_static_or_none("stats_lab.json", response, max_age=600)
    if static:
        return static
    raise HTTPException(status_code=503, detail="stats_lab.json not yet built — run export_stats_lab.py")


@app.get("/api/stats_lab/meta")
async def get_stats_lab_meta(response: Response):
    """Column definitions + filter ranges + presets for the Stats Lab."""
    static = _serve_static_or_none("stats_lab_meta.json", response, max_age=3600)
    if static:
        return static
    raise HTTPException(status_code=503, detail="stats_lab_meta.json not yet built")


@app.get("/api/model-card")
async def get_model_card(response: Response):
    """Sprint-5.12 Living Model Card: ehrliche OOT-Metriken, bei jedem Refresh
    von generate_model_card.py neu berechnet. Quelle für den Methods-Tab —
    die Doku kann dem deployten Modell damit nicht mehr hinterherhinken."""
    p = Path(os.environ.get("DATA_DIR", "data/processed")) / "api_model_card.json"
    if not p.exists():
        raise HTTPException(status_code=503, detail="model card not yet generated")
    response.headers["Cache-Control"] = "public, max-age=3600"
    return json.loads(p.read_text(encoding="utf-8"))


@app.get("/api/youth")
async def get_youth_radar(response: Response):
    """ANGT Youth Radar (Recruiting-Lens): U18-Turnier-Produktion, GP-gewichtet
    über Turniere aggregiert. Bewusst modellfrei (kein Tier, keine Added Wins) —
    gebaut von export_youth_radar.py, leer-aber-valide solange kein Youth-Scrape
    gelaufen ist."""
    p = Path(os.environ.get("DATA_DIR", "data/processed")) / "api_youth_radar.json"
    if not p.exists():
        raise HTTPException(status_code=503, detail="youth radar not yet built")
    response.headers["Cache-Control"] = "public, max-age=3600"
    return json.loads(p.read_text(encoding="utf-8"))


@app.get("/api/years")
async def get_years(response: Response):
    """Available draft years, sorted descending. Returns latest year for default view."""
    static = _serve_static_or_none("years.json", response, max_age=3600)
    if static:
        return static
    # Fallback: SQL-Pfad
    years = _get_years()
    response.headers["X-Source"] = "sql-fallback"
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

    Sprint-3.36: Wenn n==200 und position is None → serviert die statische
    Pre-Computed Datei (Memory <1MB). Sonst → SQL-Fallback (Filter-Edge-Case).
    """
    # Plus Static-Path nur für den Hot-Path (n=200, kein position-Filter).
    # Filter wie position=Wing sind selten und lohnen sich nicht zum Materialisieren.
    if n == BOARD_N_STATIC and position is None:
        filename = f"board_{year}.json" if year else "board_current.json"
        static = _serve_static_or_none(filename, response, max_age=600)
        if static:
            return static

    # SQL-Fallback (auch wenn static fehlt oder Filter aktiv ist)
    response.headers["Cache-Control"] = "public, max-age=600, stale-while-revalidate=3600"
    response.headers["X-Source"] = "sql-fallback"

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
    else:
        where.append("is_current_class=1")  # Sprint-5.7 D: default board = current draft class
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
                  "p_intl_top_eu", "p_intl_pro", "p_intl_fringe",
                  "injury_fallback_season", "display_season"):
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
