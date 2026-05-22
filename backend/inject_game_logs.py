#!/usr/bin/env python3
"""
inject_game_logs.py — Per-Game Stats in API-Profile einspeisen
================================================================
Liest pbp_game_logs_*.csv (eine pro Saison) und schreibt pro Spieler die
Liste seiner Games als compactes Array in profile.gameLogs.

Felder pro Game (kompakt für DB-Größe):
  d  = date (YYYY-MM-DD)
  o  = opponent
  h  = is_home (0/1)
  p  = pts
  a  = ast
  fa = fga
  fm = fgm
  ta = tpa
  tm = tpm
  rb = total reb (oreb+dreb)
  to = tov
  s  = stl
  b  = blk
  pf = personal fouls
  u  = usg_proxy (% of team possessions)
  o2 = ortg_proxy (individual offensive rating)
  e  = efg_pct

Usage: gameLogs[].forEach in Scouting/Development tabs.

Tobias 2026-05-09: pragmatic in-game development data.
"""
from __future__ import annotations
import sqlite3, zlib, json, sys, re, unicodedata, glob
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "processed" / "prospecttheory.db"

# Source dirs (look in both pipeline + backend locations)
CSV_GLOBS = [
    BASE / "data" / "processed" / "pbp_game_logs_*.csv",
    BASE.parent.parent / "data-pipeline" / "data" / "processed" / "pbp_game_logs_*.csv",
]

SUFFIX_RX = re.compile(r"\s+(jr\.?|sr\.?|i+v?|ii+)\.?\s*$", re.IGNORECASE)

def norm_name(s):
    if not isinstance(s, str): return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace(".", "").replace("'", "").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = SUFFIX_RX.sub("", s).strip()
    return s

def safe_int(v):
    try:
        return int(v) if pd.notna(v) else 0
    except (TypeError, ValueError):
        return 0

def safe_round(v, d=1):
    try:
        if v is None or pd.isna(v): return None
        return round(float(v), d)
    except (TypeError, ValueError):
        return None


def main():
    # Collect all available game-log CSVs — dedupe by FILENAME (basename),
    # not full path, so we don't load the same season twice if it lives in both
    # backend/ and data-pipeline/.
    seen_basenames = {}
    for pattern in CSV_GLOBS:
        for path in sorted(glob.glob(str(pattern))):
            basename = Path(path).name
            if basename not in seen_basenames:
                seen_basenames[basename] = path
    all_csvs = sorted(seen_basenames.values())
    if not all_csvs:
        sys.exit("ERROR: No pbp_game_logs_*.csv found in any expected location")
    print(f"Loading {len(all_csvs)} game-log CSVs:")

    # ── Pre-load DB profile-names FIRST → only process players we actually have ──
    if not DB.exists():
        sys.exit(f"ERROR: DB not found at {DB}")
    conn = sqlite3.connect(DB)
    name_by_pid = dict(conn.execute("SELECT player_id, name FROM profiles").fetchall())
    db_nnames = {norm_name(n) for n in name_by_pid.values()}
    print(f"\n  DB profile names: {len(db_nnames):,} unique normalized")

    # Streaming-load + filter ON-THE-FLY — avoid loading 700k rows into RAM
    print(f"\n  Loading + filtering CSVs against DB-names...")
    dfs = []
    for c in all_csvs:
        season = Path(c).stem.replace("pbp_game_logs_", "")
        d = pd.read_csv(c, low_memory=False)
        d["season"] = season
        d["_nname"] = d["player_name"].astype(str).apply(norm_name)
        # Pre-filter: only rows for players we have in DB
        d = d[d["_nname"].isin(db_nnames)]
        if len(d) > 0:
            dfs.append(d)
        print(f"  {season}: {len(d):>6,} rows after DB-filter")
    if not dfs:
        sys.exit("No matching player rows after filter")
    master = pd.concat(dfs, ignore_index=True)
    print(f"  Filtered master: {len(master):,} rows · {master['_nname'].nunique():,} unique players")

    # Sort + dedupe duplicate (player, game_id) rows that occasionally appear
    # in raw PBP (Tobias 2026-05-09 — Flagg had 2 dups in NCAA tournament games).
    master = master.sort_values(["_nname", "season", "date"])
    master = master.drop_duplicates(subset=["_nname", "season", "game_id"], keep="first")
    print(f"  After dedupe: {len(master):,} rows")
    # For each player: take rows from their latest season only
    latest_season = master.groupby("_nname", as_index=False)["season"].last()
    latest_season.columns = ["_nname", "_latest_season"]
    master = master.merge(latest_season, on="_nname")
    master = master[master["season"] == master["_latest_season"]]
    print(f"  After latest-season filter: {len(master):,} rows · {master['_nname'].nunique():,} players")

    # Vectorized field extraction — much faster than iterrows
    print(f"\n  Building compact records (vectorized)...")
    # Bulk-cast numeric columns with safe defaults
    for col, default in [("pts",0),("ast",0),("fga",0),("fgm",0),("tpa",0),("tpm",0),
                          ("fta",0),("ftm",0),  # Backlog 3.1: fta für per-Game TS%
                          ("oreb",0),("dreb",0),("tov",0),("stl",0),("blk",0),("pf",0)]:
        master[col] = pd.to_numeric(master[col], errors="coerce").fillna(default).astype(int)
    for col in ["usg_proxy", "ortg_proxy", "efg_pct"]:
        master[col] = pd.to_numeric(master[col], errors="coerce")
    master["is_home"] = master["is_home"].fillna(False).astype(bool)
    master["date"] = master["date"].astype(str)
    master["opponent"] = master["opponent"].fillna("").astype(str)

    # ── Backlog 3.2: Gegner-Stärke pro Spiel (für Skill-Curve-Färbung) ──
    # Problem: ESPN-Gegnernamen matchen BartTorvik-Teamnamen nur ~40% direkt.
    # Lösung (Spieler-Brücke): derselbe Spieler hat in den Game-Logs einen
    # ESPN-Teamnamen UND in BartTorvik einen BT-Teamnamen → daraus ESPN→BT-Map.
    # Team-Stärke = net = adjoe − adrtg (BartTorvik), Tier per globalem Tertil.
    # → ~98% der Game-Rows bekommen so ein Gegner-Rating ("T"/"M"/"L", sonst None).
    master["os"] = None
    try:
        _bt_csv = BASE / "data" / "raw" / "barttorvik_complete_final.csv"
        if _bt_csv.exists():
            _bt = pd.read_csv(_bt_csv, low_memory=False,
                              usecols=["player_name", "team", "season_year", "adjoe", "adrtg"])
            _bt["season_year"] = pd.to_numeric(_bt["season_year"], errors="coerce")
            _bt["_net"] = (pd.to_numeric(_bt["adjoe"], errors="coerce")
                           - pd.to_numeric(_bt["adrtg"], errors="coerce"))
            _bt["_pn"] = _bt["player_name"].astype(str).apply(norm_name)
            # season "2024-25" → season_year 2025 (BartTorvik nutzt das End-Jahr)
            master["_sy"] = master["_latest_season"].astype(str).str.slice(0, 4).apply(
                lambda x: int(x) + 1 if x.isdigit() else None)
            # Team-Rating je (BT-team, season_year)
            _tr = (_bt.dropna(subset=["_net", "team"])
                      .groupby(["team", "season_year"], as_index=False)["_net"].mean())
            _lo, _hi = _tr["_net"].quantile(0.34), _tr["_net"].quantile(0.67)
            # Spieler → häufigster BT-team (je _pn + season_year)
            _p2bt = (_bt.dropna(subset=["team"])
                        .groupby(["_pn", "season_year"], as_index=False)["team"]
                        .agg(lambda s: s.value_counts().index[0])
                        .rename(columns={"team": "_bt_team"}))
            # ESPN-team → BT-team Brücke (über Spieler im master)
            _mm = master[["_nname", "_sy", "team"]].merge(
                _p2bt, left_on=["_nname", "_sy"], right_on=["_pn", "season_year"], how="left")
            _bridge = (_mm.dropna(subset=["_bt_team"])
                          .groupby("team")["_bt_team"].agg(lambda s: s.value_counts().index[0]))
            # opponent (ESPN) → BT-team → net-Rating
            master["_opp_bt"] = master["opponent"].map(_bridge)
            master = master.merge(
                _tr.rename(columns={"team": "_opp_bt", "_net": "_opp_net", "season_year": "_sy"}),
                on=["_opp_bt", "_sy"], how="left")
            _net = master["_opp_net"]
            _os = pd.Series(None, index=master.index, dtype=object)
            _os[_net.notna()] = "M"
            _os[_net >= _hi] = "T"
            _os[_net <= _lo] = "L"
            master["os"] = _os
            print(f"  Opponent-strength (3.2): {master['os'].notna().mean()*100:.0f}% of game-rows "
                  f"tiered ({len(_bridge):,} ESPN→BT teams bridged)")
    except Exception as _e:
        print(f"  ⚠ Opponent-strength enrichment skipped: {_e}")

    by_player = {}
    for nname, sub in master.groupby("_nname"):
        season = sub["_latest_season"].iloc[0]
        # Build games list via to_dict('records') — much faster than iterrows
        games = []
        for r in sub.itertuples(index=False):
            games.append({
                "d":  r.date,
                "o":  r.opponent,
                "h":  1 if r.is_home else 0,
                "p":  int(r.pts), "a": int(r.ast),
                "fa": int(r.fga), "fm": int(r.fgm),
                "ta": int(r.tpa), "tm": int(r.tpm),
                "rb": int(r.oreb) + int(r.dreb),
                "to": int(r.tov), "s": int(r.stl), "b": int(r.blk), "pf": int(r.pf),
                "u":  None if pd.isna(r.usg_proxy)  else round(float(r.usg_proxy), 1),
                "o2": None if pd.isna(r.ortg_proxy) else round(float(r.ortg_proxy), 0),
                "e":  None if pd.isna(r.efg_pct)    else round(float(r.efg_pct), 1),
                # Backlog 3.1: TS% per Game (FT-aware) = PTS / (2·(FGA + 0.44·FTA)).
                # fta/ftm sind in der Quell-CSV vorhanden, fehlten nur im kompakten Objekt.
                "ts": (lambda _ts: None if _ts is None else round(_ts, 1))(
                    (float(r.pts) / (2.0 * (float(r.fga) + 0.44 * float(r.fta))) * 100.0)
                    if (not pd.isna(r.fga)) and (not pd.isna(r.fta)) and (float(r.fga) + 0.44 * float(r.fta)) > 0
                    else None),
                # Backlog 3.2: Opponent-Stärke-Tier ("T"=stark, "M"=mittel, "L"=schwach, None=unbekannt)
                "os": (r.os if isinstance(r.os, str) else None),
            })
        if games:
            by_player[nname] = {"season": season, "games": games}
    print(f"  Compact records: {len(by_player):,} players")

    # Inject into DB profiles (conn already open from earlier name-fetch)
    profiles = conn.execute("SELECT player_id, name, data FROM profiles").fetchall()
    print(f"\n  DB profiles to scan: {len(profiles):,}")

    matched = 0
    update_rows = []
    for player_id, name, blob in profiles:
        nn = norm_name(name)
        rec = by_player.get(nn)
        if not rec:
            continue
        try:
            obj = json.loads(zlib.decompress(blob).decode("utf-8"))
        except Exception:
            continue
        obj["gameLogs"] = rec
        new_blob = zlib.compress(json.dumps(obj, separators=(",", ":")).encode("utf-8"), level=9)
        update_rows.append((new_blob, player_id))
        matched += 1

    print(f"  Matched: {matched:,} / {len(profiles):,} ({100*matched/len(profiles):.1f}%)")
    print(f"\nWriting {len(update_rows):,} updates...")
    conn.execute("BEGIN TRANSACTION")
    try:
        conn.executemany("UPDATE profiles SET data=? WHERE player_id=?", update_rows)
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"ERROR: {e}")
    print(f"✅ {matched:,} profiles updated")

    # Verification
    print(f"\nVerification:")
    for name in ["Cooper Flagg", "Dylan Harper", "VJ Edgecombe", "Tre Johnson", "Ace Bailey"]:
        r = conn.execute(
            "SELECT data FROM profiles WHERE LOWER(name)=LOWER(?) LIMIT 1", (name,)
        ).fetchone()
        if not r: continue
        obj = json.loads(zlib.decompress(r[0]).decode("utf-8"))
        gl = obj.get("gameLogs")
        if not gl: print(f"  {name}: no gameLogs"); continue
        games = gl["games"]
        print(f"  {name:<22} season={gl['season']}  games={len(games)}  "
              f"PPG={sum(g['p'] for g in games)/len(games):.1f}  "
              f"avgUSG={sum((g['u'] or 0) for g in games)/len(games):.1f}%")
    conn.close()


if __name__ == "__main__":
    main()
