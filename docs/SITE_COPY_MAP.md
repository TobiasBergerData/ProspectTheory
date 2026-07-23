# SITE_COPY_MAP — Wo jedes Site-Element erklärt wird

**Zweck:** Verhindert, dass UI-Erklärtexte vom tatsächlichen Modell/Feature-Stand
wegdriften (wie beim α-Blend-Narrativ, das das Modell um Monate überlebt hat).

## Die drei Pflege-Regeln (Definition of Done)

1. **Element geändert/entfernt → beide Erklärstellen im selben Commit anfassen:**
   den Inline-Explainer am Element UND den Methods-Tab-Abschnitt. Diese Map sagt wo.
2. **Keine Zahlen hardcoden, die sich mit Refreshes ändern** (r-Werte, Liga-Anzahl,
   Trainings-N, Liga-Gewichte). Stattdessen: auf die Live-Validation-Sektion
   verweisen (speist sich aus `/api/model-card`, auto-aktualisiert) oder generisch
   formulieren („recomputed on every refresh").
3. **Keine Entstehungsgeschichte in sichtbarem Text:** keine Sprint-Nummern, keine
   Datums-/Namens-Marker, kein „previously/was". Historie gehört in Code-Kommentare
   und `data-pipeline/docs/`.

## Element → Erklärstellen (alle in `frontend/src/App.jsx`)

| Site-Element | Inline-Explainer | Methods-Tab-Abschnitt |
|---|---|---|
| Big Board **Table** (Added Wins, NBA Tier, ▲AS+/▼out) | Header-Box direkt über der Tabelle (`boardView === "table"`) | Quick: „What This Is" |
| Big Board **Curves** (Outcome Distributions) | Header in `OutcomeCurveBoard` (Peak-WA-Lineal, Richtungs-Cue) | Quick: „GM Risk Profile" |
| Big Board **Tier Board** | Kurzzeile in `TierBoardView` | Deep: Archetype-Abschnitte |
| **International Recruiting Board** | Header in `IntlBoardView` (Buying-Guide-Framing, Value ▲, NBA risk, Comps) | Deep: „International Adjustments" + Pipeline-Box „Intl Career Projection" |
| Player **Projection**-Tab (Hero, Tier Forecast, Outcome Curve) | Hero-Tooltip + `Sec sub=` der beiden Kurven-Sektionen | Deep: „Methodology & Model Documentation" |
| **Comps**-Tab (v5) | `Sec sub=` in `CompsV5Tab` | Deep: `sections`-Eintrag „Comps Tab" |
| **Mind**-Tab | Sec-Subs im Tab | Quick: „Mind Tab" + Caveat-Box |
| **Live Validation** (Methods, oben) | — (ist selbst der Explainer) | speist sich aus `/api/model-card` — nie von Hand editieren |
| Pipeline-Diagramm (Methods Deep) | — | `PipelineDiagram` in `MethodologyTab` — bei Modell-Umbau IMMER mitziehen |

## Aktueller Modell-Sprachgebrauch (Single Source of Truth für Copy)

- Headline: **two-stage hurdle model** — P(reaches NBA) × expected peak → projected
  peak Wins Added (LightGBM, 30 era-adjusted features).
- Tier-Odds: **calibrated ordinal model, anchored to historical base rates**
  (~1 Superstar, ~4 All-Stars pro Klasse). NICHT: Comp-Cohort-Spread, α-Blend,
  ev_recal/exp_wa, humble bonus, RF Proximity, HistGradientBoosting.
- Kurven: **6-Tier-Gauss-Mischung auf der Peak-Wins-Added-Achse** — identisch auf
  Player-Page und Curves-Board (eine Quelle, eine Achse).
- International: **sustained 3-year-peak league level**, 5 kohorten-verankerte
  Tiers, ~19k historische Karrieren, kNN-Career-Comps — Framing: Einkaufshilfe
  für internationale Front Offices (keine Draft-Logik).
- Liga-Gewichte: **empirisch aus Bridge-Spielern, NCAA=1.0, shrunk bei dünner
  Evidenz, jede Woche neu berechnet** — nie konkrete Gewichtswerte in Copy.
