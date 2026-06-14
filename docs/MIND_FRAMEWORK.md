# Mind Framework — Methodik-Reference

**Status:** Permanent Reference. Plus User-facing Disclaimer-Link aus der App
zeigt hierher. Plus Wurzel-Verständnis für alle Mind-Diskussionen.

**Wurzel-Regel:**
> Mind misst **behavioural patterns under pressure** — keine NBA-Outcome
> Projection. Plus die Tab ist qualitative behavioural reference, KEIN
> projection driver. Univariate |r| < 0.10 mit peak Wins Added.

---

## Was Mind misst

Vier strukturelle Fragen pro Spieler — jede beantwortet aus den Play-by-Play
Sequenzen seiner letzten verfügbaren Saison:

1. **Wie reagiert er nach einer Schlechtphase?**
   (4 Adverse-Event-Resilience Indizes)
2. **Wie schießt er in Druck-Situationen?**
   (Clutch-Time, Clutch-WP, Late-Shot-Clock Pressure Splits)
3. **Bleibt er an der Linie akkurat?**
   (Free-Throw Splits inkl. Clutch-FT)
4. **Wie stabil ist sein Profil über die Saison?**
   (Stamina-Drift Half-1 vs Half-2)

Plus die Antworten sind tendency hints, nicht deterministische Aussagen.
Plus alle Werte werden mit explizitem "verify with film"-Disclaimer im UI gezeigt.

---

## Methodik

### Streak-Definition (v2, Tobias 2026-05-08)

Plus die v1 Streak-Logik war zu lax: bei 2/3 adverse triggerten ~70% aller
Actions einen Streak (weil missed-shots allein schon 50% rate sind). Plus die
v2 ist strikter:

```
STREAK_WINDOW         = 4    # die letzten N Player-Actions
STREAK_MIN_ADVERSE    = 3    # ≥ 3 adverse in 4 = "richtige Schlechtphase"
POST_STREAK_WINDOW    = 4    # die nächsten N Actions = Post-Streak-Window
STREAK_COOLDOWN       = 4    # nach Trigger, ignore next N für neue Trigger
```

Plus die Cooldown vermeidet, dass eine einzelne lange Schlechtphase mehrfach
gezählt wird. Plus ein "Adverse Event" ist eine der: missed FG, TOV, foul
against. Plus eine Player-Action ist jede shot attempt + tov + foul-drawn.

### Vier Resilience-Indizes

Jeder Index ist **rate post-streak ÷ baseline rate**. Plus die Interpretation:

| Index | misst was | > 1.0 bedeutet | < 1.0 bedeutet |
|---|---|---|---|
| **Aggressor**   | FGA-Rate post-streak | nimmt MEHR shots nach Slump | weicht aus |
| **Overdriver**  | TOV-Rate post-streak | leistet sich mehr Turnovers | bleibt kontrolliert |
| **Hothead**     | PF-Rate post-streak | foul-prone unter Druck | bleibt diszipliniert |
| **Passive**     | Total-Touch-Rate post-streak | mehr involved als baseline | zieht sich raus |

Plus die Indizes haben **95% Confidence Intervals** (CI via Bootstrap) + 
**Position-Z-Scores** (Z relativ zu Position-Verteilung im Pool).

### Pressure Splits

```
Clutch Time:   last 5 min half 2, score_diff ≤ 5
Clutch WP:     win probability ∈ [0.20, 0.80]  (outcome uncertainty late)
Late Clock:    ≥ 22 secs since possession start (NCAA 30s shot clock)
```

Plus jeder Split liefert: fga, efg%, delta_efg (vs baseline efg%).

### Free Throw Block

```
fta_total       — Total FTA Saison
ft_pct_overall  — Baseline FT%
clutch_fta      — FTA in Clutch-Time
clutch_pct      — FT% in Clutch-Time
clutch_delta    — clutch_pct − ft_pct_overall
```

### FT-Resilience nach Adverse Event (Sprint-3.24, 2026-06-14)

Plus die fünfte Resilience-Metrik beantwortet die Frage: **bleibt der Spieler
nach einem Adverse-Event-Streak an der Linie akkurat?** Plus die FT-Resilience
ist analog zu Aggressor/Overdriver/Hothead aufgebaut:

```
ft_pct_base_streak  = FT% bei TRIPS in baseline (non-streak Phasen)
ft_pct_post_streak  = FT% bei TRIPS im post-streak Window
ft_resilience       = ft_pct_post_streak / ft_pct_base_streak
```

Plus die Interpretation:
- **> 1.0** = bleibt unter Druck akkurat oder verbessert sich
- **≈ 1.0** = neutral
- **< 1.0** = drops unter Druck

Plus FT-Trip-aggregiert (nicht einzelne FTs), weil ein 1-of-2-trip ein anderes
Signal ist als 2-of-2. Plus die methodisch erfasst auch "mental stability under
high-leverage", parallel zum Game-Clutch (clutch_pct) — aber spezifisch nach
einer Schlechtphase, nicht nur Game-Phase.

**Sample-Size-Filter**: min 5 FT-Trips in BEIDEN baseline und post-streak. Plus
sonst ist der Ratio noisy. Plus CI via Wald-log-ratio.

### Data-Driven Event-Weight Befund (Sprint-3.24 Phase A)

Plus die analyse_event_weights.py auf 2018-19 (5463 Games, 1731 isolated single-
event windows) zeigte:

```
Missed FG    weight 1.000   (avg post-Event eFG-Drop: 42.77 pts, n=846)
Turnover     weight 0.929   (avg post-Event eFG-Drop: 39.72 pts, n=419)
Foul against weight 0.901   (avg post-Event eFG-Drop: 38.52 pts, n=466)
```

**Methodischer Befund:** die naive Annahme TOV > Missed > Foul ist **NICHT**
empirisch bestätigt — alle 3 Adverse-Event-Types haben fast gleichgewichtigen
Post-Event Performance-Drop (Differenz <10%). Plus die existing Streak-Logik
(alle Events gleich gewichtet) ist methodisch UNTERSTÜTZT.

Plus die hohen absoluten Drop-Magnitudes (~40 eFG-pts) sind ein Sample-Size-
Artefakt der kurzen 4-Action Post-Windows (~1-2 FGA/window). Plus die relativen
Differenzen sind das relevante Signal.

**Konsequenz:** Event-Weights bleiben implizit 1.0/1.0/1.0/1.0 — keine
Refactor nötig.

### Sensitivity-Analyse

Plus jeder Index wird gegen **alternative Streak-Definitionen** korreliert:
- `_wider`: STREAK_WINDOW = 6 statt 4
- `_looser`: STREAK_MIN_ADVERSE = 2 statt 3

```
r > 0.85   = robust       — Index hält unter Definition-Drift
r 0.6-0.85 = moderate     — kleinere Bewegungen
r < 0.6    = fragil       — Definition-spezifisch
```

Plus empirisch:
- **Aggressor wider** r ≈ 0.98 (robust), **looser** r ≈ 0.37 (fragil)
- **Overdriver wider** r ≈ 0.96 (robust), **looser** r ≈ 0.43 (fragil)
- **Hothead, Passive**: ähnliches Muster

**Aussage:** unsere harte Streak-Definition (3 of 4) ist die "richtige" — looser
Definitionen verwässern das Signal.

---

## Sample-Size-Konventionen

```
MIN_ACTIONS_FOR_VALID    = 50     # Spieler braucht ≥50 Actions für Aggregate
MIN_STREAKS_FOR_RELIABLE = 25     # Inject-Schwelle für "non-limited_sample" Flag
                                  # (im Pipeline-Spike: 5)
PBPSampleWarning threshold = 200  # Frontend warnt unter dieser Schwelle
```

Plus die `limited_sample`-Flag im mindMetrics dict ist `true` wenn n_streaks
< 25. Plus die UI zeigt dann eine PBPSampleWarning. Plus Pillar bleibt sichtbar,
aber die Konfidenz wird heruntergestuft.

---

## Historic NBA-Outcome Validation

**Wurzel-Befund (Tobias 2026-06-03):**

> Univariate Korrelation zwischen Mind-Composite und NBA peak Wins Added
> ist |r| < 0.10. Plus die Mind-Tab ist NICHT predictive für NBA-Stardom.

Plus Beleg aus dem 2008-2020 Pool:
- **Anthony Edwards**, **Jalen Brunson**, **Trae Young**, **Tyrese Haliburton**:
  alle scored **below-median** auf Mind-Composite in ihrer letzten NCAA-Saison.
- Plus die wurden trotzdem All-Stars.
- Plus die Inverse-Aussage gilt auch: high-Mind-Score Spieler werden NICHT
  systematisch besser im NBA.

**Methodisch-saubere Interpretation:**
- Mind ist **qualitative behavioural fingerprint**, nicht **predictive signal**.
- Plus die Skala ist diagnostic — "wer ist Aggressor-tilt, wer ist Passive-tilt"
  ist eine UN-PREDICTIVE Beschreibung, aber wertvoll für Film-Verification.
- Plus die Tab darf NICHT in einen Tier-Predictor oder Outcome-Score eingehen.

**Konsequenz im 10c:**
Mind-Features sind aus dem Tier-Predictor entfernt worden (auskommentiert in
`10c_ml_calibration.py` und in `08_tier_prediction_model.py` als "fragile r=0.4-0.6
Sensitivity" markiert). Plus die App nutzt mindMetrics nur in der MindTab.

---

## Coverage

Plus die Daten kommen aus:
- **NCAA**: BartTorvik PBP Arrays 2007-08 bis 2025-26 (NCAA_Master_Data)
- **Intl**: Euroleague + EuroCup PBP 2017-18 bis 2025-26 (Phase 3 Tobias 2026-05-17)

Pipeline:
```
scripts/pbp_mind_metrics_spike.py        → pro Saison CSV
scripts/pbp_mind_metrics_all_seasons.py  → aggregate über alle Saisons
scripts/pbp_mind_metrics_intl_all.py     → Intl-Version
backend/inject_mind_metrics.py            → CSV → SQLite DB
```

### 2025-26 Top-15 2026er — Sample-Size Status

| Spieler | n_streaks | n_actions | Status |
|---|---|---|---|
| Cameron Boozer | 30 | 1240 | reliable ✓ |
| AJ Dybantsa    | 44 | 1009 | reliable ✓ |
| Jalen Haralson | 36 |  520 | reliable ✓ |
| Bennett Stirtz | 44 |  849 | reliable ✓ |
| Nate Ament     | 51 |  803 | reliable ✓ |
| Donovan Dent   | 39 |  849 | reliable ✓ |
| Darryn Peterson| 28 |  535 | reliable ✓ |
| Mikel Brown    | 27 |  480 | reliable ✓ |
| Braden Smith   | 33 | 1030 | reliable ✓ |
| Cayden Boozer  | 16 |  502 | limited_sample ⚠ |

Plus 9/10 Top-Prospects über Reliable-Schwelle. Plus Cayden Boozer braucht
Saison 2026-27 für confident Mind-Read.

---

## Frontend-Architektur

`MindTab` (App.jsx line ~3885) zeigt:
1. **MindDisclaimer Banner** — was misst Mind, was nicht (|r|<0.10 disclaimer)
2. **PBPSampleWarning** — wenn n_actions < 200 (~10-15 Spiele)
3. **Pressure Splits** — Clutch, Clutch-WP, Late-Clock deltas
4. **Adverse-Event Indices** — 4 Resilience Indizes mit CI + Z-Score
5. **Free Throw Block** — Baseline + Clutch FT%
6. **Stamina Drift** — Half-1 vs Half-2 Performance

Plus die UI clusters Indizes nach **Sensitivity-Bucket** (robust grün, fragil
gelb, untersample-grau).

---

## Decision-Frame

**Wann Mind nutzen:**
- Film-Vorbereitung: "Was sollte ich beim Boozer-Tape suchen?" → Aggressor 1.4,
  Overdriver 0.7 sagt: "schaut, ob er nach Misses mehr Shots forciert."
- Stylistisches Profiling: "Ist dieser Spieler eher Hothead-tilt?"
- Plus Sanity-Check für consensus_signal: ein Spieler mit Aggressor 1.8 + 
  Passive 0.4 + Hothead 1.3 zeigt high-risk-tilt — verifiziere im Film, ob das
  zu Trade-Off-Profilen führt.

**Wann Mind NICHT nutzen:**
- Tier-Ranking oder Star/Bust-Classification (Korrelation |r| < 0.10)
- Plus Comparison-Engine Drivers (Mind ist semantisch nicht in Skill-Dimensionen)
- Plus Big-Board-Auf-/Abstufung — Mind allein rechtfertigt KEINE Bewegung um
  mehr als 1-2 Slots, und auch das nur mit Film-Verification

---

## Code-References

| Component | File | Wirkung |
|---|---|---|
| Streak-Logik | `data-pipeline/scripts/pbp_mind_metrics_spike.py` | Per-Saison CSV |
| Aggregation | `data-pipeline/scripts/pbp_mind_metrics_all_seasons.py` | Combined CSV |
| Intl | `data-pipeline/scripts/pbp_mind_metrics_intl_all.py` | Euroleague/EuroCup |
| Sensitivity | `data-pipeline/scripts/analyze_mind_reliability.py` | r-Check |
| Injection | `backend/inject_mind_metrics.py` | DB-Write |
| UI | `frontend/src/App.jsx::MindTab` | Tab-Rendering |
| Disclaimer | `frontend/src/App.jsx::MindDisclaimer` | UI Caveat-Banner |

---

## Backlog

- **Sprint-3.24 (#18)**: FT-Resilience nach Adverse Event (Mind v2)
- **Sprint-3.25 (#19)**: Usage Reaction Strahl (Scorer/Passer Slope)
- Plus konzeptionell offen: Multi-Season Trajectory Mind (statt single-Season
  Snapshot) — wenn ein Spieler über 2 Saisons konsistent Aggressor-tilt zeigt,
  ist das stärker als ein einmaliger Score.

---

*Erstellt 2026-06-14, Sprint-3.23 nach Sprint-3.22 Creation Skill v3.*
*Plus die Doku ist die canonical Mind-Reference. Bei Mind-Fragen hier zuerst.*
