# Sprint-3.0 — Modell-Trustability Foundation

Long-form design doc für die methodische Grundlage des nächsten Modell-Iteration-Zyklus. Wer das in 6 Monaten liest, soll verstehen können warum welche Entscheidung wie getroffen wurde.

## TL;DR

Sprint-3.0 etabliert drei fundamentale Bausteine, die das Modell von **heuristisch** auf **methodisch** ziehen:

1. **Eligibility-Framework** — Welche Spieler werden vom Modell bewertet, mit welcher Konfidenz? (3.0.A)
2. **Bayesian-Shrinkage** — Wie wird Sample-Size-Noise in Per-Sample-Features (BPM, USG, TS%) systematisch reduziert? (3.0.B)
3. **Multi-Layer Tier Output** — Wie kommuniziert das Modell ehrlich seine eigene Unsicherheit? (3.0.C)

Alle drei haben einen gemeinsamen Anker: **`sample_n_effective` = GP × Min_per** als Sample-Size-Metric. Alle drei landen Backend-vorberechnet im `profile.tier_layered`-Dict; Frontend macht keine Mathematik.

## Hintergrund — warum wurde das nötig

### Der Kingston-Flemings-Audit

Am 2026-06-12 fragte Tobias warum Kingston Flemings im Modell als Superstar gelistet ist, obwohl er außerhalb der Top-30 in Scout-Rankings liegt. Audit zeigte:

```
2026er Top-25 nach age_adj_production:
  Boozer (Full Sample)       18.16
  Dylan Lakatos (1 GP)        15.08
  Christian Dedivanaj (2 GP)  14.67
  ...
  62% von Top-50 hatten GP < 15 oder Min_per < 10
```

Walk-ons und Garbage-Time-Cameos saßen mit echten Top-Prospects in den Top-25. Ein 30-Punkte-Garbage-Time-Auftritt produzierte BPM +16, der × `youth_mult` (1.33 für 18-Jährige) zu age_adj_prod 21 wurde — methodisch wertlos, aber vom Modell gleichwertig behandelt wie Boozer.

### Root-Cause-Analyse: drei verwandte Probleme

1. **Kein Eligibility-Framework.** Was definiert einen "Prospect"? Aktuell: alles was in BartTorvik existiert. Walk-ons + Star-Recruits in derselben Population.
2. **Keine Sample-Size-aware Feature-Engineering.** BPM bei N=10 wird gleich gewichtet wie BPM bei N=35.
3. **Point-Estimate-zentrische Outputs.** Headline-Tier aus `ev_added_wins`, ignoriert `tier_probs`-Distribution.

Sprint-3.0 adressiert alle drei.

## Architektur-Entscheidungen

### Entscheidung 1: Variante C (Hybrid-Confidence) als Eligibility-Form

Statt harter Filter (Walk-ons komplett rauswerfen) ist `sample_confidence_tier` ein **first-class Tag**:
- Modell rechnet für ALLE Spieler
- Insufficient-Tag macht Mini-Sample-Inputs transparent
- Frontend kann optional filtern, default ist Tag

Begründung: harter Filter würde Boozer als HS-Recruit ausschließen (keine NCAA-Sample). Tag-Ansatz bewahrt alle Information und macht Confidence explizit.

### Entscheidung 2: Backend-vorberechnet, Frontend nur Display-Selektion

```
Backend (Build-Time, einmal):  Mathematik
Frontend (Runtime):             Lookup + Display-Choice
```

Heuristik: Wenn ein berechneter Wert eine Formel ist → Backend. Wenn String-Lookup oder einfacher Filter → Frontend.

Methods-Dict-Standard etabliert: jeder berechnete Wert hat exakt einen Computation-Owner (Backend). Frontend darf nie neu berechnen.

### Entscheidung 3: Single Source of Truth in `model_utils.py`

`classify_sample_confidence`, `shrink_to_class_prior`, `build_multi_layer_tier` leben in `model_utils.py`. 02k, 10c und 11_compress importieren — kein duplicate Code, ein Fix landet überall.

### Entscheidung 4: Empirisch begründete Thresholds, nicht heuristisch

Eligibility-Thresholds (GP=24, Min_per=25) sind **p10 der historischen NBA-Spieler 2018-2024 (n=185)**. Nicht "weil 25 round number". Bayesian-Shrinkage Pseudo-Count (50) ist via Calibration auf Top-Prospects validiert.

Verhältnis: Validation-Daten → Threshold → Implementation. Nicht umgekehrt.

## Methodische Begründung im Detail

### Sprint-3.0.A — Eligibility-Framework

**Empirische Threshold-Ableitung:**

```
Historische Klassen 2018-2024:
  NBA players (n=185):
    GP-Verteilung:      p10=24,   p25=29,   median=32
    Min_per-Verteilung: p10=25.3, p25=30.9, median=34.3
```

**Threshold-Definitionen:**

```
Full Confidence:
  GP ≥ 24 AND Min_per ≥ 25
  → p10 historischer NBA-Spieler (Recall-Schutz)

Partial Confidence:
  GP ≥ 15 AND Min_per ≥ 15
  → echter Rollen-Anteil, statistisch interpretierbar, aber mit Caveat

Insufficient:
  Rest (Walk-on / Garbage-Time / mid-Season Injury)
```

**Beide Conditions (GP UND Min_per) müssen erfüllt sein.** Walk-on mit 30 Garbage-Time-Spielen zählt nicht als Full, weil Skill-Demonstration noisy ist. Verletzungs-Saison mit 10 Spielen à 38 Minuten ist Partial — Skill-Demonstration vorhanden, aber Sample zu klein.

**Backtest-Recall:** 84.3% NBA-Spieler in Full + 11.4% in Partial = 95.7%. Akzeptabel; die 4.3% Insufficient-NBA-Spieler sind Edge-Cases (Verletzungs-Saisons, mid-Year-Transfers, Internationals).

**Class-Konsistenz (Sanity-Check, alle Klassen):**

```
Klasse 2017-2024:  Full 30-42%  Partial 18-23%  Insufficient 39-50%
Klasse 2026:       Full 33.1%   Partial 26.4%   Insufficient 40.5%
Klasse 2021:       Full 17.1%   (COVID-verkürzte Saison, methodisch korrekt niedrig)
```

### Sprint-3.0.B — Bayesian-Shrinkage

**Formel:**

```
Posterior = (n_obs × x_obs + n_prior × x_prior) / (n_obs + n_prior)
```

- `n_obs` = `sample_n_effective` (GP × Min_per)
- `x_prior` = mean of feature in (year, cls) group, gefiltert auf Full-Eligible
- `n_prior` = 50 (Pseudo-Count, empirisch kalibriert)

**Calibration-Logik:**

Bei `n_pseudo = 50`:
- `sample_n_effective = 50` → 50/50 prior/obs Mix (volle Shrinkage)
- `sample_n_effective = 200` → 80% obs, 20% prior
- `sample_n_effective = 1000` (Boozer Niveau) → 95% obs, kaum Shrinkage

**Pseudo-Count Justification:** Empirisch via Top-25 Inspection. `pseudo_count = 50` lässt Mini-Sample-Outliers (Lakatos, Dedivanaj) komplett aus Top-20 verschwinden, ohne Top-Prospects (Boozer, Peterson, Flemings, Wilson, Dybantsa) signifikant zu verändern (3-6% shrinkage). `pseudo_count = 25` reicht nicht für vollen Outlier-Filter, `pseudo_count = 100` shrinkt zu aggressiv (Boozer −6.5%).

**Welche Features?**

```python
SHRINKAGE_FEATURES = [
  # BPM-Familie (high impact, hoher Sample-Noise)
  "BPM", "OBPM", "DBPM", "GBPM", "OGBPM", "DGBPM",
  # Efficiency rates
  "college_usg", "TS_per", "eFG", "FT_per", "TP_per",
  # Per-100 box stats
  "AST_per", "TO_per", "stl_per", "blk_per", "ORB_per", "DRB_per",
  # Other rate stats
  "college_ftr",
]
```

Counting Stats (`college_pts` etc.) sind NICHT in der Liste — der Wertebereich ist eng genug, dass Sample-Noise hier kaum problematisch ist. Shooting V2 hat eigenen Bayesian-Posterior (sample-size-aware), darum nicht doppelt shrinken.

**Reihenfolge im 10c:**

Shrinkage läuft VOR den `_s_*` Scaled-Stat-Definitionen. Dadurch fließt shrunken-BPM automatisch in alle downstream Composites (age_adj_production, self_creation_eff, etc.).

**Audit-Trail:** Jede geshrunkene Spalte behält Original-Wert als `{col}_raw`. Diagnose und Debug-Reproduktion möglich.

### Sprint-3.0.C — Multi-Layer Tier Output

**Struktur:**

```python
profile.tier_layered = {
  "point_estimate":    "Superstar",                    # aus ev_added_wins-Cuts
  "modal":             "Role Player",                  # mode of tier_probs
  "weighted_label":    "Role Player (32%)",            # display-fertig
  "ci_95":             ["Negative", "Superstar"],      # cumulative-prob CI
  "sample_confidence": "Full",                         # aus 02k
}
```

**Beispiel Kingston Flemings:**

```
tier_probs:        {SS: 16.9, AS: 9.3, ST: 16.4, RP: 32.4, RE: 10.9, NEG: 14.1}
point_estimate:    "Superstar"        ← ev_added_wins 9.18 fällt in Superstar-Cut
modal:             "Role Player"      ← höchste prob (32.4%)
weighted_label:    "Role Player (32%)" ← dominanter modal, einzelner Tier-Label
ci_95:             ["Negative", "Superstar"] ← Verteilung sehr breit
sample_confidence: "Full"
```

Interpretierbar als: "Headline-Modell sagt Superstar, aber Distribution ist sehr breit (Range Negative-Superstar). Modal ist Role Player. Full Sample, aber Modell ehrlich unsicher."

**Weighted-Label-Logic:**

```
modal_dominance_pp = 10:  Modal-Tier wird einzeln gezeigt wenn Δ ≥ 10pp
                          zwischen erstem und zweitem Tier.
                          Sonst Range "Tier1-Tier2 (P1%/P2%)".
```

**Frontend kann zwei Display-Modi:**
- **Confident-Mode:** zeigt nur `point_estimate` (heutiges Verhalten, backward compatible)
- **Honest-Mode:** zeigt `weighted_label` + Confidence-Badge → User sieht Modell-Unsicherheit

## Pipeline-Integration

Reihenfolge im Pipeline-Run (Auszug):

```
... 02a-02j     Roh-Daten + Targets + Tier-Probabilities
02k_eligibility CSV-Annotation (für unified_board_scores)
10b_unified    Aggregation
10c_ml         Bayesian-Shrinkage + ML-Training (Filter auf Full+Partial)
10d_deploy     Final-Output
11_compress    Profile-Build + Multi-Layer-Tier-Composition
```

**Single Source of Truth: `model_utils.py`**

```
classify_sample_confidence        ← 02k + 10c
compute_eligibility_columns       ← 02k + 10c
shrink_to_class_prior             ← 10c
shrink_features_inplace           ← 10c
build_multi_layer_tier            ← 11_compress
compute_modal_tier                ← Helper
compute_tier_ci                   ← Helper
build_weighted_label              ← Helper
TIER_ORDER                        ← Konstante
DEFAULT_SHRINKAGE_PSEUDO_COUNT    ← 50
SAMPLE_*_THRESHOLD                ← 24/25/15/15
```

## LEAK-Regex-Schutz

`model_utils.LEAK` regex hat schon `sample_` als Exclusion. Dadurch werden die neuen `sample_*` Felder **automatisch NICHT als ML-Features** durchgereicht — sie bleiben Metadata. Ohne diesen Schutz hätten wir versehentlich `sample_n_effective` als ML-Input gehabt → Data Leakage.

## Was NICHT in Sprint-3.0 ist (zukünftige Sprints)

- **Sprint-3.0.D Validation-Framework:** noch nicht als Code-Modul. Wird ad-hoc via Backtest-Cells gemacht. Wenn das skaliert, eigenes `validate.py` daneben.
- **International-Eligibility:** FIBA-Pro-Liga / Euroleague brauchen eigene Threshold-Kalibration. Aktuell laufen Internationals durch dieselben NCAA-Thresholds — methodisch unsauber, aber pragmatisch.
- **HS-Recruit-Override:** Top-100 Recruit ohne College-Sample → könnte Partial bekommen via expliziten Override (analog `inject_position_overrides.py`). Nicht implementiert für Sprint-3.0.
- **Adaptive Pseudo-Count pro Feature:** Aktuell 50 für alle Shrinkage-Features. Pro Feature könnte pseudo_count anders sein (BPM braucht mehr Sample als TS%). Backlog.

## Lessons Learned aus Sprint-3.0 Build

1. **Empirisch begründete Thresholds sind ehrlicher als runde Zahlen.** GP=24 weil p10 NBA-Spieler, nicht weil "24 fühlt sich richtig an".
2. **LEAK-Regex hat uns vor versehentlichem Data Leakage geschützt.** Defensive-Engineering-Praxis zahlt sich aus.
3. **Multi-Layer-Output kommuniziert Unsicherheit ehrlich.** Headline kann "Superstar" bleiben (backward compat), aber modal + ci_95 zeigt was das Modell wirklich "weiß".
4. **Single Source of Truth in model_utils ist Hygiene.** Sprint-3.0 hat drei Pipeline-Stufen erweitert; alle importieren von einer Stelle.

## Backlog für nach Sprint-3.0 Re-Run

- **Sprint-3.0.D Validation-Framework als Code-Modul** (formalisiert das ad-hoc Backtest-Pattern)
- **Sprint-3.1: Pipeline-Re-Run + Validation gegen Pod-State-Snapshot**
- **Sprint-3.2: Creation Pillar v3 Logistic Regression** (nutzt das Eligibility-Framework als Training-Set-Filter)
- **Sprint-3.3: Archetype Audit v26** (verwendet Multi-Layer-Tier als Validation-Anchor)

## Anhang: Code-Locations

```
data-pipeline/scripts/
├── model_utils.py                 ← Single Source of Truth (alle Helpers)
├── 02k_eligibility_framework.py   ← Pipeline-Annotation-Stage
└── 10c_ml_calibration.py          ← Shrinkage + Training-Set-Filter
└── 11_compress_for_deploy.py      ← Multi-Layer Tier Profile-Build
```

```
prospecttheory-web/
└── DAY_LOG_2026-06-11.md          ← Vorheriger Day-Log (Recovery + Render)
└── SPRINT_3_0_DESIGN.md           ← Diese Datei
```
