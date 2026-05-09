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

## Nicht gefixt (Post-Launch TODOs)

### Backend Pipeline (Render Re-Run nötig)
1. **`compute_age()` in `10c_ml_calibration.py` Zeile 749:** `ref_date` von Feb 1 auf Draft Day (~25. Juni) ändern → eliminiert Frontend-Patch.
2. **`05c_process_international.py`:** `two_pct`, `efg_pct`, `ts_pct` direkt aus FGM/FGA/3PM/3PA/FTA berechnen → eliminiert Frontend-Derivation.
3. **`predicted_tier` in 10c:** auf threshold-basierte Logik umstellen (statt modal) → konsistent mit Frontend.
4. **Outcome-Definition für `tier`-Field in 10c:** wohlwollender mit peak_pie-Schwellen — Tatum/Brunson sollten als All-Star gelabelt sein in der Trainings-Outcome-Definition.

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
