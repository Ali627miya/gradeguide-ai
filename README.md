# GradeGuide AI

*Your assignment. Your effort. A smarter way to improve.*

GradeGuide AI checks a student's draft against their lecturer's real marking rubric **before** they submit, quotes the
student's own words as evidence (every quote is verified by code), and then coaches them with questions — it never
writes, rewrites or completes the work. Lecturers import six code and six report questions from CSV/JSON and see
anonymised, privacy-protected class insights.

Built for the **Reply Student Tech Clash – AI on Campus** (theme: Assessment + Learning, multi-agent system).

---

## Contents
1. [What's inside](#1-whats-inside)
2. [Quick start – Windows 10/11](#2-quick-start--windows-1011)
3. [Quick start – macOS / Linux](#3-quick-start--macos--linux)
4. [OpenAI API key (optional)](#4-openai-api-key-optional)
5. [The 3-minute judge demo](#5-the-3-minute-judge-demo)
6. [Architecture](#6-architecture)
7. [Feature map](#7-feature-map)
8. [Tests](#8-tests)
9. [Resetting the demo database](#9-resetting-the-demo-database)
10. [Troubleshooting](#10-troubleshooting)
11. [Privacy, data retention and honest limitations](#11-privacy-data-retention-and-honest-limitations)

---

## 1. What's inside

```
gradeguide-ai/
├── backend/                 FastAPI + SQLAlchemy + SQLite
│   ├── agents/              marker_agent, coach_agent, integrity_agent, feedback_quality_agent,
│   │                        offline_analyser (labelled simulator), llm_client (OpenAI JSON mode)
│   ├── services/            document, rubric, evidence, assessment (orchestration), progress, analytics, auth
│   ├── models/ schemas/ routers/ database/   (seed.py = init + demo data)
│   ├── sample_data/         weak essay, improved essay, Assignment 1, rubric, sample code, templates
│   ├── static/templates/    downloadable CSV/JSON question templates
│   ├── tests/               33 pytest tests
│   ├── main.py  config.py  requirements.txt  .env.example
├── frontend/                React 18 + Vite + TypeScript + Tailwind + Recharts + Lucide
│   └── src/ pages/ components/ context/ lib/
├── start-windows.ps1        one-click start (Windows)
└── start-mac-linux.sh       one-click start (macOS/Linux)
```

**Requirements:** Python **3.11, 3.12 or 3.13** and Node.js **20 LTS or 22 LTS** (18.18+ works). No Docker needed.
No paid services needed — the OpenAI key is optional.

## 2. Quick start – Windows 10/11

Check versions in **PowerShell**:
```powershell
py --version        # Python 3.11+  (install from python.org - tick "Add python.exe to PATH")
node --version      # v20 or v22    (install the LTS from nodejs.org)
```

### Option A – one click
From the `gradeguide-ai` folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
```
It creates the virtual environment, installs everything, opens two server windows and your browser.

### Option B – step by step (two terminals)

**Terminal 1 – backend**
```powershell
cd gradeguide-ai\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
#   If you see "running scripts is disabled", run this once and retry:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
copy .env.example .env
python -m database.seed            # creates gradeguide.db with demo data (also happens automatically on start)
uvicorn main:app --reload --port 8000
```

**Terminal 2 – frontend**
```powershell
cd gradeguide-ai\frontend
npm install
npm run dev
```

Open **http://localhost:5173** and click **Try Interactive Demo**.
(API docs: http://localhost:8000/docs)

**Stop:** press `Ctrl + C` in each terminal. **Restart:** re-run `uvicorn main:app --reload --port 8000`
(with the venv activated) and `npm run dev`.

### Single-port mode (handy for the presentation laptop)
```powershell
cd frontend; npm run build; cd ..\backend
uvicorn main:app --port 8000
```
Then open **http://localhost:8000** — the backend serves the built site too.

## 3. Quick start – macOS / Linux

```bash
bash start-mac-linux.sh          # does everything below; Ctrl+C stops both servers
```
or manually:
```bash
cd gradeguide-ai/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
# new terminal
cd gradeguide-ai/frontend && npm install && npm run dev
```

## 4. OpenAI API key (optional)

Without a key the app runs the **offline simulator**: a transparent rule-based analyser that genuinely reads the text
(citations, evaluative language, headings, justification, tests, error handling…). Every screen labels its output
**"Simulated · not AI"**, and its feedback-quality score is capped so it can never look perfect.

To use real AI:
1. Get a key — at the hackathon from the **Reply desk**, or at https://platform.openai.com/api-keys.
2. Edit `backend/.env`:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini     # any chat model your key can use that supports JSON mode
   AI_MODE=auto
   ```
3. Restart the backend. The badge in the top bar changes to **Live AI · model-name**.

`AI_MODE=offline` forces the simulator even with a key (good for rehearsing without Wi-Fi).
Never commit `.env` — it is in `.gitignore`.

## 5. The 3-minute judge demo

Click **Try Interactive Demo**. A guide panel (bottom-right) walks through the 8 steps; each has a **Next step** button.

| Step | What to show | What to say |
|---|---|---|
| 1 | Weak draft (labelled demonstration data) | "A real problem: students don't know how their work meets the rubric until it's too late." |
| 2 | **Analyse My Work** | "Four agents run in sequence — Marker, evidence verification, Integrity, Feedback-Quality." |
| 3 | Results: 34%, mostly **WEAK** (icons + text + patterns, not just red) | "Every rating is tied to a rubric criterion and quotes the student's words — the green 'Verified' tick means code found that exact quote." Point at **AI feedback quality** — "separate from the mark; the AI never scores itself." Scroll to **How reliable is this feedback?** |
| 4 | Coach — click **"Can you rewrite my introduction?"** | "The Integrity Agent refuses and asks a guiding question instead." |
| 5 | Editor — **Load the student's revised draft (demo)** | "The student edits their own work — nothing is generated." |
| 6 | **Submit & re-assess** | "Round 2 is genuinely re-assessed, not hard-coded." |
| 7 | Comparison: 34% → 86%, 5 criteria improved, 1 still needs attention. Optionally **Progress since Assignment 1** | "Assignment 1 used a different rubric — we only compare equivalent criteria, and say so." |
| 8 | Lecturer dashboard → Class analytics / Teaching insights | "Anonymised aggregates only, consent switch, cohorts under 5 hidden (see SE210)." |

Tip: press the speaker icon on any feedback card, or toggle dark mode / colour-blind palette in **Accessibility settings**.

## 6. Architecture

```
 Upload (PDF/DOCX/TXT) ─► document_service (in-memory extraction, never stores the file)
        │
        ▼
 rubric_service: validate ≤6 code + ≤6 report questions, weights = 100%
        │
        ▼
 Marker Agent  ── live: OpenAI JSON mode → Pydantic-validated criteria
               └─ offline: offline_analyser (labelled "simulated")
        │
        ▼
 evidence_service.verify_quote  (normalised exact match / ≥90% fuzzy "near" / unverified → flagged for human review)
        │
        ▼
 Integrity Agent  (layered: request screening → rule checks for replacement text, code, new quoted wording,
                   paraphrase of the student's sentences → LLM classifier in live mode) → safe guiding question
        │
        ▼
 Feedback-Quality Agent  (deterministic checks; weights 30/25/20/15/10; capped in simulated mode)
        │
        ▼
 SQLite ─► dashboard, coaching, checklist, re-assessment, draft & assignment comparison, lecturer analytics
```

Weighted score = Σ (rating ÷ 5 × weight) — shown per criterion in the results table.

## 7. Feature map

| Requirement | Where |
|---|---|
| Marker / Coach / Integrity / Feedback-Quality agents | `backend/agents/*.py` |
| Quote verification | `backend/services/evidence_service.py` |
| Orchestration workflow + pipeline log | `backend/services/assessment_service.py` (shown under "Agent workflow" on results) |
| Draft & A1→A2 comparisons (only equivalent criteria) | `backend/services/progress_service.py`, pages `Compare`, `Progress` |
| Anonymised analytics (consent, min cohort, 5 % rounding) | `backend/services/analytics_service.py` |
| CSV/JSON import, ≤6 per section, weights = 100 | `rubric_service.py`, pages `RubricImport`, `RubricBuilder` (code / report) |
| Lecturer 1–5 rating + ≤10-word comment | "Shared for review" page (student opt-in only) |
| Read aloud, pause/stop, speed | `context/SpeechContext.tsx`, speaker icons, top-bar controls |
| Light/dark, colour-blind & monochrome palettes, text size, reduced motion | `context/SettingsContext.tsx`, `index.css`, Settings page |
| Role-based access | `services/auth_service.py`, `routers/common.py` |
| Delete my data / retention | Settings page, `DELETE /api/student/data`, `RETENTION_DAYS` |

Main endpoints (full list at `/docs`): `POST /api/upload`, `POST /api/assessment/analyse`, `POST /api/coach/question`,
`POST /api/integrity/check`, `POST /api/assessment/compare`, `POST /api/feedback-quality/evaluate`,
`GET /api/student/dashboard`, `GET /api/student/history`, `GET /api/professor/dashboard`,
`POST /api/professor/rubric/import`, `GET /api/professor/analytics`.

## 8. Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1      # macOS/Linux: source .venv/bin/activate
python -m pytest -q
cd ..\frontend
npm run typecheck
```
The 33 tests cover quote verification, rubric import/validation, integrity blocking, quality scoring, the two-round
demo, role permissions, uploads (TXT/DOCX/invalid), coaching refusals, lecturer import, analytics privacy and data deletion.
They always run in offline mode with a temporary database.

## 9. Resetting the demo database

Any of:
- In the app: **Accessibility settings → Reset the whole demo database**.
- Terminal (backend folder, venv active): `python -m database.seed --reset`
- Or stop the backend, delete `backend/gradeguide.db`, start it again.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `py` / `python` not found | Reinstall Python from python.org and tick **Add python.exe to PATH**. |
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then retry. |
| `uvicorn` not recognised | Activate the venv first, or run `python -m uvicorn main:app --reload --port 8000`. |
| Landing page says it can't reach the backend | The backend must be running on port 8000 in another terminal. |
| `Port 5173/8000 is already in use` | Close the other terminal, or `netstat -ano \| findstr :8000` then `taskkill /PID <pid> /F`. |
| `npm install` fails | Use Node 20/22 LTS; delete `frontend/node_modules` and retry. |
| "OpenAI key was rejected" / quota / model not found | Check `backend/.env`, change `OPENAI_MODEL`, or set `AI_MODE=offline` and restart. |
| "Your session has expired" / weird data after a reset | Click **Sign out** (sidebar) and start the demo again. |
| PDF says "No selectable text" | It's a scanned image; upload DOCX/TXT instead. |
| Read aloud is silent | Use Chrome or Edge, check system volume; Firefox on Linux may have no voices. |
| Fonts look plain offline | Google Fonts need internet; system fonts are used as fallback. |

## 11. Privacy, data retention and honest limitations

- **Files are never stored.** Only extracted text is kept; non-demo drafts are deleted after `RETENTION_DAYS` (default 30) at
  startup, and students can delete everything instantly.
- **No PII.** Demo accounts use pseudonyms; no emails or student IDs. Authentication is a local demo login — use real
  university SSO before any real deployment.
- **Lecturers** see only anonymised aggregates (consent switch, minimum cohort size, percentages rounded to 5 %, small
  sub-groups hidden) and individual work only when a student presses **Ask lecturer to review**.
- **Live mode sends draft text to OpenAI.** Simulated mode keeps everything on the local machine.
- **Ratings are estimates, not official marks.** AI can misjudge work; the offline simulator only measures surface signals
  and says so (e.g. it cannot check technical correctness or run code).
- **The integrity system is a guard-rail, not a guarantee.** Layered rules plus an LLM classifier reduce ghost-writing risk
  but can be evaded by unusual phrasing, and may occasionally block a harmless reply.
- **Feedback-quality scores measure verifiability and consistency** (quotes exist, explanations use the rubric, reasoning
  is structured, no integrity violations) — not factual correctness.
- **Demo data:** the essays, Assignment 1, and the 40-student "SE201" cohort are fictional/synthetic and labelled in the UI.
  The improved essay represents the fictional student's own edits; its references are real published works.

### What has been verified
Backend tests pass (33/33), the frontend type-checks and builds, and the full guided demo, upload wizard, coaching,
comparison, lecturer pages, dark mode and mobile layout were exercised in headless Chrome. **Not verified:** live OpenAI
calls (no key was available while building — the code path uses the standard Chat Completions JSON mode and falls back
with a clear error message), and running on a physical Windows machine (instructions follow standard Python/Node setup).
