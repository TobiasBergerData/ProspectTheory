# ProspectTheory Methods Dictionary

Single-source-of-truth Glossar für alle Modell-Felder die im API/Frontend sichtbar sind. Jeder Eintrag dokumentiert: **was**, **wie berechnet**, **warum so**, **wann verlässlich**.

Stand: 2026-06-12 (nach Sprint-3.0)

---

## Sample-Confidence-Felder (Sprint-3.0.A)

### `sample_confidence_tier`

**Was:** Klassifikation der College/Pro-Liga-Sample-Größe eines Spielers in drei Stufen: `Full`, `Partial`, `Insufficient`.

**Wie berechnet:**
```
Full:         GP ≥ 24 AND Min_per ≥ 25
Partial:      GP ≥ 15 AND Min_per ≥ 15  (und nicht Full)
Insufficient: Rest (Walk-on, Garbage-Time, mid-Season Injury)
```

Beide Conditions (GP UND Min_per) müssen erfüllt sein. Walk-on mit 30 Garbage-Time-Spielen aber 3 Min/Game zählt nicht als Full — Skill-Demonstration noisy. Umgekehrt: Verletzungs-Saison mit 10 Spielen à 38 Min ist Partial — Skill da, aber zu wenig Sample.

**Warum so:** Empirisch hergeleitet aus p10 der historischen NBA-Spieler 2018-2024 (n=185). Praktisch kein Spieler ist NBA-Spieler geworden, der unter diesen Schwellwerten lag.

**Wann verlässlich:** Threshold ist stabil über alle non-COVID Klassen (2017-2026 alle 30-42% Full). Klasse 2021 hat COVID-bedingt nur 17% Full — Framework spiegelt das korrekt wider, kein Bug.

**Source-of-Truth:** `data-pipeline/scripts/model_utils.py::classify_sample_confidence`

---

### `sample_n_effective`

**Was:** Sample-Size als kontinuierlicher Wert (`GP × Min_per`), als Proxy für statistische Power.

**Wie berechnet:**
```
sample_n_effective = GP × Min_per
```

**Warum so:** Total Minutes ist die theoretisch korrekte Sample-Größe für Per-100/Per-Min Stats. Boozer bei 33 GP × 33.4 Min = 1102 effektive Minuten. Walk-on bei 1 GP × 1.4 Min = 1.4 effektive Minuten.

**Wann verlässlich:** Direkter Multiplikator. NaN-safe (NaN → 0).

**Source-of-Truth:** `model_utils.py::compute_eligibility_columns`

---

### `sample_confidence_gp` / `sample_confidence_min`

**Was:** Binäre Flags (0/1) ob jeweils GP-Threshold (≥24) oder Min_per-Threshold (≥25) erfüllt ist.

**Warum so:** Macht den Tier-Klassifikator transparent — wer in Insufficient liegt, kann man sofort sehen, ob das wegen GP oder wegen Min_per ist.

---

## Bayesian-Shrinkage Felder (Sprint-3.0.B)

### Shrunkene Per-Sample-Features (`BPM`, `OBPM`, `DBPM`, `college_usg`, ...)

**Was:** Empirische Stats die per-Spieler-Saison aggregiert sind. Werden im 10c gegen Klassen-Prior geschrunken.

**Wie berechnet:**
```
Posterior = (n_obs × x_obs + n_prior × x_prior) / (n_obs + n_prior)

n_obs   = sample_n_effective
x_prior = Mean of feature in (year, cls) group, gefiltert auf Full-Eligible
n_prior = 50 (pseudo_count, empirisch kalibriert)
```

**Warum so:** Ohne Shrinkage: ein 30-Punkte-Garbage-Time-Auftritt produziert BPM +16, der dann × youth_mult zu age_adj_production 21 wird — methodisch wertlos. Mit Shrinkage: ein 1-Game-Sample wird zur Klassen-Mean (≈ 0.75 für 2026er BPM) geschrunken; ein 33-Game-Sample bleibt nahezu unverändert.

**Wann verlässlich:** Bei Full-Sample (≥1000 effective minutes): 95% obs / 5% prior — minimal Shrinkage. Bei Insufficient (<200 effective minutes): erheblich shrunken Richtung Klassen-Mean.

**Audit-Trail:** Original-Werte erhalten als `{col}_raw` (z.B. `BPM_raw`) für Reproduzierbarkeit und Debug.

**Geshrunkene Spalten:**
- BPM-Familie: `BPM`, `OBPM`, `DBPM`, `GBPM`, `OGBPM`, `DGBPM`
- Efficiency: `college_usg`, `TS_per`, `eFG`, `FT_per`, `TP_per`
- Per-100 box: `AST_per`, `TO_per`, `stl_per`, `blk_per`, `ORB_per`, `DRB_per`
- Rate: `college_ftr`

**Nicht geshrunken (eigene Sample-Behandlung):**
- Counting stats (`college_pts`, `college_ast`, `college_reb`) — Wertebereich eng genug
- Shooting (`tp_pct`, `ft_pct` in `shooting.skill.*`) — eigener Bayesian-Posterior in Shooting V2

**Source-of-Truth:** `model_utils.py::shrink_to_class_prior` + `shrink_features_inplace`

---

### `age_adj_production` (downstream Effekt)

**Was:** Age-adjusted BPM — die Production-Composite, die maßgeblich in das ML-Modell fließt.

**Wie berechnet:**
```
youth_mult = clip((22 - real_age) / 3, 0.1, 2.0)
age_adj_production = BPM_shrunken × youth_mult
```

**Warum so:** Ein 18-jähriger College-Fr mit BPM 11 hat Multiplier 1.33 → age_adj_prod ≈ 14.6. Ein 22-Jähriger mit gleicher BPM nur 1.1.

**Sprint-3.0 Änderung:** BPM ist jetzt **shrunken** (siehe oben). Vorher waren Mini-Sample-Walk-ons mit BPM 17 (von 1 Spiel) gleichwertig mit Boozer. Jetzt: Lakatos shrunken-BPM ≈ 2 → age_adj_prod ≈ 3.9. Boozer shrunken-BPM ≈ 15.2 → age_adj_prod ≈ 17.5.

---

## Multi-Layer Tier Output (Sprint-3.0.C)

### `tier_layered` (Profile-Field)

**Was:** Multi-Layer Tier-Klassifikation pro Spieler. Ersetzt die alte Single-Tier-Ansicht durch fünf Layer:

```json
{
  "point_estimate":    "Superstar",
  "modal":             "Role Player",
  "weighted_label":    "Role Player (32%)",
  "ci_95":             ["Negative", "Superstar"],
  "sample_confidence": "Full"
}
```

### `tier_layered.point_estimate`

**Was:** Headline-Tier-Label. Aus EV-Cuts (`ev_added_wins` × Klassen-Cuts).

**Wann verlässlich:** Bei Full-Confidence + dominanter Modal-Distribution. Bei Insufficient oder breiter Distribution → Modal-Sicht oder weighted_label nutzen.

### `tier_layered.modal`

**Was:** Mode der `tier_probs`-Distribution. Tier mit höchster Wahrscheinlichkeit.

**Warum so:** Vorsichtigste Sicht. Kingston Flemings hat tier_probs Mode = Role Player (32%), während ev_added_wins-basiertes point_estimate "Superstar" sagt. Modal zeigt was wahrscheinlich passiert, point_estimate zeigt was möglich ist.

### `tier_layered.weighted_label`

**Was:** Display-fertiger String. Wenn ein Tier dominant (Δ ≥ 10pp zum zweiten): "Tier (P%)". Sonst Range: "Tier1-Tier2 (P1%/P2%)".

**Beispiele:**
- Boozer (90% Superstar): `"Superstar (90%)"`
- Flemings (32% RP, 17% SS): `"Role Player (32%)"` (RP dominant)
- Doncic (45% SS, 51% AS): `"All-Star-Superstar (51%/45%)"` (eng)

### `tier_layered.ci_95`

**Was:** 95%-Konfidenz-Intervall über die Tier-Distribution. Cumulative Probability von unten (2.5%) und von oben (97.5%).

**Beispiel:**
- Boozer schmal: `["Starter", "Superstar"]` — drei Tiers
- Kingston Flemings breit: `["Negative", "Superstar"]` — gesamte Range, Modell ehrlich unsicher

**Source-of-Truth:** `model_utils.py::build_multi_layer_tier`

---

## Frontend-Display-Guidance

### Welcher Tier-Layer wird wann angezeigt?

| Use-Case | Layer | Begründung |
|---|---|---|
| Big Board Default | `point_estimate` | Backward-compat, schnelle Übersicht |
| Profile-Detail | `weighted_label` | Modellunsicherheit sichtbar |
| Pod-Vorbereitung | `weighted_label` + `ci_95` | ehrliche Range für Decisions |
| Comparison Tools | `modal` | konservative Sicht |
| Sample-Confidence-Filter | `sample_confidence` | "nur Full-Sample-Spieler anzeigen" |

### Frontend-Components (App.jsx)

```javascript
// Backend-Field durchgereicht im player object:
player.tierLayered              // { point_estimate, modal, weighted_label, ci_95, sample_confidence }
player.sampleConfidence         // "Full" | "Partial" | "Insufficient"
player.sampleNEffective         // numeric

// Reusable Components (in App.jsx definiert):
<TierBadge tier="Superstar" />
<SampleConfidenceBadge confidence="Full" nEffective={1102} />
<SampleConfidenceBadge confidence="Insufficient" compact />
<MultiLayerTierDisplay tierLayered={player.tierLayered} mode="confident" />
<MultiLayerTierDisplay tierLayered={player.tierLayered} mode="honest" />
```

---

## Pipeline-Source-Mapping

Für Debug und Audit — welche Datei berechnet welches Field?

```
sample_confidence_tier   ← model_utils.classify_sample_confidence
                           ← computed in 02k + 10c
sample_n_effective       ← model_utils.compute_eligibility_columns
BPM_raw etc.             ← shrink_features_inplace audit trail
BPM, OBPM, ...           ← shrink_to_class_prior (in 10c)
age_adj_production       ← downstream of shrunken BPM × youth_mult (in 10c)
proj_tier                ← 02j (ev_added_wins × EV-cuts)
tier_probs               ← 02j (cohort posterior + 02h/i probabilities)
tier_layered             ← model_utils.build_multi_layer_tier (in 11_compress)
```

---

## Lessons Learned

1. **Pseudo-Count Sensitivity:** Pseudo-Count = 50 wurde gewählt nach Top-25-Inspection. Pseudo-Count = 25 reicht nicht für vollen Outlier-Filter; Pseudo-Count = 200 shrinkt Top-Prospects zu aggressiv. Validation-Framework checkt das.

2. **Class-Prior aus Eligible-Sample:** Wichtig: Prior wird aus Full-Eligible-Spielern derselben Klasse gebildet — nicht aus allen Spielern. Sonst zirkulär (Mini-Sample-Outliers würden Prior verzerren).

3. **Single Source of Truth zahlt sich aus:** model_utils.py kapselt alle Sprint-3.0-Logik. 02k, 10c, 11_compress, sprint3_validate importieren alle von dort.

4. **LEAK-Regex Schutz vor Sample-Leakage:** Die `sample_*` Felder sind im `LEAK` regex inkludiert → werden automatisch nicht als ML-Features verwendet. Ohne diesen Schutz hätten wir versehentlich `sample_n_effective` in das ML-Modell gelassen → Data Leakage.

---

## Open Issues für nächste Sprints

| Field/Konzept | Issue | Sprint |
|---|---|---|
| International-Spieler | Brauchen eigene Threshold-Kalibration (FIBA/Euroleague-Skalierung) | 3.0.E |
| HS-Recruits ohne College-Tape | Recruit-Override für Top-100 ESPN-Rated → Partial-Tier | 3.0.E |
| Per-Feature Pseudo-Count | BPM braucht andere Shrinkage-Stärke als TS% — adaptive | 3.0.F |
| Confidence-aware ev_added_wins CI | `ev_added_wins` braucht eigenes CI proportional zu sample_n_effective | 3.0.G |
