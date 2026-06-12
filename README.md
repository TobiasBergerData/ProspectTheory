# ProspectTheory Web

NBA Draft Prospect Intelligence Platform — Backend (FastAPI) + Frontend (React).

**Live:** [prospecttheory.io](https://prospecttheory.io) | API: [api.prospecttheory.io](https://api.prospecttheory.io)

---

## Architecture-at-a-Glance

```
data-pipeline (sister-repo)         ← ML/Statistical Modeling
       │
       │  produces api_profiles_part*.json + CSVs
       ▼
prospecttheory-web (THIS repo)      ← Production-Service
  ├── backend/  (FastAPI on Render Free-Tier)
  └── frontend/ (React on Vercel)
```

Vollständige Architektur: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
Polyrepo-Begründung: [`docs/ADR/001-polyrepo-architecture.md`](./docs/ADR/001-polyrepo-architecture.md)

---

## Quick-Start

### Backend (local dev)

```powershell
cd backend
pip install -r requirements.txt
python build_db.py        # build SQLite from api_profiles_part*.json
uvicorn main:app --reload --port 8000
```

API ist dann auf http://localhost:8000

### Frontend (local dev)

```powershell
cd frontend
npm install
npm run dev
```

UI ist dann auf http://localhost:5173

---

## Deploy

### Backend → Render (Auto-Deploy on Push)

Build-Pipeline ist versioniert in [`backend/build.sh`](./backend/build.sh).
Dashboard hat nur 1 Setting: `Build Command = bash build.sh`.

Vollständig: [`backend/render.yaml`](./backend/render.yaml) + [`docs/sprints/SPRINT_2_RERUN_GUIDE.md`](./docs/sprints/SPRINT_2_RERUN_GUIDE.md)

### Frontend → Vercel

Auto-Deploy via GitHub-Integration. `frontend/vercel.json` definiert Build.

---

## Documentation Map

```
docs/
├── ARCHITECTURE.md              ← System-Overview, Module-Topologie
├── METHODS_DICT.md              ← Modell-Methodik-Glossar (Tooltip-Source)
├── SCHEMA_CONTRACT.md           ← Pipeline ↔ Backend ↔ Frontend Field-Kontrakt
├── ADR/                         ← Architecture Decision Records
│   └── 001-polyrepo-architecture.md
└── sprints/                     ← Sprint-Logs
    ├── DAY_LOG_2026-06-11.md            ← Recovery + Render-Architektur Refactor
    ├── SPRINT_2_RERUN_GUIDE.md          ← Render Build-Pipeline + Sprint-2 Re-Run
    ├── SPRINT_3_0_DESIGN.md             ← Modell-Trustability Foundation
    └── SPRINT_3_0_RERUN_GUIDE.md        ← Sprint-3.0 Pipeline Re-Run
```

---

## CI/CD

GitHub Actions in `.github/workflows/`:

- **`index-drift-detector.yml`** — Verhindert dass kritische Files unbemerkt
  aus dem Remote verschwinden (Sprint-Recovery-Krise 2026-06-11).
- **`render-build-verification.yml`** — Validiert Build-Pipeline + Imports
  + render.yaml-Konsistenz bevor Render baut.

---

## Sprint-Historie

| Sprint | Datum | Scope |
|---|---|---|
| Sprint-1 | 2026-06-04 | Boozer-Slug, Stamina, Badges, Self-Sufficiency |
| Sprint-2 | 2026-06-04 | Pipeline-Re-Foundation: xRAPM-Fix, merit_slot, Name-Kollisionen |
| Sprint-2.4 | 2026-06-04 | Risk-Tab Re-Enable, Three-Layer Shooting V2 |
| Sprint-Recovery | 2026-06-11 | Git-Index-Korruption Recovery, Render-Build Refactor |
| **Sprint-3.0** | **2026-06-12** | **Modell-Trustability: Eligibility + Shrinkage + Multi-Layer Tier + Validation + Polyrepo-Architektur** |

---

## License

Privates Projekt (Tobias Berger). Nicht-kommerziell.
