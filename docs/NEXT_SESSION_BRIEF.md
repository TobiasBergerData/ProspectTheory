# NEXT_SESSION_BRIEF — Stand nach 2026-07-24

Kontext zuerst lesen: `data-pipeline/docs/SPRINT_5_12_13_SUMMARY.md` ·
`data-pipeline/docs/EL_HISTORY_BACKFILL_RUNBOOK.md` (inkl. Ergebnis-Block) ·
`docs/SITE_COPY_MAP.md`. Frontend: `frontend/src/App.jsx` (eine Datei, ~15.9k Zeilen).

## Erledigt am 2026-07-24 (alles committed + gepusht)

1. **Zwei-Lens-IA**: Top-Level NBA Draft | International Recruiting, Hash
   `lens=recruiting`, lens-abhängiger Player-Hero (`RecruitingHeroCard`),
   Recruiting Board gleichrangig (voller Pool).
2. **Draft Room** (NBA-Lens): 2–3 Spieler, Kurven-Overlay auf einer Peak-WA-Achse
   (`pwaBoardMixture`, gleiche Engine), Tier-Odds, Boosters/Limiters,
   Win-Now/Balanced/Rebuild-Empfehlung. Einstieg via ⚔ auf **allen** Board-Views;
   Auswahl als `room=<slugs>` im Hash (teilbar, überlebt Player-Abstecher —
   `lens=`/`room=` sind getrennte Hash-Params, nie den Ganz-Hash ersetzen!).
3. **Watchlist** (Recruiting-Lens): ★-Buttons, localStorage
   (`prospecttheory_recruiting_watchlist_v1`), eigene Ansicht. Design-Regeln:
   NBA-Locks bleiben in der Watchlist SICHTBAR (Flight-Risk-Monitoring);
   vom Jahrgangsfilter verdeckte Einträge werden als Fußzeile gelistet.
4. **Six-Factor-Experiment**: OOS-Test (scripts/validate_six_factors.py):
   4F offense-only R²≈0, 6F positiv, made-NBA-AUC 0.708→0.779, FTr redundant.
   UI-Umbau gebaut, auf User-Entscheid **revertiert** (BLK% ≠ Shot Suppression —
   Label überdehnt). Skript + Befund bleiben; Wiederaufnahme nur mit ehrlichem
   Labeling ("Defensive Activity") und nur auf User-Wunsch.
5. **EL-Anker (Pipeline)**: Backfill 2016–2026 für EL + Wettbewerbe + 10 Top-
   Domestic (301 Jobs, 0 Fails, 83k Rows, 47 min — Klick-Pagination ist schnell).
   Zweite Drift-Falle gefunden+gefixt: Gewichts-Skala komprimierte (EL 1.149 <
   statischer Kohorten-Kante 1.20) → Top-Kohorten-Kante jetzt DYNAMISCH aus der
   größten Leiter-Lücke (Commit 4caacc9). Endstand: **Tier 4 = p25 von N=538
   EL-Stammspielern, EuroLg-Disc +0.303** (vorher +0.226). Kanten in
   unified_board_scores.csv — live erst nach nächstem Refresh.

## Nächste Session — Reihenfolge

1. **Sicht-Checks live** (nach Sonntagslauf So 03:00, der die neuen Kanten
   deployt): Recruiting Board (Projected Levels/Value ▲ verschieben sich — ganze
   Leiter neu, ACB jetzt 1.011) · Watchlist-Flow · Draft-Room-Deep-Link
   (URL kopieren → neuer Tab → Auswahl kommt wieder) · Lens-Hero.
2. **Sonntagsläufe beobachten** (2–3 saubere Läufe) → `--deploy` scharfschalten.
3. **ANGT Youth Radar V1: GEBAUT (2026-07-24, gleiche Session).** Kette:
   `scrape_intl_2026 --include-youth` → `export_youth_radar.py` (GP-gewichtete
   Turnier-Aggregation, no-op-sicher, hängt in auto_intl_refresh) →
   `/api/youth` (FileResponse) → „🔭 Youth Radar" in der Recruiting-Lens.
   BEWUSST MODELLFREI (Roh-Produktion; Youth nicht kalibriert, kein Age-Adjust).
   Abdeckung: ANGT-Turnierserie + Jugend-Klubligen (Junior ABA, VTB Youth,
   Youth BCL) + **FIBA-U16–U20-Nationalteam-Turniere** (Euro A/B, U17/U19-WM;
   eigenes RealGM-Schema `/national/tournament/{id}/{slug}/0/stats/{JAHR}/...`,
   Kalenderjahr-Semantik → letzter + laufender Sommer, NATIO_YOUTH_EVENTS in
   scrape_intl_2026). Erst-Scrape + Task-Neuregistrierung mit `-IncludeYouth`
   macht der User.
   **V2-Kandidaten:** Age via Bio-Scrape (06a) für die Youth-Kohorte ·
   Youth-Historie (mehrere Saisons → Wiedererkennung Jahr über Jahr) ·
   Watchlist-Anbindung (Youth-Spieler sind nicht im Board-Pool — braucht
   eigenes Resolving) · per-Event-Filter im Radar, falls die Mischliste
   (U16 bis U20) unübersichtlich wird.
4. **Cross-Market-Views (2026-07-24, gleiche Session):** Recruiting-Lens hat
   jetzt 5 Ansichten — Board (+ Source-Filter All/College/International) ·
   Watchlist · Level-Up (Climb-Sortierung: projiziert − aktuell, Liga-
   Dominatoren) · College Targets (Internationals ≤21 für NCAA-Programme,
   NIL-Framing, Added-Wins-Skala als dokumentierte Ausnahme, Eligibility-
   Disclaimer) · Youth Radar. Alles client-seitig aus dem Board-Payload.
4b. **Markt-Tool-Ausbau (2026-07-24, Abend-Block):** Recruiting-Lens hat jetzt
   7 Ansichten + erweiterte Filter (Level · Age U19/U21/U23 · Role/Archetyp ·
   🕵 Lurkers only). NEU: **Portal Radar** (NCAA-Low/Mid-Major nach validierter
   Peak-WA-Skala — bewusst OHNE diffuse NCAA-Intl-Level; kein Portal-Status-
   Tracking, ehrlich gelabelt) · **Find me another / Similar** (Ersatzsuche:
   Perzentil-Distanz über 9 Kanäle, nur verpflichtbare Ergebnisse, Fit ≠
   Qualität) · **Lurker-Signal** (backtestet an 3.840 Rollenexpansionen:
   Effizienz-Erhalt über Liga-Schnitt bei +4pp-USG-Sprüngen, aber P(Rolle)
   nur 11.9% vs 9.6% → Markt-Ineffizienz; Test C in validate_level_up.py).
   V2-Ideen: Team-Needs-Profil (Kader-Eingabe) · Watchlist-Digest aus dem
   Sonntagslauf · Preis-/Vertragsdaten (externe Quelle nötig).
4c. **Usage Load Curve (2026-07-24, Spät-Block):** BartTorvik-Stil per-Game
   Usage×Effizienz im Roles-Tab (`UsageLoadCurve`, aus p.gameLogs u/o2 — kein
   neuer Fetch). Drei ehrliche Zonen: proven (≥3 Spiele, ≥Peer−8) · fall-off ·
   untested ("nie gefordert ≠ gescheitert"). WICHTIG: Prädiktions-Test NEGATIV
   (validate_usage_ceiling.py: n=146, PIE-Proxy, partial rho ≈ 0, Archetyp-
   Cutoffs nicht schätzbar) → Sektion ist bewusst DESKRIPTIV, keine Rollen-
   Prognose. Wiedervorlage wenn PBP-Ära-Outcomes reifen (~2028, n>400) oder
   NBA-USG-Daten angebunden. V2-Ideen: Hover-Tooltips pro Punkt (Gegner/Datum),
   Multi-Season-Overlay, Intl-PBP-Anbindung (EuroLeague-PBP existiert).
4d. **League-Awards-Pipeline (2026-07-24, Nacht-Block): GEBAUT, Scrape ausstehend.**
   RealGM hat per-Liga-Awards-DBs (MVP, **Best Young Player**, All-League, …).
   URL-Schema gelöst: `/awards/by_season/{ENDJAHR}` direkt — KEIN Selenium-
   Dropdown nötig. Kette: `scrape_league_awards.py` (74 Ligen, rückwärts-Scan
   mit Early-Stop, checkpoint-sicher, DB `league_awards` + `league_awards_log`
   = Abdeckungs-Fenster) → `build_award_features.py` (dokumentierte Regexes;
   „Newcomer" bewusst NICHT young; Monatsnamen-Falle „MVP of October" gefixt;
   by_season-CSV ohne Look-Ahead) → **GATE** `validate_award_signal.py`
   (Test E: Climb-Test + P(NBA)-Quintile; Entscheidungsregel VORAB fixiert).
   In auto_intl_refresh: wöchentlich `--current-only` (~5 min) + Feature-Build
   (no-op-sicher). **Modell/UI-Integration erst NACH positivem Gate** —
   sonst nur deskriptives 🏆-Badge (analog Usage Load Curve). Voll-Backfill
   (~60-90 min) macht der User am Host: docs/AWARDS_RUNBOOK.md.
5. **Stats Lab → Cross-Market-Datenbank ausbauen** (nächster größerer Block):
   Intl-Spalten (pred_intl_tier, intl_level_ev, p_intl_career, Flight Risk,
   Value-Delta) in export_stats_lab.py + Column-Picker + eigenes Preset
   „Recruiting" — dann ist das Lab die echte Such-Datenbank für Colleges UND
   intl Klubs (Rollen/Perzentile/Level kombinierbar). Recruiting-Ansichten
   haben seit 2026-07-24 bereits Level- + Alters-Filter (client-seitig).
6. Kleinvieh: G-League-Historie (URL-Discovery, 404-Problem von April) ·
   R2 aktivieren (braucht Cloudflare-Account, Code liegt bereit).

## Geparkt (bewusst, nicht vergessen)

- Tier-3/4-Trennschärfe: Korridor ist schmal (Kanten 1.011 vs. 1.031, Blend-
  Verwässerung durch Domestic-Minuten der EL-Spieler). Nur anfassen, falls
  OOT-Disc kippt; Hebel: Kohorten-peak3 nur über Top-Wettbewerb-Saisons.
- Six Factors v2 (ehrliches Labeling) · EL-Historie vor 2016 · intl TIER_REP
  (1.26-Repräsentant liegt über EL-Gewicht 1.149 — Value-▲-Skala leicht
  gestaucht, Ranking unberührt; bei Gelegenheit datengetrieben ableiten).

## Arbeits-Setup (Fallen)

- Verify: `npx esbuild App.jsx --bundle --loader:.jsx=jsx --jsx=automatic
  --external:react --external:react/jsx-runtime --external:recharts
  --external:react-dom --outfile=/dev/null` + NUL-Byte-Check.
- Git-Push macht immer der User am Host.
- Sichtbare Copy: Englisch, keine Sprint-Marker, keine Refresh-Zahlen hardcoden;
  neue Elemente → beide Erklärstellen im selben Commit (SITE_COPY_MAP).
- Cloud-Session: Staging-Kopien gleicher Pfade können auf alte Snapshots
  zurückfallen — bei Zweifel Datei am Host unter neuem Namen kopieren und
  diese stagen (Byte-Größe gegen Host prüfen).
