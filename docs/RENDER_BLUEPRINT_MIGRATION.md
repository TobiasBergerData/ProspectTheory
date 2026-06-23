# Render Blueprint Migration — Runbook (#61)

**Ziel:** Den bestehenden Dashboard-managed Service `prospecttheory-data`
durch einen Blueprint-managed Service (`render.yaml` als Source-of-Truth)
ersetzen, ohne Downtime, ohne Datenverlust, ohne API-Ausfall.

**Status:** Plan steht (2026-06-23). Cutover ist manueller Tobias-Schritt
(Render Dashboard + DNS-Steuerung), kein automatisierbarer Code-Change.

---

## Warum überhaupt migrieren

Heute lebt die Service-Config halb im Repo (`build.sh`, `requirements.txt`,
Code), halb im Dashboard (Region, Plan, Root Directory, Build Command,
Start Command, envVars). Das ist drift-anfällig:

- 2026-06-11 wurde der Build Command im Dashboard versehentlich kaputt
  geschrieben — `requirements.txt`-Lookup ging verloren, Build crashte.
  Symptom: Render Build-Logs zeigen `pip install -r requirements.txt:
  No such file or directory`. Root cause: 800-Zeichen-String im
  Dashboard-Build-Command-Feld editiert ohne Versionierung.
- Wenn der Service verloren geht (Account-Lock, Region-Outage, manuelles
  Löschen), muss alles neu aufgesetzt werden — aus dem Gedächtnis.

Blueprint-Modus löst beides: die ganze Spec ist in `render.yaml`,
PR-reviewbar, reproduzierbar bei Disaster Recovery.

---

## Voraussetzungen prüfen (vor der Migration)

Checkliste — alle Punkte müssen erfüllt sein, bevor du startest. Skipping
einen davon ist der häufigste Grund warum Migrations brechen.

| Check | Wie | Erwartung |
|---|---|---|
| `render.yaml` reflektiert Dashboard-Stand | Dashboard öffnen, Settings durchklicken, Werte mit render.yaml vergleichen | Region, Plan, Root Directory, Build Command, Start Command, healthCheckPath, alle envVars identisch |
| Custom Domain ist auf den alten Service gepinnt | Dashboard → Settings → Custom Domains | `api.prospecttheory.io` (oder dein Domain) listet alten Service als Target |
| DNS-Provider ist erreichbar | dein DNS-Anbieter (Cloudflare / Namecheap / etc.) Login funktioniert | Du kannst CNAME-Records bearbeiten |
| `build.sh` läuft sauber durch | letzter Deploy-Log im Dashboard | Pipeline-Steps grün, "BUILD COMPLETE — Validation" am Ende |
| Frontend nutzt keine alten Service-internen URLs | grep im Frontend nach `prospecttheory-data` oder Hardcoded-Render-URLs | nur die öffentliche Domain wird genutzt |

Falls einer der Checks fehlschlägt: erst fixen, dann migrieren.

---

## Migration-Strategie: Parallel-Deployment + DNS-Cutover

Die sauberste Methode — beide Services laufen kurz parallel, DNS schaltet
um, alter Service wird gelöscht.

```
Phase 1: Blueprint-Service erstellen (parallel zum alten)
Phase 2: Custom Domain umziehen (DNS CNAME ändern)
Phase 3: Alten Service löschen (nach DNS-TTL-Wartezeit)
```

### Phase 1 — Blueprint-Service erstellen

1. **Render Dashboard → New → Blueprint.**
2. **Repository verbinden:** `TobiasBergerData/ProspectTheory`,
   Branch `main`.
3. Render erkennt `prospecttheory-web/render.yaml` automatisch.
   *Wichtig:* die `render.yaml` liegt in `prospecttheory-web/`, nicht im
   Repo-Root. Falls Render Sie nicht findet, wähle den Sub-Directory
   `prospecttheory-web` als "Blueprint Root".
4. **Review:** Render zeigt die geplante Service-Definition. Stelle
   sicher dass:
   - Service-Name: `prospecttheory-api` (NEUER Name, nicht
     `prospecttheory-data` — der ist vom alten Service belegt)
   - **Plan: `free`** — explizit prüfen, NICHT auf einen kostenpflichtigen
     Plan upgraden lassen. `render.yaml` schreibt `plan: free` fest;
     falls Render im Setup-Dialog einen anderen Plan vorschlägt, manuell
     auf Free zurücksetzen.
   - Region: `oregon`
   - Root Directory: `backend`
5. **Apply.** Render baut den neuen Service. Dauer: 8-15 Min (ganze
   build.sh-Pipeline durchläuft).
6. **Warte auf "Live"-Status.** Notiere die Render-internal URL (etwas
   wie `prospecttheory-api-xxxx.onrender.com`).

### Phase 2 — Validierung des neuen Service

Bevor DNS umgeschaltet wird, neuen Service direkt prüfen:

```bash
curl https://prospecttheory-api-xxxx.onrender.com/
# → erwartet: FastAPI-Response (200 + JSON)

curl https://prospecttheory-api-xxxx.onrender.com/api/board
# → erwartet: Board-JSON mit Spielern für die aktuellen Jahre

curl https://prospecttheory-api-xxxx.onrender.com/api/years
# → erwartet: Liste der verfügbaren Draft-Jahre
```

Wenn ein Endpoint 5xx wirft: NICHT migrieren. Bug im neuen Service erst
fixen, dann Phase 3.

Frontend lokal gegen den neuen Service testen (falls Frontend env-vars
sich auf die API-URL beziehen):

```powershell
cd C:\Users\tobia\ProspectTheory\prospecttheory-web\frontend
$env:VITE_API_BASE = "https://prospecttheory-api-xxxx.onrender.com"
npm run dev
```

Browse durch die App: Board lädt, Player-Profile öffnen, Stats Lab läuft.

### Phase 3 — DNS-Cutover

Sobald der neue Service grünes Licht hat:

1. **DNS-Provider öffnen** (Cloudflare / Namecheap / Route53 / etc.).
2. **CNAME-Record für `api.prospecttheory.io`** (oder deine
   Frontend-Domain) ändern:
   - Vorher: `<alter-service>.onrender.com`
   - Nachher: `<neuer-service>.onrender.com`
3. **TTL beachten:** Setze TTL auf 300 (5 Min) bevor du änderst, oder
   warte die alte TTL ab. Während der Übergangszeit landen Requests
   gemischt auf beiden Services — beide laufen, kein Problem.
4. **In Render Dashboard:** beim neuen Service unter Settings → Custom
   Domains: `api.prospecttheory.io` hinzufügen. Render prüft DNS und
   stellt SSL bereit.
5. **Beim alten Service:** Custom Domain entfernen (sobald Render beim
   neuen die Domain übernommen hat).

**Vorsicht bei diesem Schritt:** zwei Services können nicht gleichzeitig
auf dieselbe Domain hören — Render trennt einen automatisch. Das ist
OK, aber falls SSL-Renewal noch nicht durch ist, gibt's evtl. einen
30-60 Sekunden Ausfall.

### Phase 4 — Alten Service löschen

Nach 24 Stunden ohne Probleme:

1. **Render Dashboard → alter Service (`prospecttheory-data`) → Settings
   → Delete Service.**
2. Bestätigung tippen.
3. **WICHTIG:** Vorher Backup ziehen falls noch Logs oder Daten am Service
   hängen, die du behalten willst.

Done. `render.yaml` ist Source-of-Truth, alle Service-Änderungen jetzt
über PR + Merge.

---

## Rollback-Plan

Wenn nach Phase 3 Probleme auftauchen (5xx, Endpoint-Mismatch, Frontend
broken):

1. **DNS sofort zurück** auf alten Service-Hostname.
2. **Phase 4 NICHT ausführen** — alten Service nicht löschen bis Problem
   geklärt ist.
3. **Logs vergleichen:** Render Dashboard → neuer Service → Logs vs
   alter Service → Logs. Was ist anders?
4. Typische Probleme:
   - **envVar fehlt:** `DATA_DIR` oder andere SECRET-vars sind im
     Dashboard-managed Service gesetzt, in `render.yaml` aber nicht
     dokumentiert. Fix: in `render.yaml` ergänzen, neuer Blueprint
     baut neu.
   - **Plan-Drift:** falls der alte Service unbemerkt auf einen
     kostenpflichtigen Plan gewechselt war (durch versehentlichen Klick
     im Dashboard), würde der neue Free-Tier-Service OOM-en. Vor der
     Migration unbedingt im Dashboard prüfen, ob der alte Service
     wirklich noch `Free` ist. Falls nicht: erst zurücksetzen, dann
     migrieren. `render.yaml` muss `plan: free` lauten.
   - **Region-Wechsel:** wenn Region anders ist, ändert sich Latenz.
     Akzeptabel oder Region zurück auf `oregon`.

---

## Kosten-Constraint (HARD: Free-Tier non-negotiable)

**Tobias-Regel:** kein Upgrade weder auf Front- noch Backend. Alle
Optimierungen müssen mit dem Render Free-Tier funktionieren (512 MB RAM,
sleep nach 15 Min Inaktivität, ~50 Sek Cold-Start).

Konsequenzen für die Migration:

- `plan: free` in `render.yaml` ist gesetzt — nicht ändern, nicht
  übersteuern. Wenn der neue Service OOM-t, ist das ein Build-Bug, kein
  Plan-Bug: an `build.sh` arbeiten, nicht an Plan.
- Render Free-Tier sleept nach 15 Min Inaktivität. Cold-Start ~50 Sek.
  Aktuell hält `.github/workflows/keep-warm.yml` den Service warm
  durch periodische Pings — der MUSS nach Cutover die neue API-URL
  pingen, sonst sleept der neue Service trotz Workflow.
- External-Pinger (z.B. UptimeRobot) ist Free, kann den Workflow
  ergänzen. Kostet nichts.
- **NICHT akzeptabel:** auf `Starter` oder höhere Pläne wechseln, auch
  nicht "nur kurzfristig zum Testen". Es gibt im Render-Dashboard
  keinen sicheren Auto-Downgrade-Mechanismus — einmal upgraded läuft
  die Rechnung sofort.

Sanity-Verify vor Cutover (Phase 3): einmal in Render Dashboard das
"Billing" Tab öffnen und sicherstellen, dass weder alter noch neuer
Service einen Plan ungleich Free hat.

---

## Checkliste vor Cutover

Auszufüllen vor Phase 3:

- [ ] `render.yaml` reflektiert aktuellen Dashboard-Stand
- [ ] Voraussetzungs-Checkliste oben durchgegangen
- [ ] Phase 1 abgeschlossen, neuer Service "Live"
- [ ] Phase 2 manuell getestet (direct URL, drei Endpoints, frontend
      lokal)
- [ ] DNS-Provider-Zugriff bestätigt
- [ ] TTL gesenkt (mind. 24h vor Cutover auf 300s)
- [ ] `keep-warm.yml` weiß über neue URL
- [ ] Notfall-Rollback dokumentiert (alte CNAME-Target notiert)
- [ ] Zeitfenster gewählt (niedrige Traffic-Phase, kein laufendes
      Critical-Update)
- [ ] Render Billing-Tab geprüft: BEIDE Services auf Free-Plan, keine
      versteckten Upgrades

---

## Nach Migration — Sanity Checks (1 Woche)

- Deploy-Log nach 24h: irgendwelche overnight-cron Failures?
- API-Latenz: vergleichbar mit alter Service (Render Health-Dashboard)?
- Cost: identisch (sollte sein, gleiches Plan)?
- keep-warm Workflow: läuft, hält Service warm?

Wenn alle vier grün: Ticket closen, render.yaml-Workflow ist Standard,
zukünftige Service-Änderungen gehen ausschließlich per PR über
`render.yaml`.

---

## Code-Referenzen

| File | Wirkung |
|---|---|
| `prospecttheory-web/render.yaml` | Source-of-Truth nach Migration |
| `prospecttheory-web/backend/build.sh` | Pipeline-Steps (unverändert) |
| `prospecttheory-web/backend/requirements.txt` | Python-Deps |
| `prospecttheory-web/.github/workflows/keep-warm.yml` | Cold-Start-Prevention |
| `prospecttheory-web/backend/main.py` | FastAPI-App-Entry |

---

*Erstellt 2026-06-23 als Vorbereitung für #61. Der Cutover selbst ist
manueller Tobias-Schritt — nichts kann/sollte vom Code aus automatisiert
werden, weil DNS und Service-Lifecycle Render-Account-spezifisch sind.*
