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
| **Lens-Switch** (Top-Level: NBA Draft \| International Recruiting) | Kurz-Caption unter den Lens-Buttons („Who should we draft?" / „Who should we sign?") | Quick: „What This Is" (Zwei-Lens-Absatz, erster Absatz) |
| Big Board **Table** (Added Wins, NBA Tier, ▲AS+/▼out — NBA-Lens) | Header-Box direkt über der Tabelle (`boardView === "table"`) | Quick: „What This Is" |
| **Draft Room** (NBA-Lens: Kurven-Overlay, Tier-Odds, Win-Now/Balanced/Rebuild; Einstieg via ⚔ auf Table/Curves/Tier-Board, Auswahl im URL-Hash `room=` teilbar) | Header-Text in `DraftRoomView` (+ Footer-Zeile: height-normalized, ▼out-Definition) | Deep: „Draft Room" (nach „GM Risk Profile") |
| Big Board **Curves** (Outcome Distributions) | Header in `OutcomeCurveBoard` (Peak-WA-Lineal, Richtungs-Cue) | Quick: „GM Risk Profile" |
| Big Board **Tier Board** | Kurzzeile in `TierBoardView` | Deep: Archetype-Abschnitte |
| **International Recruiting Board** | Header in `IntlBoardView` (Buying-Guide-Framing, Value ▲, NBA risk, Comps, ★-Hinweis) | Deep: „International Adjustments" + Pipeline-Box „Intl Career Projection" |
| **Watchlist** (Recruiting-Lens; ★-Buttons, localStorage, Locks bleiben sichtbar) | Header-Text in `IntlBoardView` (`watchOnly`-Variante) + Empty-State | Deep: „International Adjustments" (Watchlist-Satz) |
| **Youth Radar** (Recruiting-Lens; ANGT + Jugend-Klubligen + FIBA-U16–U20-Natio-Turniere, modellfrei, `/api/youth`) | Header-Text in `YouthRadarView` + Empty-States | Deep: „Youth Radar (clubs + national teams, U16-U20)" |
| **College Targets** (Recruiting-Lens; Internationals ≤21 für NCAA-Programme, NIL-Framing, Eligibility-Disclaimer) | Header-Text in `CollegeTargetsView` | Deep: „Cross-Market Views" |
| **Level-Up Portal** (Recruiting-Lens; Climb-Sortierung = projiziert − aktuell, Liga-Dominatoren) | Header-Text in `LevelUpView` | Deep: „Cross-Market Views" |
| **Source-Filter** (Recruiting Board: All / College / International) | Chip-Tooltips im Board-Header | Deep: „Cross-Market Views" |
| **Portal Radar** (Recruiting-Lens; NCAA-Low/Mid-Major nach Peak-WA, kein Portal-Status-Tracking!) | Header-Text in `PortalRadarView` | Deep: „Cross-Market Views" |
| **Find me another / Similar** (Ersatzsuche; Fit = Perzentil-Distanz, keine Qualitätsgleichheit) | Header-Text + Footer in `SimilarView` | Deep: „Cross-Market Views" |
| **Lurker-Badge 🕵 + Filter** (Rollen-Headroom, backtestet) | `LURKER_TIP`-Tooltip (eine Quelle für alle Views) | Deep: „Cross-Market Views" (Lurkers-Absatz) |
| **Usage Load Curve** (Roles-Tab; per-Game Usage×Effizienz, proven/fall-off/untested — DESKRIPTIV, Prädiktions-Test negativ) | `Sec sub=` in `UsageLoadCurve` | Deep: „Usage Load Curve (Roles tab)" |
| **Award-Badge 🏆** (Recruiting-Board · Level-Up · College Targets · Similar · Recruiting-Hero; deskriptiv, `/api/awards`, Namens-Join mit Ambiguitäts-Drop — bewusst KEIN Modell-Feature, Gate Test E in validate_award_signal.py) | `AWARD_TIP`-Tooltip (eine Quelle: `AwardBadge` + Hero-Zeile) | Deep: „Cross-Market Views" (League-Awards-Absatz) |
| Player **Projection**-Tab (Hero, Tier Forecast, Outcome Curve) — Hero ist **lens-abhängig**: NBA-Lens = ppWA + Tier-Odds, Recruiting-Lens = `RecruitingHeroCard` (Projected Level + Value + Comps, NBA nur als Flight Risk) | Hero-Tooltips (beide Varianten) + `Sec sub=` der beiden Kurven-Sektionen | Deep: „Methodology & Model Documentation" (NBA) · Deep: „International Adjustments" (Recruiting) |
| **Comps**-Tab (v5) | `Sec sub=` in `CompsV5Tab` | Deep: `sections`-Eintrag „Comps Tab" |
| **Mind**-Tab | Sec-Subs im Tab | Quick: „Mind Tab" + Caveat-Box |
| **Research-Bereich** (Top-Level, Toggle: Archetype Value Bands \| Front Office Lab) | Toggle-Buttons in `ResearchTab` (kein Erklärtext nötig, die beiden Views tragen ihren eigenen) | Deep: „Front Office Lab (Research area)" |
| **FO-Lab: Gate-Banner** (setzt den Wahrheitsanspruch der GANZEN Seite; Text hängt an `gate.verdict` aus dem Payload) | `FoGateBanner` — **einzige Stelle**, die „what happened" vs. „Track Record" entscheidet. NIE hart auf einen der beiden Texte umstellen: der Gate liefert das Urteil, die Copy folgt. | Deep: „Front Office Lab (Research area)" (Absatz „WHY THERE IS NO GM RANKING") |
| **FO-Lab: Regimes** (Regime-Karten: PVA + CI, Risk-Gauge, Passed-over-Zeile, Tilts mit **drei** Markern ● / ◐ / ○, Pick-Range-Profil, Hits/Misses mit „best available") | Header-Text in `FoRegimesView` + Legende unter dem Karten-Grid (erklärt alle drei Marker) + `FoTilt`-Zeilen | Deep: „Front Office Lab (Research area)" (Absätze PVA + WHAT DOES HOLD UP IS BEHAVIOUR) |
| **FO-Lab: Tilt-Marker ● / ◐ / ○** (zwei Baselines je Zelle, Konzept §11.1: ● = überlebt FDR gegen **Zeitgenossen** am selben Draft-Platz, ◐ = nur gegen den Verfügbarkeits-Pool → Draft-POSITIONS-Effekt, ○ = Richtung ohne Test) | `FoTilt` — das Urteil folgt `sig_peer`, nicht `sig`. **Nie auf einen Marker zurückbauen**: der Pool-Baseline-Treffer ist mit der Draft-Position konfundiert, und ein einzelnes ● an einer ◐-Zelle wäre die Behauptung, die genau dieser Umbau widerlegt hat. Legende in `FoRegimesView` ist die einzige Erklärstelle der Marker-Semantik. | FO-Lab Method, Abschnitt „Blind spots — two baselines, and why they disagree" |
| **FO-Lab: Pick-Range-Profil** (aufgeklappte Karte, „Where in the draft — by pick range": je Band L/M/S die Tripel gewählt / verfügbar / Zeitgenossen für Alter + International, Positionszeile, Band-PVA mit `n_ev` graded, Passed-over-Anteil) | `FoBandRow` + Schlusszeile „Descriptive only — no significance test at band level, the samples are too thin." — **diesen Satz nie entfernen**: die Bänder sind bewusst ungetestet, und ohne ihn liest sich das Profil wie ein Befund. Nenner-Naht `n = n_sh of n` (Picks mit bekannter Position von allen) bleibt sichtbar. | FO-Lab Method, Abschnitt „Where in the draft — pick ranges" |
| **FO-Lab: Konsens-Nicht-Befund** (Block über dem Karten-Grid, „Do some front offices draft against consensus? — tested, and no") | `FoConsensusNote` — Ergebnis eines Permutationstests auf Regime-Varianz der Passed-over-Anteile; alle Zahlen aus `data.consensus`. Enthält eine **Selbstwarnung**: wird `c.stable` je `true`, blendet die Komponente einen Amber-Hinweis ein, dass diese Copy überholt ist. Nie zu „drafting against consensus is a trait" umschreiben, ohne dass der Test das trägt. | FO-Lab Method, Abschnitt „Drafting against consensus" |
| **FO-Lab: Karte ohne bewertbaren Pick** (`n = 0`, `n_all > 0`: alle Auswahlen noch im Zensur-Fenster — aktuell Connelly MIN, Ainge UTA, Winger WAS) | `FoRegimeCard`, Zweig `ungraded`: statt PVA-Zahl steht **„n/a / not gradeable yet"**, statt CI ein Satz, der die Zensur benennt. Risk-Gauge und Tilts bleiben — sie sind gemessen. **Nie auf `0.00` zurückbauen**: eine Null wäre hier eine Behauptung, keine Messung. Erreichbar nur über Filter „min graded picks = 0". | Konzept §8.1b |
| **FO-Lab: Karte mit n < 5** (`gradeable = false`: eine PVA-Zahl existiert, ist aber von einzelnen Spielern dominiert — 34 von 136 Karten, u. a. GSW Riley mit +15.66 auf zwei Picks) | `FoRegimeCard`, Zweig `thin`: Zahl bleibt stehen, aber **neutral grau statt grün/rot**, Label **„n < 5 — single-player noise"** statt „PVA / pick", Tooltip mit der Begründung. **Nicht ausblenden** — eine leere Karte wäre auch eine Behauptung; **und nicht einfärben** — die Farbe ist auf dieser Seite die Einordnung. Erreichbar nur über Filter „min graded picks" < 8. Assertion im Render-Test prüft beide Richtungen (Hinweis da bei n < 5, weg bei n ≥ 5). | Konzept §8.1d |
| **FO-Lab: Jahresband der Karte** (`{team} · {from}–{to}`) | `FoRegimeCard`-Header. Das Band kommt aus den tatsächlich zugeordneten Picks, nicht aus einer Amtszeits-Tabelle. Seit dem Amtszeit-Fix (Konzept §8.1c) überspannt es keine Fremdjahre mehr: unterbrochene Amtszeiten derselben Person sind **zwei Karten** (Wallace MEM 2007–2011 / 2014–2018, Bird IND, Walsh IND). **Nie wieder zu einer Karte zusammenfassen** — der gemittelte Wert beschreibt dann keine der beiden Amtszeiten (Simpson). | Konzept §8.1c |
| **FO-Lab: Draft Replay** (Draft × Pick: gewählt vs. bester Verfügbarer ≤ +30, „Picked for"/„In charge" getrennt) | Header-Text in `FoReplayView` + Amber-Hinweis bei nicht bewertbaren Klassen (Right-Censoring) | Deep: „Front Office Lab (Research area)" (Absätze ANALYSIS UNIT + LIMITS) |
| **FO-Lab: League Board** (Streudiagramm Risiko × PVA, Punktgröße = n; handgebautes SVG, weil `recharts.ScatterChart` nicht importiert ist) | Header-Text in `FoBoardView` — sagt ausdrücklich, dass die Form eine Wolke ist und die y-Achse die vom Permutationstest als Zufall ausgewiesene ist | Deep: „Front Office Lab (Research area)" |
| **FO-Lab: Method** (sieben Abschnitte: Attribution, PVA, kein Ranking, Blind Spots/zwei Baselines, Pick-Ranges, Konsens, neun Limits) | — (**ist selbst der maßgebliche Methodentext**; die Methods-Deep-Zeile bleibt bewusst die Kurzfassung, damit die Zahlen nur an EINER Stelle stehen und nicht driften). **Alle Zahlen darin sind aus dem Payload abgeleitet, keine einzige hart geschrieben** — Slot-Erwartung Pick 1 je Ära aus `slot_curve`, Gate-Werte aus `gate`, FDR-Nenner aus `window.n_tilt_cells`, Permutationszahl aus `window.n_perm_peer` (reist als Spalte in `fo_regime_tilts.csv` mit, damit sie nicht an zwei Stellen gepflegt wird), Omnibus-p **je Dimension** aus `gate.behaviour_dims`. Neue Zahl in diesem Text? Dann zuerst ein Feld im Export, nicht ein Literal im JSX. | Deep: „Front Office Lab (Research area)" verweist hierauf |
| **Live Validation** (Methods, oben) | — (ist selbst der Explainer) | speist sich aus `/api/model-card` — nie von Hand editieren |
| Pipeline-Diagramm (Methods Deep) | — | `PipelineDiagram` in `MethodologyTab` — bei Modell-Umbau IMMER mitziehen |

**Automatisch geprüft (FO-Lab):** `frontend/tests/fo_render_test.mjs` rendert den
Block zwischen `// ─── FO_BLOCK_START` und `// ─── FO_BLOCK_END` aus `App.jsx`
serverseitig gegen den echten Payload und prüft zwölf Aussagen dieser Map —
u. a. Marker-Semantik ● / ◐, den einschränkenden Halbsatz an jeder ◐-Zelle, den
FDR-Nenner, die Permutationszahl und die Zensur-Sprache. Regel 2 („keine
hardcodierten Zahlen") ist für diese Seite damit nicht nur eine Bitte, sondern
ein roter Test. **Die Schnittmarken in `App.jsx` nicht entfernen**, und neue
FO-Copy innerhalb der Marken anlegen — sonst prüft der Test sie nicht.

## Lens-Sprachregel (IA: zwei gleichrangige Top-Level-Lenses)

- **NBA-Lens** spricht in: Added Wins · Tier-Odds · Bust-Risk (▼out).
- **Recruiting-Lens** spricht in: Projected Level · Value ▲/▼ · Flight Risk.
- **Youth Radar** spricht nur in Roh-Produktion (PTS/REB/AST/…, TS%) — NIE in
  Modell-Skalen (keine Tiers, Levels, Added Wins; U18 ist nicht kalibriert).
- **College Targets** ist die dokumentierte AUSNAHME: spricht in Added Wins +
  NBA-Track, obwohl in der Recruiting-Lens — Publikum sind College-Programme,
  für die NBA-Upside Kaufargument ist. Level-Up spricht in Level/Climb
  (Recruiting-Skala). Eligibility-Disclaimer bei College Targets nie entfernen.
- Skalen **nie mischen** — je Lens führt genau eine Skala. Auf der Player-Page
  entscheidet die aktive Lens, welcher Hero führt; die jeweils andere Welt
  erscheint nur als Ein-Zeilen-Verweis (z. B. „NBA Flight Risk: x%").

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
- Research / Front Office Lab: **deskriptive Draft-Historie je Regime** —
  „Pick Value Added" (realisierter peak-WA minus Slot-Erwartung, ex post),
  „availability pool", „contemporaries" (Zeitgenossen im selben Jahr × Draft-Band),
  „leans toward / avoids", „risk appetite", „reach", „passed over".
  NICHT: Track Record, GM-Ranking, „best drafter", Prognose aus PVA.
  Die Sprachwahl ist **datenabhängig**: sie folgt `gate.verdict`, nicht
  unserem Geschmack (siehe Zeile „FO-Lab: Gate-Banner").
- Zwei-Baselines-Sprache (Konzept §11.1): gegen den **Pool** heißt „vs. the pool
  only … in line with contemporaries at the same slot" — nie „significant" ohne
  Zusatz, weil der Pool mit der Draft-Position konfundiert ist. Nur gegen
  **contemporaries** darf „leans toward / avoids" ohne Einschränkung stehen.
- Konsens-Sprache: **„passed over"** (Anteil des noch verfügbaren Boards, den der
  Konsens höher rankte) — hat eine natürliche Null (0 = Konsens-BPA genommen).
  Der Liga-Befund ist ein **Nicht-Befund**: „not a distinguishing trait". NICHT:
  „drafts against consensus", „contrarian GM", und daraus **kein** Ranking.
- Zensur-Sprache im FO-Lab: **„not gradeable yet"** (Regime ohne bewertbaren
  Pick) und **„n of n_all"** (bewertbar von gesamt). NICHT: „no data",
  „keine Picks", „0.00" — die Picks existieren, nur ihr Ergebnis noch nicht.

## Bekannte Copy-Altlast (2026-07-25 gefunden, noch offen)

Der Methods-Deep-`sections`-Array in `App.jsx` enthält **sechs doppelte
`cat`-Labels** — drei davon byte-identisch, drei mit unterschiedlichem Text
unter demselben Titel: „International Adjustments", „Youth Radar", „Cross-Market
Views", „Usage Load Curve", „Possession Impact (CFFR)", „Tier Feasibility".
Der Leser sieht diese Abschnitte doppelt, bei den drei abweichenden Paaren mit
zwei verschiedenen Erklärungen. Genau der Drift, gegen den diese Map gebaut
wurde. **Nicht blind bereinigt**, weil bei den abweichenden Paaren eine
inhaltliche Entscheidung nötig ist, welche Fassung gilt.
