# Session Log 2026-06-15 — Sprint-3.22 bis 3.27

**Tag-Übersicht:** 6 Sub-Sprints in einer Session. Plus die methodische Linie:
Creation-Skill-v3 mit Translation + Draft-Pool-Anchor (3.22), Mind-Tab
Erweiterungen mit FT-Resilience (3.24) und Usage Reaction Strahl (3.25),
plus die Doku-Foundation MIND_FRAMEWORK.md (3.23). Plus zwei production-
Hotfixes (3.26 + 3.27) für Render-Build-Bugs die ich selbst eingeführt
hatte. Plus die heutigen Lessons sind methodisch + architekturell wertvoll
genug für eine eigene `INJECT_PATTERN.md` canonical reference.

---

## Tag-Schema Sprints

| Sprint | Titel | Wurzel-Wirkung | Status |
|--------|-------|---------------|--------|
| 3.22   | Creation Skill v3 (Translation + Draft-Pool-Anchor) | NCAA + intl vergleichbar, 50/75/85/95-Skala | ✓ live |
| 3.23   | MIND_FRAMEWORK.md Methodik-Doku (#16) | Canonical Reference, App-Link aktualisiert | ✓ live |
| 3.24   | FT-Resilience nach Adverse Event (#18) | 5. Mind-Metrik: bleibt Spieler an der Linie akkurat? | ✓ live |
| 3.25   | Usage Reaction Strahl (Scorer/Passer Slope) (#19) | per-Game Linear Regression, NBA-Pro-Diagnose | ✓ live (nach 3.27) |
| 3.26   | Render Empty-Board Hotfix (pid → player_id) | Build-stopper für inject_usage_reaction | ✓ deployed |
| 3.27   | Inject Streaming + Batch-Commit | OOM-safe Pattern für Render Free Tier 512MB | ✓ deployed |

---

## Sprint-3.22 — Creation Skill v3

### Wurzel-Problem
Plus Creation Pillar v2 (inline JS-Formel im Frontend) hatte zwei methodische
Lücken:
1. **Keine Translation** — raw `college_usg`, `AST_per`, ohne `league_strength_combined`
   → intl + NCAA Mid-Major + NCAA Power sind systematisch unterschiedlich
2. **Kein Anchor** — empirisch `composite / 25 × 100` → Top-15 2026er clustern
   auf 88-100, keine Diskrimination

### NBA-Stats-Pro Lösung (Tobias-Direktive: single number, backend complexity)
Drei Schichten **im Backend** (für den Nutzer unsichtbar):

```
L1 Translation:    USG_t = USG × league_strength_combined
                   AST_t = AST × league_strength_combined
                   → intl (Doncic) und NCAA (Boozer) direkt vergleichbar

L2 Composite:      Same v2 formula mit translated inputs:
                     scoring = (USG_t × TS / 100) × self_share
                     passing = AST_t × clamp(AST/TO, 0.5, 2.5) / 2.5
                   Position-weighted: PG 40/60, Wing 70/30, Big 80/20
                   Self-share fallback: PBP wenn da, sonst Box-Score
                     proxy USG / (USG + AST × pos_factor) für intl

L3 Anchor:         Position-stratified percentile rank vs Draft Pool
                   2008-2020 ∩ peak_pie known (n=644)
                   Skala: 50 avg / 75 solid / 85 All-Star / 95+ Star
```

### Verification Highlights
- **Cameron Boozer 99**, AJ Dybantsa 99, Jalen Haralson 99 (Wing pool max ~10.5 → alle über)
- **Wemby (intl) 95**, **Doncic (intl) 99** ← Translation funktioniert
- Trae Young 99 (historic comp Star)
- Ja Morant 83 (All-Star path)
- Brunson 73 (solid rotation)
- Anthony Davis 34 (methodisch korrekt: kein Creator-Big)

### Code-Artifacts
- `data-pipeline/scripts/13_compute_creation_skill_v3.py` (NEU)
- `data-pipeline/scripts/11_compress_for_deploy.py` — UNIFIED_FIELDS + slim_profile
- `frontend/src/App.jsx` — selfCreation reads `creation_skill_v3` priority

---

## Sprint-3.23 — MIND_FRAMEWORK.md Methodik-Doku (#16)

### Was vorlag (nicht offensichtlich)
Plus die MindTab war seit `v9 2026-06-03` schon reactivated mit Disclaimer.
Plus die "Research → Mind Framework" Link im Disclaimer zeigte aber auf nichts.
Plus #16 war eigentlich nur: **die Doku schreiben + Link aktualisieren**.

### Doku-Inhalt
- Was Mind misst (4 Resilience-Indizes + Pressure Splits + FT + Stamina)
- Streak-Definition v2 (3-of-4 adverse in 4-action window, cooldown adaptive)
- Sample-Size-Konventionen (5/25/200 thresholds)
- Sensitivity-Analyse (wider robust r≈0.95, looser fragil r≈0.4)
- **Historic NBA-Outcome Validation: |r| < 0.10 univariat** → Mind ist
  qualitative behavioural reference, NICHT predictor
- Decision-Frame (wann nutzen, wann nicht)
- 2025-26 Top-15 2026er Sample-Size-Status

### Wichtige methodische Aussage
> Mind ist KEIN Tier-Predictor. Plus die ist aus 10c und allen Outcome-
> Modellen EXPLIZIT auskommentiert. Plus die Aussage `|r| < 0.10` ist
> doku-festgeschrieben.

### Code-Artifacts
- `docs/MIND_FRAMEWORK.md` (NEU)
- `frontend/src/App.jsx` — Disclaimer-Link auf GitHub-MD

---

## Sprint-3.24 — FT-Resilience nach Adverse Event (Mind v2) (#18)

### Tobias' Hinweis vor dem Start
> "wir wollten noch die events kalibrieren, weil fehlwurf nicht so schlimm,
> wie to ist."

Plus das hat den Sprint methodisch tiefer gemacht: vor der FT-Resilience
brauchten wir eine data-driven Antwort auf die Event-Weight-Frage.

### Sub-Phase A — Event-Weight Estimation (data-driven)

Plus die naive Annahme: TOV > Missed > Foul (1.5 / 1.0 / 0.7). Plus die
empirische Analyse aus `analyze_event_weights.py` (Pool 2018-19, 1731
isolated single-event windows):

| Event | Drop Magnitude | Normalized Weight |
|-------|---------------|------|
| Missed FG | +42.77 eFG-pts | 1.000 |
| Turnover  | +39.72 eFG-pts | 0.929 |
| Foul against | +38.52 eFG-pts | 0.901 |

**Methodischer Befund:** Differenz <10% → keine signifikante Differenzierung.
Plus die naive TOV>Missed>Foul Hypothese ist data-driven FALSIFIZIERT. Plus
die existing Streak-Logik (alle Events gleich gewichtet) ist methodisch
UNTERSTÜTZT.

Plus die hohen absoluten Drops (~40 pts) sind ein Sample-Size-Artefakt des
4-Action Post-Windows (~1-2 FGA pro window). Plus die relativen Differenzen
sind das relevante Signal.

**Konsequenz:** Event-Weights bleiben implizit 1.0 — keine Streak-Logik-
Refactor nötig. Plus die Aussage ist in MIND_FRAMEWORK.md festgehalten.

### Sub-Phase B — FT-Resilience nach Streak

Plus die fünfte Resilience-Metrik beantwortet: bleibt der Spieler nach einem
Adverse-Event-Streak an der Linie akkurat?

```
ft_pct_base_streak  = FT% bei Trips in baseline (non-streak Phasen)
ft_pct_post_streak  = FT% bei Trips im post-streak Window
ft_resilience       = ft_pct_post_streak / ft_pct_base_streak
```

Plus FT-Trip-aggregiert (nicht einzelne FTs), weil 1-of-2 vs 2-of-2 anders
ist. Plus Sample-Size-Filter: min 5 FT-Trips in beiden baseline + post-streak.

### Implementation
- `scripts/pbp_mind_metrics_spike.py` — `compute_player_metrics` erweitert
- `pbp_mind_metrics_all.csv` — 2025-26 re-run mit FT-Resilience
- `backend/inject_mind_metrics.py` — `ft.resilience` sub-block

### Top-2026er Highlights
- **Nate Ament 1.21** (best: 80% post-streak vs 66% baseline)
- **Boozer 1.10** + Mark Mitchell 1.18 (improve under stress)
- **Mikel Brown 0.53** + **Braden Smith 0.57** (starke Drops → Film-Verification-Hinweis)
- Pool valid sample n=1207: median 0.94, p10=0.55, p90=1.36 (face-valid)

### Code-Artifacts
- `scripts/analyze_event_weights.py` (NEU)
- `scripts/pbp_mind_metrics_spike.py` (extended)
- `backend/inject_mind_metrics.py` (ft.resilience block)
- `frontend/src/App.jsx::MindTab` (new PressureCard "FT after Adverse Streak")
- `docs/MIND_FRAMEWORK.md` (FT-Resilience section + Event-Weight Befund)

---

## Sprint-3.25 — Usage Reaction Strahl (#19)

### Wurzel-Frage
Wie reagiert der Spieler bei erhöhter Usage? Plus skaliert er Scoring +
Passing oder dropt er ab?

### Methodik (per Spieler-Saison aus pbp_game_logs)
```
Filter:   n_games ≥ 10  AND  possessions/game ≥ 5  AND  USG-SD ≥ 1.0
Berechne: pts_per_poss + ast_per_poss pro Game
Linear Regression vs usg_proxy:
  Scorer-Slope = Δ(PTS/poss) / Δ(USG-pts)
  Passer-Slope = Δ(AST/poss) / Δ(USG-pts)
CI:       95% Wald-Intervall um die Slope-Schätzung
```

### Methodische Aussage
- **Scorer-Slope > +0.005** = scales scoring (+0.5 PTS/100 poss pro USG-pt)
- **Passer-Slope > +0.001** = scales playmaking (rare, hauptsächlich Top-PGs)
- **< 0** = drops/wird Shooter unter höherer Usage

### Pool Distribution (2025-26, n=1064)
```
scorer_slope  mean=+0.007  p10=-0.031  p50=+0.006  p90=+0.046
passer_slope  mean=-0.012  p10=-0.031  p50=-0.009  p90=+0.004
```
Plus die meisten Spieler werden unter höherer USG zum Shooter (negative
passer_slope median) — face-valid.

### Boozer's Strahl (live verifiziert)
- **Scorer Slope -0.017** (CI -0.049/+0.015, r²=0.12, p=0.33) → NICHT signifikant, Scoring-Effizienz STABIL über USG 13-35%
- **Passer Slope -0.011** (CI -0.017/-0.006, r²=0.65, p=0.005) → STATISTISCH SIGNIFIKANT: bei höherer USG klar weniger Distributor
- Plus die NBA-Aussage: "wird Primary Scorer, nicht Primary Playmaker"
- Plus matches Wing-Archetype + cffr_usage_role "Primary"

### Sample-Size-Caveats
Plus 2025-26 mid-season → 10-12 games pro Spieler typisch. Plus die UI zeigt
`directional · n=10` Badge wenn n_games < 15. Plus die Slopes sind r² 0.01-
0.30 typisch — direktional, nicht statistisch robust für die meisten.

### Code-Artifacts
- `data-pipeline/scripts/compute_usage_reaction.py` (NEU)
- `backend/inject_usage_reaction.py` (NEU, später als v2 in Sprint-3.27 ge-fixt)
- `backend/build.sh` — neuer Step `inject_usage_reaction.py`
- `frontend/src/App.jsx::MindTab` — Strahl-Card mit zwei Slope-Bars + CI-Band
- `docs/MIND_FRAMEWORK.md` — Sprint-3.25 section

---

## Sprint-3.26 — Render Empty-Board Hotfix (pid → player_id)

### Wurzel-Bug
Plus mein neuer `inject_usage_reaction.py` (Sprint-3.25) hatte:
```python
cur.execute("SELECT pid, data FROM profiles")          # FALSCH
cur.execute("UPDATE profiles SET data = ? WHERE pid = ?", ...)  # FALSCH
```

Plus die profiles-Tabelle hat in dieser Codebase die column `player_id`,
nicht `pid`. Plus alle anderen inject scripts nutzen `player_id` korrekt.

### Production Impact
Plus die Render-Build (`6622ca3`) crashed auf Step 8/15
(`inject_usage_reaction.py`). Plus `set -euo pipefail` stoppte die Pipeline.
Plus die 5 nachfolgenden inject steps (draft_risk, nba_role, added_wins,
shooting_m1, position_overrides) liefen nicht. Plus die `board`-Tabelle blieb
partially populated → `/api/board` returned 0 prospects → Frontend zeigte
"All Years Big Board · 0 prospects".

### Diagnose-Path
1. Tobias: "wir haben aber noch ein render problem"
2. Plus erstmal Render-OOM vermutet (war falsch — Architektur ist OK)
3. Plus Cold-Start vermutet (auch falsch)
4. Plus dann Frontend-Screenshot zeigte "0 prospects"
5. Plus Tobias paste der `/api/board?n=10` JSON → returned 10 historic Stars
   (Kevin Love, Wemby, etc.) — die OLD DB war noch live, neue Sprint-3.22-25
   Daten waren NICHT drin
6. Plus dann gefunden: `inject_usage_reaction.py` Line 119 + 144 hatte falsche
   column name

### Fix
- Replace `pid` → `player_id` in beiden SQL queries
- Commit `72f5e00` (Render zeigte als `72f5e80`)
- Push → Render rebuild ✓
- Big Board war zurück mit 100 Spielern (Flemings, Boozer, Wilson, Dybantsa, etc.)

### Lesson
> "Bei neuem inject script: ALWAYS copy einen existing inject als Template,
> nicht from scratch schreiben."

Plus die etablierten Patterns (PROJECTION_PATTERN.md von gestern, jetzt
INJECT_PATTERN.md von heute) sollen genau das verhindern.

---

## Sprint-3.27 — Inject Streaming + Batch-Commit (OOM-safe)

### Wurzel-Bug 2
Plus nach Sprint-3.26 ging Render-Build erfolgreich live (72f5e00 LIVE).
Plus Boozer's API JSON zeigte alle Sprint-3.22 + 3.24 Felder ✓. Plus
**`usageReaction` field fehlte komplett**.

### Diagnose
Plus build.sh inkludiert inject_usage_reaction.py + lief ohne Crash. Plus
die `set -euo pipefail` greift nicht → kein Build-Fail. Plus aber die DB
hat kein usageReaction.

**Vermutete Wurzel:** v1-Implementation nutzte `cur.fetchall()` → lädt alle
10k+ Profile-Blobs auf einmal in RAM. Plus auf Render Free Tier 512MB
führte das vermutlich zu silent OOM mid-loop, **BEVOR `conn.commit()` lief**.

Plus die Updates wurden in den write-cursor geschrieben, aber NIE committed,
weil der Process beim 5000sten Profile OOM-killed wurde. Plus Python's
SIGKILL durch den Kernel führt nicht zu non-zero exit auf dem build.sh
Level (oder die WAL wurde nicht aufgesammelt).

### v2-Architektur
```python
# Streaming cursor — kein fetchall
for row in read_conn.execute("SELECT player_id, data FROM profiles"):
    pid = row["player_id"]; data_blob = row["data"]
    # ... process, update ...
    write_conn.execute("UPDATE profiles SET data = ? WHERE player_id = ?", ...)
    if n_updated % BATCH_COMMIT == 0:
        write_conn.commit()   # Batch-commit alle 500
        print(f"  {n_seen}/{total} processed, {n_updated} updated (committed)")

write_conn.commit()   # final commit

# Self-Verify
n_with_field = verify_conn.execute(
    "SELECT COUNT(*) FROM profiles WHERE data LIKE ?", ('%"usageReaction"%',)
).fetchone()[0]
if n_with_field == 0 and n_updated > 0:
    sys.exit(1)   # Tell Render: this build failed
```

Plus separate read + write connections (vermeidet cursor-Konflikt). Plus
verbose Logging zeigt CSV-Pfad, n_loaded, n_dedupe, n_matched, n_updated,
verify-count. Plus die `exit 1` wenn updates reported aber nicht persistiert
→ Render zeigt Build failed → wir wissen es eindeutig.

### Verification
- Push `da44c7f` → Render rebuild ✓
- Plus Boozer API JSON nun mit voller `usageReaction` block:
  ```
  scorer_slope: -0.0169 (n.s., p=0.33)
  passer_slope: -0.0114 (p=0.005, signifikant)
  usg_range: mean 23.6, sd 6.8, min 13.3, max 35.2
  ```
- Plus Frontend Strahl-Card rendert.

### Memory-Pattern Konsistenz
Plus diese Implementation matched jetzt das Pattern aus:
- `build_db.py` Sprint-3.14 (chunked batching + streaming)
- `main.py::_SqliteProfilesDict.items()` (yield-streaming)

Plus alle drei nutzen die gleiche Memory-Disziplin für 512MB Free Tier.

---

## Lessons Gelernt (Tag-Aggregat)

### Methodik

1. **Naive Annahmen empirisch prüfen.** Plus die TOV>Missed>Foul Annahme war
   intuitive aber data-driven falsifiziert (0.93/1.00/0.90). Plus die existing
   "alle gleich gewichtet" Logik ist methodisch unterstützt.

2. **Translation vor Anchor.** Plus die Sprint-3.22 Drei-Schichten-Backend
   (Translation + Composite + Anchored Percentile) löst sauber die intl-vs-NCAA
   und Top-Tail-Compression-Probleme.

3. **Single number, backend complexity.** Plus die Tobias-Direktive für UI-
   Einfachheit + Methodik-Tiefe ist die richtige Architektur-Richtung.

4. **Mind ist KEIN Predictor.** Plus die |r| < 0.10 Aussage in MIND_FRAMEWORK.md
   ist canonical. Plus die Mind-Tab ist qualitative behavioural reference.

### Architektur

5. **`set -euo pipefail` greift nicht bei OOM.** Plus die SIGKILL durch den
   Kernel macht kein non-zero exit. Plus die Self-Verify-SELECT am Ende ist
   die ehrliche Antwort: zähle was wirklich persistiert wurde.

6. **Streaming statt fetchall überall.** Plus die 512MB Free Tier Disziplin
   ist eine etablierte Pattern in dieser Codebase. Plus jeder neue inject
   script MUSS sie folgen.

7. **Separate read + write connections** bei mid-iteration UPDATE — vermeidet
   Cursor-Locks + WAL-buildup.

8. **Build success ≠ Funktionalität.** Plus build.sh ist nur Pipeline-
   orchestration. Plus jeder Step braucht eigene Verification (Self-Verify
   SELECT nach Inject).

### Process

9. **Copy existing inject als Template.** Plus die `pid` vs `player_id`
   Bug hätte nie passieren dürfen wenn ich `inject_mind_metrics.py` als
   Template kopiert hätte. Plus die etablierten Konventionen kommen dann
   automatisch.

10. **Test im Browser (echte JSON) statt nur lokal.** Plus die API JSON
    paste war der echte Diagnose-Wendepunkt. Plus die "0 prospects" UI war
    ein Sekundär-Symptom.

---

## Deployed Architektur nach Tag

### ScoutingTab (Skill Pillars — current ability)
- Defense, Feel, Shooting, Athletic
- **Creation = Sprint-3.22 v3** (Translation + Draft-Pool-Anchor, 0-100)

### ProjectionTab (NBA Outcomes — calibrated probabilities)
- Tier Probabilities
- Role Projections:
  - Star+ Creator (Sprint-3.17)
  - Elite Shooter (Sprint-3.18)
  - All-Defensive (Sprint-3.19)

### MindTab (Behavioural patterns — NOT predictive)
- Self-Sufficiency Profile (4 Stufen)
- Pressure Splits: Clutch / Clutch-WP / Late-Clock / Clutch-FT
- **+ FT after Adverse Streak (Sprint-3.24)** ← NEU
- **+ Usage Reaction Strahl (Sprint-3.25 + 3.27 fix)** ← NEU
- Zone-Breakdown
- Verdict — Self-Sufficiency
- Mental Resilience (4 Adverse-Event-Indizes)
- Match-Phase Drift (Stamina + Hothead Drift)

### Backend Inject Pipeline (15 Steps, alle streaming-safe)
```
1.  pip install
2.  build_db.py (chunked batching, streaming load)
3.  inject_shot_creation_spectrum.py
4.  inject_leverage_efficiency.py
5.  inject_skill_curve.py
6.  inject_ogbpm.py
7.  inject_mind_metrics.py (mit FT-Resilience, Sprint-3.24)
8.  inject_season_advanced.py
9.  inject_game_logs.py
10. inject_usage_reaction.py (NEU, streaming + batch-commit, Sprint-3.25/3.27)
11. inject_draft_risk.py
12. inject_nba_role.py
13. inject_added_wins.py
14. inject_shooting_m1.py
15. inject_position_overrides.py
```

---

## Backlog State

### Completed today
- ✓ #16 Mind-Tab reactivate + Disclaimer + Research-Framework
- ✓ #18 FT-Integration in Aggressor-Index (als FT-Resilience)
- ✓ #19 Usage Reaction Strahl

### Still pending
- #20 Body Anthro Tier-Medians neu kalibrieren
- #21 Game-by-Game Skill Curve mit BartTorvik-Vollsaison
- #22 Development Tab Trajectory mit Validation
- #25 NetPV v2
- #61 Blueprint-Migration render.yaml
- #70 Steal-Probability via draft_risk_model
- #106 Sprint-3.17.E peak_pie 10c upstream fix

### Neu im Backlog
- **Multi-Season Mind Aggregation** — statt single-season snapshot, kombiniere
  2024-25 + 2025-26 für mehr Statistical Power bei Slopes (n_games 10 → 30+)
- **Multi-Season Usage Reaction** — same reason, robustere Slopes
- **Mind-Metrics für historic Pool 2008-2024** — currently nur 2025-26 hat
  FT-Resilience. Plus alle anderen Saisons brauchen Re-Run der spike-Pipeline
  (~5 min × 19 Saisons = ~1.5h) wenn historic comparability gewünscht

---

## Code-Artifacts heute (chronologisch)

| File | Sprint | Wirkung |
|------|--------|---------|
| `data-pipeline/scripts/13_compute_creation_skill_v3.py` | 3.22 | Translation + Anchored Percentile |
| `data-pipeline/scripts/11_compress_for_deploy.py` | 3.22 | UNIFIED_FIELDS + slim_profile |
| `frontend/src/App.jsx` (multiple) | 3.22 + 3.24 + 3.25 | UI für alle drei Pillars |
| `docs/MIND_FRAMEWORK.md` | 3.23 + 3.24 + 3.25 | Canonical Mind reference |
| `data-pipeline/scripts/analyze_event_weights.py` | 3.24 | Data-driven Weight estimation |
| `data-pipeline/scripts/pbp_mind_metrics_spike.py` | 3.24 | FT-Resilience compute |
| `backend/inject_mind_metrics.py` | 3.24 | ft.resilience sub-block |
| `data-pipeline/scripts/compute_usage_reaction.py` | 3.25 | Slope estimation per game |
| `backend/inject_usage_reaction.py` | 3.25 + 3.26 + 3.27 | usageReaction inject (3 Iterationen) |
| `backend/build.sh` | 3.25 | 15-step pipeline (was 14) |
| `docs/INJECT_PATTERN.md` | 3.27 | NEU — canonical inject-script pattern |
| `docs/SESSION_LOG_2026-06-15_SPRINT_3_22_TO_3_27.md` | — | dieser doc |

---

*Session 2026-06-15. 6 Sprints, 2 production-Hotfixes, 5 deployed Features,*
*3 doc-files, alle methodisch verifiziert. Plus die Lessons-Aggregat ist*
*architekturell wertvoll genug für `INJECT_PATTERN.md` als Permanent-Reference.*
