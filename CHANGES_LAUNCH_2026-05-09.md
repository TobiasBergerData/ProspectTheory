# Pre-Launch Changes — 2026-05-09 (Sunday Launch)

## Übersicht

Dieser Pass behebt eine Reihe von Daten-Konsistenz-Bugs und Modell-Kalibrierungs-Issues, die vor dem Sonntag-Launch von prospecttheory.io aufgefallen sind. Alle Änderungen sind Frontend-only mit einer Ausnahme (eine Zeile in `backend/main.py`).

**Files geändert:**
- `prospecttheory-web/frontend/src/App.jsx` (alle UI/Logik-Änderungen)
- `prospecttheory-web/backend/main.py` (1 Zeile: `peak_pie` in `/comps/stats` ergänzt)

**Build-Status:** clean, 646 modules transformed, 820 KB JS bundle, 242 KB gzipped.

---

## 1. Tier-Kalibrierung (Modell-Output → User-Wahrnehmung)

### Problem
Das Backend liefert Modal-Tier-Labels — die Tier-Klasse mit höchster Einzel-Wahrscheinlichkeit. Für Pre-Draft-Prospects führt das zu strukturellem Pessimismus: 2026 hatte vor dem Fix nur 3 Starter und 0 All-Stars im Big Board.

### Lösung — `recalibrateTier()`
Kumulative Schwellen-basierte Tier-Zuweisung mit zwei separaten Pfaden (Tobias 2026-05-09).

**Wertvolle-NBA-Pfad** (rotation+ tiers, ohne Replacement):
```
Superstar:    P(S) ≥ 12%
All-Star:     P(S+A) ≥ 18%
Starter:      P(S+A+St) ≥ 26%
Role Player:  P(S+A+St+R) ≥ 38%
```

**Replacement-Pfad** (separates Gate, falls keine "wertvolle" Schwelle erreicht):
```
Replacement:  pRp ≥ 30% ODER P(NBA total) ≥ 45%
Negative:     Rest
```

### Validierung gegen historische Realität
Per-Klasse durchschnittliche realisierte NBA-Outcomes (peak_pie ≥30/18/10/5 Schwellen) für NCAA 2010-2018:
- 2.3 All-Star Karrieren / Klasse
- 3.9 Starter / Klasse
- 5.1 Role Player / Klasse
- 6.3 Replacement / Klasse
- ~17 NBA-Outcomes total / Klasse

Modell-Output 2026 nach Recalibrierung:
- 0 Superstar
- 1 All-Star (Cam Boozer)
- 13 Starter (Top-14 — Boozer, Flemings, Wilson, Wagler, Peterson, Dybantsa, Acuff, Ament, Mullins, Burries, Lendeborg, Philon, Szumert, Steinbach)
- ~61 Role Player
- Rest Replacement / Out

---

## 2. Position-Klassifikation

### Problem
- `resolvePosition()` liest `d.pos` (Backend-Pipeline-Output) bevor Height-Floor-Override greift → Westbrook (75") wurde als "Wing" gelabelt statt Playmaker.
- Tarris Reed Jr. (82", 3PAr=1.2%, BLK%=8.4) wurde als Wing gelabelt obwohl er klar Big ist.
- Allen Graves (33% 3PAr, 40% 3P%) wurde als Big gelabelt obwohl Stats Wing-Profil zeigen.

### Lösung — Mehrere Override-Schichten in `resolvePosition()`

**Ball-Handler-Detection (relaxed 2026-05-09 v2):**
```
ht <  79: astP > 22 + usg ≥ 22  →  Playmaker  (Curry, Westbrook, Wagler, Holiday)
ht <  79: astP > 28              →  Playmaker  (assist-pure combo guards)
ht <  81: astP ≥ 20 + usg ≥ 26  →  Playmaker  (Cade Cunningham, tall lead PGs)
any:      astP > 30              →  Playmaker  (point forwards)
```

Vorher war `astP > 25` als Mindestschwelle — verfehlte Wagler 23.2, Cade 20.2, Holiday 23.8.

**Big-Override (NEU):** `ht ≥ 81 && tpFreq < 8 && (blkP > 4 || orbP > 11) → Big` — fängt Centers wie Tarris Reed.

**Stretch-Wing-Override:** `79-82" mit Shooting → Wing` — unverändert.

**Height-Floor (NEU, vor existing-pos):** `ht ≤ 75 → Playmaker` — fängt Westbrook/Okorie/Jrue Holiday vom Backend-Pos-Mislabel.

**Existing-pos check + Height-fallback:** unverändert.

### Kaskadeneffekte der Position-Korrektur (2026-05-09 v3)

**Was UNVERÄNDERT bleibt** (alles aus ML-Modell-Output):
- Tier-Wahrscheinlichkeiten (P(Sup), P(All-Star), etc.)
- ppWA, War, BPM, alle Box-Score-Stats
- Range Floor/Median/Ceiling

**Was sich ÄNDERT** (UI-side, basierend auf Pos):
- NCAA Archetype (positions-spezifisch berechnet) — sinnvolle Anpassung: Westbrook → Combo Guard, Cade → Ball Dominant Scorer
- NBA-Projection (basiert auf NCAA-Archetype × Tier) — z.B. Westbrook "Versatile Starter" → "Star Guard"
- Pipeline-Archetype-Filter (Pos-Allowlist)
- vs.NBA-Tier-Vergleichs-Schwellen

**Smart Archetype-Fallback (NCAA_TO_PIPELINE_ARCH map):**
Wenn Pipeline-Archetypes alle gefiltert werden (z.B. Westbrook nur Wing-Archetypes obwohl jetzt Playmaker), leite aus computed `_ncaaArch` einen passenden Pipeline-Archetype ab. Statt "Non-Specialized Playmaker" als generischer Fallback bekommt Westbrook jetzt "Scoring Playmaker" (matcht Combo Guard NCAA-Archetype).

**Combo-Guard-Schwelle gesenkt:** `pos=G && usg≥18 && astP≥20` (vorher usg≥22). Fängt defensive Combo-Guards wie Jrue Holiday (usg=20.5 im UCLA-System) korrekt ein.

**Resultat 6 Player nach allen Fixes:**
| Spieler | Pos | NCAA Arch | NBA Projection |
|---|---|---|---|
| Westbrook | Playmaker | Combo Guard | Star Guard |
| Wagler | Playmaker | Combo Guard | Starting Guard |
| Okorie | Playmaker | Ball Dominant Scorer | Scoring Role Player |
| Holiday | Playmaker | Combo Guard | Starting Guard |
| Cade | Playmaker | Ball Dominant Scorer | Secondary Creator |
| Haggerty | Playmaker | Ball Dominant Scorer | Scoring Role Player |

### Skala-Bug-Fix
NCAA `three_f` ist 0-100 (Boozer=26.4), Intl `three_f` ist 0-1 (Doncic=0.5). Vorher wurde naive 0-1-Detection gemacht (Bidunga `three_f=0.6` wurde als 60% interpretiert statt 0.6%). Jetzt nach `source` disambiguiert.

---

## 3. Archetype-Filter

### Problem
Pipeline emittiert bis zu 7 Archetype-Matches ohne Pos-Konsistenz:
- Caleb Wilson (Wing) bekam "Stretch Big | Passing Hub | Glass Cleaner"
- Allen Graves (Big) bekam "Scoring Wing | 3-and-D Wing | Point Forward"

### Lösung — `filterArchetypesByPos()`
- Pos-Allowlist je Archetype (z.B. "Scoring Wing" nur für Wing-Pos).
- **Tall-Wing-Exception:** Wings ≥81" dürfen Stretch-4-Archetypes (Stretch Big, Glass Cleaner, Scoring Big, Short Roll Playmaker) — matcht NBA-Realität (Tatum, Markkanen).
- **Fallback:** wenn alle gefiltert wurden, emittiere Pos-konformen Default ("Non-Specialized Wing" etc.) statt falsches Label.

### Im Header gecappt auf 3 Archetypes (vorher zeigte sich bis zu 7).

---

## 4. NBA-Projection (NCAA Archetype × Tier)

### Problem
`projectNbaArchetype()` nutzte das Backend-Modal-Tier statt das recalibrierte Tier:
- Steinbach predTier = "Starter" (recalibriert), aber Backend modal = "Replacement"
- → NBA-Projection war "Camp Invite" (Index 1 für Replacement) statt "Starting Stretch Big"

### Lösung
`mapProfile()` berechnet `_recalTier = recalibrateTier(_tiersForCF, ...)` und übergibt das an `projectNbaArchetype`.

### Resultat-Diversifizierung Top-15:
- Boozer: Primary Creator
- Flemings, Acuff Jr.: Starting Playmaker
- Wilson, Peterson, Dybantsa, Ament, Philon: Secondary Creator
- Wagler, Mullins, Burries, Lendeborg, Szumert: 3-and-D Starter
- Steinbach: Starting Stretch Big

---

## 5. Badge-Filter Fixes

### Floor General — Null-AstTov-Bypass
Server-Filter: `_astTov == null || _astTov > 1.8` → wenn AST/TO fehlt, passierte Badge durch.
Boozer hatte astTov=1.74 (aus ast_p/to_p berechnet) und bekam fälschlich Floor General.
**Fix:** explizit `_astTov != null && _astTov > 2.0` — keine null-Bypässe mehr für Passer-Badges.

### Passive Driver — Intl-Skala-Bug
Intl-Spieler haben `ftr` als Ratio (Doncic 0.56 = 56%), NCAA als Prozent (38.6 = 38.6%). Badge-Filter `ftr < 20 && usg > 20` triggerte für Doncic (0.56 < 20 ✓) → falsche Red-Flag.
Auch betroffen: Wembanyama (0.39), Sengun (0.56), alle anderen Intl-Stars.
**Fix:** `tmpP.ftr` wird auf %-Skala normalisiert — `n > 0 && n < 2 ? n * 100 : n`.

### TS%/eFG%/2P% Backfill für historische und Intl-Spieler
Pre-2017 NCAA und Intl-Pipeline speichern keine `ts_pct`/`efg_pct`/`two_pct`. Folge: Westbrook, Sabonis, Doncic, Karim Lopez bekamen 0 Badges die ts/efg brauchen.
**Fix:** Box-Score-Identitäten im Frontend ableiten:
```
2P% = (FG% − 3P% × r) / (1 − r)        mit r = 3PA/FGA
eFG% = FG% + 0.5 × 3P% × r
TS% = (2 × eFG% + FT% × ftr) / (2 × (1 + 0.44 × ftr))
```
Sowohl in `tmpP` (für Badges) als auch im Final-Profile (für UI-Anzeige).

---

## 6. Display-Tier aus peak_pie (Comps + actual NBA outcome)

### Problem
Backend-`tier`-Feld nutzt strikte peak_pie-Schwellen → Tatum (peak_pie=52) wurde als "Starter", Brunson (32) als "Roleplayer", Trae Young (32) als "Starter" gelabelt. Diese realen All-Stars wurden in Comps falsch dargestellt → Modell wirkt als hätte es "falsche" Trainings-Labels gelernt.

### Lösung — `tierFromPeakPie()`
Wohlwollendere public-perception Schwellen für Display:
```
peak_pie ≥ 40 → Superstar  (Curry 58, Tatum 52, Embiid 51, AD 43, Lillard 43)
peak_pie ≥ 25 → All-Star   (KAT 37, Mitchell 35, Booker 33, Brunson/Trae 32, Brown 31)
peak_pie ≥ 15 → Starter    (A. Gordon 24, M. Bridges 23, Markkanen 20, Rob Williams 18)
peak_pie ≥  8 → Role Player
peak_pie ≥  3 → Replacement
sonst         → Out
```

**Wichtig:** ändert nur Display-Labels, NICHT Modell-Trainings-Daten oder `prob_*` Felder.

### Anwendung
- `actual` in `mapProfile`: `tierFromPeakPie(d.peak_pie)` mit Backend-Tier als Fallback.
- Comps in `statComps`: gleiche Override.
- Backend `/comps/stats` ergänzt um `peak_pie` (1-Zeilen-Change in `main.py`).

---

## 7. "Actual NBA Outcome" für 2026er Spieler

### Problem
`mapProfile`: `actual: d.tier` — aber `d.tier` = Backend modal-tier (predicted), auch für 2026er Spieler die noch nicht gedraftet sind. → Boozer-Profil zeigte "Actual NBA Outcome: Starter" obwohl er noch nicht gespielt hat.

### Lösung
Gate-Bedingung: `d.made_nba === true || d.peak_pie != null || d.nba_peak_actual != null`. Pre-Draft-Spieler haben `made_nba=False` und `peak_pie=None` → kein "Actual NBA Outcome" mehr angezeigt.

---

## 8. Class Rank im Header

### Problem
Backend liefert `classRank=null` für alle Spieler.

### Lösung — Frontend-Computing in `installPlayers()`
Nach Board-Fetch werden Spieler nach `draftYear` gruppiert und nach `ppwa → war → ups` sortiert. Rank wird ins `PLAYERS`-Lookup geschrieben.
Board-Fetch erhöht von `n=200` auf `n=500` damit per-Klasse-Kohorte vollständig ist.
Header zeigt jetzt `#1 MODEL`, `#2 MODEL`, etc. Badge.

---

## 9. Age on Draft Day

### Problem
Pipeline `compute_age()` referenziert Feb 1 des season_year — der echte Draft ist ~25. Juni. Differenz: 144 Tage = 0.39 Jahre. Boozer wurde mit 18.5 angezeigt statt 18.9.

### Lösung — `ageOnDraftDay()` Helper
Frontend-Display-Override mit Konstante 0.39. Anwendung an drei Display-Stellen (Header, Big Board Tabelle, Key Facts). Modell-interne Logik bleibt auf `p.age` (raw Feb-1-Alter), weil v2-Modell auf dieser Skala kalibriert ist.

**Post-Launch TODO:** Pipeline `compute_age()` ref_date auf Draft Day umstellen → eliminiert Frontend-Patch.

---

## 10. Tier-Probabilities-Konsistenz (Player Page)

### Problem
- Tier-Header zeigt "All-Star" (kumulativ recalibriert)
- Bar-Chart darunter zeigt Bin-Probabilities — höchster Balken ist Starter (51%), All-Star nur 21%
- User-Wahrnehmung: "warum All-Star wenn Starter dominant?"

### Lösung
**Subtitle unter Tier-Label:** zeigt kumulative Wahrscheinlichkeit `P(All-Star+) = 24%`.
**Bar-Chart-Highlight:** weiße Outline um den Tier-Balken der zugewiesen wurde.
**Caption:** "White outline = assigned tier (cumulative-threshold). Highest bar = modal outcome (most likely single tier)."
**Tooltip auf Tier-Label:** erklärt alle Schwellen plus die kumulativen Wahrscheinlichkeiten.

---

## 11. Big Board ppWA-Farbe

### Problem
ppWA-Spalten-Farbe basierte auf festen War-Schwellen (≥47 Superstar, ≥33 AllStar...). Tier-Spalten-Farbe basiert auf recalibrateTier-Output. Boozer war=25 → ppWA blau (Starter), Tier-Spalte orange (All-Star) → visuell inkonsistent.

### Lösung
ppWA-Farbe wird direkt aus `TC[p.predTier]` gezogen — matcht jetzt die Tier-Spalte 1:1.

---

## 12. Internationale Daten — Doncic 2P% / Karim Lopez

### Problem
Intl-Pipeline (`05c_process_international.py`) speichert keine `two_pct`, `efg_pct`, `ts_pct`. 0 von 316 2025+ Intl-Profilen hatten diese Werte. Doncic, Karim Lopez und alle anderen zeigten leere Shooting-Tabs.

### Lösung
Box-Score-Ableitung (siehe Punkt 5 oben) — auch für Intl-Spieler.

### Shot Diet >100% Bug (Karim Lopez)
`estTotalShots` enthielt nur FTA wenn FGA fehlte → 2PA-Estimate (240) / FTA-only-base (87) × 100 = 275%. Fix: `estTotalShots = max(componentShots, totalShots)`.

---

## 13. Anthro-Tier-Vergleich im BodyTab (NEUES FEATURE)

### Zweck
Analog zum vs.NBA-Tier-Vergleich im Overview Tab. User sieht auf einen Blick, ob ein Spieler über- oder unterdurchschnittliche Anthropometrics (Height/Weight/Wingspan/Standing Reach) für den gewählten Tier × Position hat.

### Implementation
- `ANTHRO_TIER_THRESHOLDS` (Frontend constant): Median NBA-Combine-Werte (mit Schuhen) für Tier × Position.
- `AnthroTierComparison` Component: Replica von OverviewTab's vs.NBA-Tier-Section, mit identischen visuellen Elementen (Tier-Buttons, Frame-Match-Score, Range-Bars mit grün/gelb/rot).
- Position über dem Wingspan-vs-Height-Scatter im Body Tab.

### Schwellen (Median NBA-Combine-Werte, mit Schuhen)

| Tier × Pos | Height | Weight | Wingspan | Standing Reach |
|---|---|---|---|---|
| Replacement Playmaker | 75.0″ | 188 | 78.5″ | 98.0″ |
| Role Player Playmaker | 75.5″ | 193 | 80.0″ | 99.5″ |
| Starter Playmaker | 76.5″ | 200 | 81.5″ | 101.0″ |
| All-Star Playmaker | 77.0″ | 204 | 82.5″ | 102.0″ |
| Replacement Wing | 79.0″ | 208 | 82.0″ | 103.5″ |
| Role Player Wing | 79.5″ | 213 | 83.5″ | 104.5″ |
| Starter Wing | 80.0″ | 218 | 84.5″ | 106.0″ |
| All-Star Wing | 80.5″ | 220 | 85.5″ | 107.0″ |
| Replacement Big | 82.0″ | 235 | 86.0″ | 108.0″ |
| Role Player Big | 82.5″ | 243 | 88.0″ | 110.0″ |
| Starter Big | 83.0″ | 250 | 89.0″ | 112.0″ |
| All-Star Big | 83.5″ | 255 | 90.5″ | 113.5″ |

---

## 14. Combine 2026 Daten Import-Workflow

### Backend-Pipeline für verifizierte Combine-Werte
- `backend/scripts/import_combine_2026.py` — flexibles Import-Script
- `backend/data/raw/combine_2026_verified.csv` — persistente Speicherung verifizierter Werte
- `_load_combine_data()` in `main.py` priorisiert verifizierte 2026er Werte über imputierte

### Workflow für Daten-Import
1. Daten beschaffen (eine von zwei Optionen):
   - **JSON von NBA Stats API**: Browser-DevTools → Network → Response speichern als `backend/data/raw/combine_2026_nbastats.json`
   - **Manuelle CSV**: `backend/data/raw/combine_2026_input.csv` mit Format `player_name,height_with_shoes_in,weight_lbs,wingspan_in,standing_reach_in`
2. `python scripts/import_combine_2026.py` ausführen
3. Output: `combine_2026_verified.csv` (persistent), `wingspan_all_2026-03-13.csv` aktualisiert mit `verified_2026=True` Flag
4. Backend neu starten — `/api/combine` serviert jetzt verifizierte Werte
5. Frontend zeigt automatisch `combineMatch.ht_verified=true` → kein "≈"-Imputations-Symbol mehr

### Neue Felder in `/api/combine` Response
- `sr` — Standing Reach
- `ht_verified`, `ws_verified`, `wt_verified`, `sr_verified` — Boolean-Flags
- `ht_source`, `wt_source` — String: "combine_2026" vs. "imputed"

---

## 15. Overall Tab TIER_THRESHOLDS Review

### Audit-Ergebnis
Empirische Median-Werte aus NBA-Outcomes 2010-2024 (n=10-74 pro Tier × Position):

| Tier × Pos | Aktuell BPM | Empirisch BPM | Aktuell USG | Empirisch USG |
|---|---|---|---|---|
| Replacement Wing | 1.5 | 7.3 | 18 | 25.4 |
| Role Player Wing | 4.0 | 7.4 | 20 | 24.5 |
| Starter Wing | 6.5 | 7.5 | 23 | 23.5 |
| All-Star Wing | 9.5 | 7.9 | 26 | 26.7 |

### Interpretation
Die aktuellen Schwellen sind **prospective** (Minimum-Hürden zum Tier), nicht **descriptive** (Median realisierter Outcomes). Sie zeigen "welche Stats braucht ein Prospect mindestens um plausibel Tier X zu erreichen", was als Pre-Draft-Tool sinnvoll ist.

Die empirischen Medians sind höher weil **Selection-Bias** existiert: Spieler die später Replacement-Tier wurden, hatten in der NCAA bereits BPM ~7+ (sonst nicht draftet). Die "Replacement"-Schwelle 1.5 reflektiert die untere Grenze, nicht den Median.

### Empfehlung
Aktuelle Schwellen **unverändert lassen** für jetzt. Konservativ ist OK — keine kritischen Mismatches. Post-Launch: Bei Bedarf empirische Quartile (p25/p50/p75) statt Punkt-Schwellen einbauen.

---

## 20. 5-Position Anthro-Tier-Vergleich (PG/SG/SF/PF/C) ✅ POST-LAUNCH (2026-05-09 v8)

### Problem
Body-Tab Anthro-Vergleich nutzte nur 3 Pos-Buckets (Playmaker/Wing/Big). "Wing" war zu breit — umfasste SG 6'5″ und SF 6'8″ mit gleichen Schwellen. Boozer (PF) und Flagg (SF) wurden gegen die gleichen "Wing"-Werte verglichen.

### Lösung
**Pipeline-Side** (`07_feature_engineering.py`):
- `ROLE_MAP_5POS` mapped BartTorvik's 8 `role`-Werte auf PG/SG/SF/PF/C
- Plus Height+AST-basierte Inference für Intl/pre-2008-Spieler
- Neue Spalte `position_5pos` in unified_board_scores.csv

**Step 11** (`11_compress_for_deploy.py`):
- Exportiert `pos_detailed` Field ins API-JSON

**Frontend** (`App.jsx`):
- `ANTHRO_TIER_THRESHOLDS` auf 5×4 = 20 Sets erweitert
- Median NBA-Combine-Werte (mit Schuhen) für jeden Tier × NBA-Position kalibriert
- `inferDetailedPos()` Fallback wenn Backend `pos_detailed` fehlt
- AnthroTierComparison liest `p.posDetailed`, Section-Titel zeigt `(PG/SG/SF/PF/C)`

### Mapping BartTorvik role → 5-Pos
```
Pure PG     → PG  (klassischer Distributor)
Scoring PG  → PG  (Lillard/Trae-Stil)
Combo G     → SG  (hybrid PG/SG, eher off-ball)
Wing G      → SG  (off-ball Guard mit Wing-Size)
Wing F      → SF  (klassischer Small Forward)
Stretch 4   → PF  (shooting Power Forward)
PF/C        → PF  (combo Big)
C           → C   (true Center)
```

### Threshold-Schwellen Beispiel (Schuhe-Höhe, NBA-Convention)

| Tier × Pos | PG | SG | SF | PF | C |
|---|---|---|---|---|---|
| **All-Star** | 75.5/198/81/101 | 78.0/210/84/105 | 80.5/225/86/107.5 | 82.5/250/89.5/112 | 84.5/260/92/115 |
| **Starter** | 75.5/195/80.5/100.5 | 77.5/205/82.5/103.5 | 80.0/220/85/106.5 | 82.5/245/88.5/110.5 | 84.0/255/90.5/113.5 |
| **Role Player** | 75.0/190/79/99 | 77.0/200/81.5/102 | 79.5/215/84/105.5 | 82.0/235/87/108.5 | 83.5/250/89/112 |
| **Replacement** | 74.5/185/77.5/97.5 | 76.5/195/80.5/101 | 79.0/210/82.5/104.5 | 81.5/228/85/107 | 83.0/243/87.5/110.5 |

Format: ht / wt / ws / sr (in inches/lbs)

### Auswirkung
- Boozer (PF) wird jetzt gegen All-Star PF (82.5″ / 250 lbs / 89.5″ WS) verglichen — fair statt zu hart
- Flagg (SF) gegen All-Star SF (80.5″ / 225 / 86″) — passt zu seinem Profil
- Combo-Guards wie Acuff/Wagler gegen PG-Schwellen — kleinere Frame-Erwartung
- Stretch-Bigs vs C-Werte → korrekter Vergleich

---

## 19. NCAA-PER Bridge-Loader (Longterm methodischer Fix, 2026-05-09 v7)

### Problem
Bridge-Methode für League-Weights brauchte NCAA als Anker (=1.0), aber `ncaa_player_season` hatte kein PER (das Cross-Liga-Bridge-Metric). Folge: Fallback auf Euroleague-Anker mit Calibration-Konstante 1.45 (= empirischer NBA-Konsens).

### Lösung
NCAA-Loader in `recompute_league_weights_v2.py` konvertiert porpag → PER-Proxy:

```python
PER_proxy = porpag * 1.5 + 12
```

**Begründung der Formel:**
- porpag-Verteilung NCAA: median ~0, p90 ~3, max ~7 (Curry/Embiid college peaks)
- PER-Verteilung Intl: median ~10-12, p90 ~22, max ~28 (Doncic EL)
- Linear-Fit über Cross-Liga-Spieler (NCAA→Intl Brücken): porpag=0 → PER≈12 (league avg), porpag=5 → PER≈19.5 (good NBA)
- Kalibriert via bekannte Cross-League-Trajektorien

**Wichtig:** Diese Konversion ist NUR für den Bridge-Graph. Sie macht NCAA-porpag mit Intl-PER vergleichbar damit Multi-Hop-Pfade funktionieren. Die actual NCAA-Spieler-Bewertung im Modell nutzt weiterhin BPM/eDiff direkt.

### Erwartetes Verhalten beim nächsten Re-Run
1. NCAA wird Teil des Bridge-Graph (mit PER-Proxy)
2. Anker schaltet automatisch um auf NCAA = 1.0 (Option #1 in der Hierarchie)
3. Calibration-Konstante (×1.45) wird nicht mehr nötig — Liga-Weights kommen direkt aus den Bridge-Pfaden
4. Euroleague-Weight wird auto-berechnet (vermutlich nahe 1.45)

### Status
✅ Code-Change drin in `recompute_league_weights_v2.py`. Wirkt beim nächsten Pipeline-Re-Run.

---

## 18. League-Weights NCAA-Anker (2026-05-09 v6)

### Problem
v2-Bridge-Methode capped Euroleague auf 1.0 (= NCAA Power 1.0). Beide Skalen auf gleichem Punkt → methodisch falsch. Doncic translatable_usg landete bei 21.2 statt realistischer 31+.

### Lösung
Anker-Hierarchie in `recompute_league_weights_v2.py`:
1. **NCAA direkt** im Bridge-Graph → Anker = NCAA, scale = 1.0 (methodisch sauberste Variante)
2. **Euroleague intern** + Post-Anchor-Calibration (`EUROLEAGUE_VS_NCAA_POWER = 1.45`) → Fallback
3. **Höchster TC** — Edge-Case Fallback

Cap-Limit von 1.0 auf 2.0 erhoben — verhindert pathologische Outliers, erlaubt aber echte Top-Ligen.

### Resultat (aktueller Pipeline-Output)

```
Intl Euroleague      → 1.450 [emp]
Intl Spanish ACB     → 1.200 [emp]
Intl Eurocup         → 1.050 [emp]
Intl Turkish BSL     → 1.050 [emp]
Intl Italian Serie A → 0.950 [emp]
Intl French LNB      → 0.900 [emp]
Intl German BBL      → 0.800 [emp]
Intl Lithuanian LKL  → 0.750 [emp]
Intl Chinese CBA     → 0.600 [emp]
```

### Validation
- `conf_strength: mean=0.686 [0.410-1.450]` (vorher 0.666 [0.410-1.000])
- Doncic translatable_usg: 21.2 → 30.7 (USG=29 × conf=1.45 × youth=0.74)
- Doncic WAR-Boost via conf-adj: +5.8 WAR (26.0 → 31.8)
- CV r=0.482 (vorher 0.468) — Modell-Performance leicht verbessert
- Top-10 backtest accuracy 79% (vorher 74%)

---

## 17. Combine 2026 Anthropometrics ✅ IMPORTED (2026-05-09 v5)

### Quelle
NBA Combine Anthros 2026 Excel-Datei (78 Spieler vom User bereitgestellt).

### Konstanten-Sync
- `SHOE_LIFT_INCHES = 1.25"` — durchgängig im backend/main.py und backend/scripts/import_combine_2026.py
- Vorher inkonsistent (1.0 in Import-Script, 1.25 in Backend) → jetzt konsistent
- Boozer: ht_no_shoes = 80.25" → ht_with_shoes = 81.5"

### Persistenz
- `backend/data/raw/combine_2026_verified.csv` — 78 Spieler mit:
  - player_name, position
  - height_no_shoes_in, height_with_shoes_in
  - weight_lbs, wingspan_in, standing_reach_in
  - body_fat_pct, hand_length, hand_width
  - source = "nba_combine_2026", verified = True
- `backend/data/raw/wingspan_all_2026-03-13.csv` — gemerged: 75 neue Spieler hinzugefügt, 3 existierende aktualisiert mit `verified_2026=True` Flag

### Name-Aliase angewendet
- `Anicet Dybantsa` → `AJ Dybantsa`
- `Nathaniel Ament` → `Nate Ament`
- `Matthew Able` → `Matt Able`
- `Nicholas Boyd` → `Nick Boyd`

### Match-Statistik
- 75/78 Combine-Spieler haben vollständige Daten (3 hatten ausschließlich Name + Pos)
- 71/75 matched zu 2026 Profile-DB
- 4 unmatched (Christopher Brown Jr, Christopher Cenac Jr., Morez Johnson, Jayden Quaintance — keine NCAA-Profile in DB)

### Top-Prospects mit verifizierten Werten

| Spieler | Ht (w/shoes) | Weight | Wingspan | Standing Reach | WS-Δ |
|---|---|---|---|---|---|
| Cameron Boozer | 81.5″ (6'9.5″) | 252.8 | 85.5″ | 108.0″ | +4.0″ |
| Tarris Reed Jr. | 83.0″ (6'11″) | 263.6 | 88.25″ | 110.0″ | +5.2″ |
| Hannes Steinbach | 83.5″ (6'11.5″) | 248.0 | 86.25″ | 108.0″ | +2.75″ |
| Caleb Wilson | 82.5″ (6'10.5″) | 210.8 | 84.25″ | 108.0″ | +1.75″ |
| Nate Ament | 82.75″ (6'10.75″) | 210.8 | 83.5″ | 109.5″ | +0.75″ |
| Yaxel Lendeborg | 82.0″ (6'10″) | 241.4 | 87.25″ | 108.5″ | +5.25″ |
| Karim Lopez | 81.5″ (6'9.5″) | 221.8 | 83.5″ | 105.5″ | +2.0″ |
| AJ Dybantsa | 81.75″ (6'9.75″) | 217.0 | 84.5″ | 106.0″ | +2.75″ |
| Darryn Peterson | 77.75″ (6'5.75″) | 198.8 | 81.75″ | 103.0″ | +4.0″ |
| Darius Acuff Jr. | 75.25″ (6'3.25″) | 185.8 | 78.5″ | 98.5″ | +3.25″ |
| Kingston Flemings | 75.75″ (6'3.75″) | 183.4 | 75.5″ | 98.5″ | -0.25″ |
| Keaton Wagler | 78.25″ (6'6.25″) | 188.0 | 78.25″ | 100.0″ | 0″ |
| Flory Bidunga | 81.0″ (6'9″) | 228.6 | 87.25″ | 106.5″ | +6.25″ |

### Backend Endpoint
`/api/combine` priorisiert die verifizierten Werte mit Flags:
- `ht_verified`, `ws_verified`, `wt_verified`, `sr_verified`
- `ht_source`, `wt_source` ("combine_2026" vs. "imputed")

Frontend BodyTab nutzt diese Flags um den "≈"-Imputations-Hinweis zu entfernen wenn `*_verified=true`.

### Standing Reach jetzt im Anthro-Tier-Vergleich aktiv
Da Combine-Daten Standing Reach mitbringen, zeigt der Anthro-Tier-Vergleich für die 71 verifizierten 2026er Prospects jetzt automatisch alle vier Maße (Height/Weight/Wingspan/Standing Reach) statt nur drei.

---

## 16. Pipeline-Side-Fixes (Post-Launch, 2026-05-09 v4)

Alle Pipeline-Code-Fixes sind eingebaut. Erst beim nächsten Pipeline-Re-Run (Render Pipeline-Day oder local) werden die Daten aktualisiert. **Frontend-Workarounds bleiben defensiv** — sie greifen nur wenn Backend-Wert fehlt, also automatisch no-ops nach Pipeline-Re-Run.

### Fix #1: `compute_age()` ref_date auf Draft Day
**Datei:** `data-pipeline/scripts/10c_ml_calibration.py` Zeile 749.
**Vorher:** `ref_date = datetime.datetime(int(season_yr), 2, 1)` — Feb 1.
**Nachher:** `ref_date = datetime.datetime(int(season_yr), 6, 25)` — Draft Day.
**Auswirkung:** Pipeline-`real_age`-Werte sind ~0.39 Jahre höher (korrekt). Boozer = 18.9 statt 18.5.

### Fix #2: `05c_process_international.py` Shooting-Ableitung
**Datei:** `data-pipeline/scripts/05c_process_international.py` (nach Zeile 899).
**Hinzugefügt:** Direkte Berechnung von `college_2p_pct`, `college_efg_pct`, `college_ts_pct` aus FGM/FGA/3PM/3PA/FTA/PTS.
```python
two_pa = fga - tpa
two_pm = fgm - tpm
df_out['college_2p_pct'] = np.where(two_pa > 0, two_pm / two_pa * 100, np.nan)
df_out['college_efg_pct'] = np.where(fga > 0, (fgm + 0.5 * tpm) / fga * 100, np.nan)
df_out['college_ts_pct'] = np.where((fga + 0.44 * fta) > 0, pts / (2 * (fga + 0.44 * fta)) * 100, np.nan)
```
**Auswirkung:** Doncic, Karim Lopez & 9000+ andere Intl-Profile bekommen ts_pct/efg_pct/two_pct nativ. Eliminiert Frontend-Derivation für 100% der Intl-Spieler.

### Fix #3: `predicted_tier` threshold-basiert
**Datei:** `data-pipeline/scripts/10c_ml_calibration.py` Zeile 3949.
**Vorher:** `df["predicted_tier"] = df["predicted_best_tier"]` — Modal-Tier.
**Nachher:** Custom `_recal_tier()` Funktion mit T6-Schwellen (kumulativ):
- Superstar P(S) ≥ 12% · All-Star P(S+A) ≥ 18% · Starter P(S+A+St) ≥ 26% · Role Player ≥ 38% · Replacement separate Gate.
**Auswirkung:** Backend liefert dieselbe Tier-Klassifikation wie Frontend, konsistent für Sortierung und alle Display-Stellen.

### Backend Pipeline Re-Run nötig für:
Die Frontend-Workarounds machen aktuell den Job sauber. Pipeline-Re-Run ist optional aber empfohlen für:
1. Pipeline-internale Konsistenz (Trainings-Daten matchen Frontend-Display)
2. Cache-Refresh bei /api/board /api/player Endpoints
3. Persistente Verbesserungen ohne Frontend-Hacks

**Pipeline-Re-Run-Anleitung:**
```bash
# Lokal (wenn NCAA_Master_Data verfügbar):
cd data-pipeline
python scripts/05c_process_international.py        # ~5 min
python scripts/10c_ml_calibration.py               # ~15-30 min
python scripts/10d_deploy_final.py                 # ~3 min
python scripts/11_compress_for_deploy.py           # ~5 min
python scripts/12_json_to_sqlite.py                # ~2 min

# Render Pipeline-Day (production):
# Trigger via Render dashboard → Manual Deploy on "pipeline" service
```

### Backend Pipeline (Optional Post-Launch)
1. **Outcome-Definition für `tier`-Field in 06_match_and_merge.py:** wohlwollender peak_pie-Schwellen — Tatum/Brunson sollten als All-Star gelabelt sein in Trainings-Outcomes. Aktuell vom Frontend via `tierFromPeakPie()` korrigiert.
2. **Mind-Tab Pipeline-Day:** PBP-derived mind_metrics aktuell halten.
3. **Game-Logs Re-Run mit `opp_strength`** aus `home_favored_by`.

## Nicht gefixt (Post-Launch TODOs)

### Mind-Tab
1. PBP-Pipeline-Day auf Render: Step 10c retraining mit aktuellen `mind_metrics`-Features.
2. Game-Logs-Pipeline Re-Run mit `opp_strength` von `home_favored_by`.

### Strukturelle Modell-Limitations (kein Quick-Fix)
1. **Tier-Probabilities sind für Top 7-15 Prospects sehr ähnlich** (alle ~28% Starter, ~28% Role Player). Das ist Pre-Draft-Modell-Uncertainty. Mehr Differenzierung würde mehr Features oder mehr Trainingsdaten brauchen.
2. **Pre-2017 NCAA Daten haben unvollständige Stats** — manche Spieler bekommen weiterhin wenige Badges. Backend-Datenanreicherung bräuchte historisches PBP, das nicht überall verfügbar ist.

### UX-Polish (kann post-launch)
1. **Tier-Probabilities Bar-Chart auf kumulative Probs umstellen** — wenn die einzelnen Bins zu uniform aussehen, kumulative Anzeige (P(Sup+) / P(AS+) / P(St+)...) wäre informativer. Klares Trade-Off: weniger ungewöhnlich für User.
2. **Mobile-Layout testen** — keine explizite Mobile-Optimierung im Pre-Launch-Pass gemacht.

---

## Deploy-Anweisung

```bash
cd /pfad/zu/prospecttheory-web

git add frontend/src/App.jsx backend/main.py
git commit -m "Pre-launch fixes: tier calibration, badges, archetypes, position, age, peak_pie display"
git push origin main
```

**Build-Verifikation:** ✓ 646 modules transformed, dist/ aktualisiert.

**Deploy-Trigger:**
- Frontend (Vercel): rebuild automatisch bei push to main, ~2 min.
- Backend (Render): rebuild automatisch, ~3-5 min.

**Bis beide live:** Comps-Anzeige fällt auf Backend-Tier zurück (kein peak_pie Override). Sobald Backend live → wohlwollendes Display aktiv.

---

## Spot-Check Liste (nach Deploy)

### Header / Identity
- [ ] Boozer Pos: Wing, Tier: All-Star, ClassRank: #1, Alter: 18.9
- [ ] Tarris Reed Jr.: Pos: Big (war Wing)
- [ ] Allen Graves: Pos: Wing (war Big)
- [ ] Westbrook: Pos: Playmaker (war Wing)
- [ ] Wagler: Pos: Playmaker (war Wing)
- [ ] Okorie: Pos: Playmaker (war Wing)
- [ ] Jrue Holiday: Pos: Playmaker (war Wing)
- [ ] Cade Cunningham: Pos: Playmaker (war Wing)
- [ ] PJ Haggerty: Pos: Playmaker (war Wing)
- [ ] Sabonis: Pos: Big (war Wing)

### Badges
- [ ] Boozer: KEIN Floor General, hat Self-Creator + High Feel
- [ ] Doncic: KEIN Passive Driver
- [ ] Wembanyama: KEIN Passive Driver
- [ ] Sengun: KEIN Passive Driver

### Tier-Verteilung 2026 Big Board
- [ ] 1 All-Star (Boozer)
- [ ] 13 Starter
- [ ] ~60 Role Player
- [ ] Top-14 alle Starter+
- [ ] ppWA-Spalte und Tier-Spalte zeigen die gleiche Farbe

### Player Page
- [ ] Boozer Predicted Tier zeigt "All-Star" mit Subtitle "P(All-Star+) = 24%"
- [ ] Boozer Bar-Chart hat weiße Outline auf All-Star Balken
- [ ] Boozer NBA Projection: "Primary Creator"
- [ ] Steinbach NBA Projection: "Starting Stretch Big" (war: Camp Invite)

### Comps
- [ ] Tatum als Comp zeigt "Superstar" (war: Starter)
- [ ] Brunson als Comp zeigt "All-Star" (war: Roleplayer)
- [ ] Trae Young als Comp zeigt "All-Star" (war: Starter)

### Internationale Spieler
- [ ] Doncic Shooting-Tab: 2P% sichtbar (~57)
- [ ] Karim Lopez Shooting-Tab: 2P% sichtbar, Shot Diet keine >100% Werte
- [ ] Doncic kein "Actual NBA Outcome" für 2018er Profile (außer Backend liefert peak_pie)

### Undrafted 2026er
- [ ] Boozer/Flagg/Dybantsa: KEIN "Actual NBA Outcome" Block

---

*Dokument erstellt 2026-05-09 vor Sunday-Launch.*
