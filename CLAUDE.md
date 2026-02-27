# Project Fibula

## What it is
Workflow-first ETL platform for document processing. Users build workflows on a canvas by connecting nodes. Documents flow through nodes, accumulating metadata.

## Tech Stack
- Frontend: React + Vite + Tailwind + Zustand + React Flow (@xyflow/react)
- Backend: Node.js + Express, plain JS (no TypeScript), MVC
- Database: Supabase (Postgres + pgvector)
- File storage: Supabase Storage
- Auth: Supabase Auth (Google OAuth only)
- LLM/VLM: OpenAI
- Testing: Vitest (frontend), Jest (backend), unit tests only
- Deployment: Render (frontend + backend) + Supabase

## Structure
Monorepo:
- /frontend        React app
- /backend         Express API
- /requirements    Feature specifications — read these before implementing any feature
- CLAUDE.md        this file

## Requirements
All feature specs live in `/requirements/`. **Always read the relevant file before implementing any node, page, or service.**

| File | Covers |
|---|---|
| `Project Fibula Overview, Landing Page, Nodes.txt` | Platform overview, landing page tabs, all node types summary |
| `Workflow Canvas Page.txt` | Canvas interactions, node placement, linking, multi-select |
| `Trigger Node and IF & Switch Node and Set Value node.txt` | Manual upload, IF, SWITCH (+ fallback port), Set Value nodes |
| `Document Splitting & Categorisation Config node.txt` | Splitting and categorisation config nodes and their setup pages |
| `Service Node - Extractor Node.txt` | Extractor schema, VLM extraction, training feedback, held documents |
| `Service Node - Data Mapper Rule.txt` | Data map sets, data map rules, lookup + calculation logic |
| `Service Node - Reconciliation.txt` | Reconciliation rules, matching sets, comparison + tolerances |
| `Service Node - Document Folder.txt` | Document folder instances, hold + send-out behaviour |
| `Webhook Node.txt` | Inbound webhook trigger node |
| `HTTP Node.txt` | Outbound HTTP export node |
| `Flow Inspector.txt` | Flow Inspector view — per-node document status, held/failed/orphaned docs, re-trigger flow |

## Dev Commands
- cd frontend && npm run dev       start frontend (Vite dev server)
- cd backend && npm run dev        start backend (nodemon)
- cd frontend && npm test          run frontend tests (Vitest)
- cd backend && npm test           run backend tests (Jest)
- cd backend && npm run migrate    run Knex migrations
- cd backend && npm run migrate:rollback   rollback last migration

## Git Workflow
- `main` — stable branch, always deployable
- Create a feature branch for each phase or feature: `feat/phase-2-auth`, `feat/phase-3-canvas`, etc.
- Open a PR and merge into main when the phase is complete and tests pass
- Never commit directly to main
- After pushing or merging a phase branch, update the phase status table in `MEMORY.md`
- After implementing and pushing new functionality, update the relevant requirements file in `/requirements/` to document what was built (or create one if it doesn't exist). Update the requirements table in this file (CLAUDE.md) if a new requirements file was created

## Commit Message Convention (Conventional Commits)
Format: `<type>: <short description>`

| Type | When to use |
|---|---|
| `feat` | new feature or behaviour |
| `fix` | bug fix |
| `chore` | tooling, deps, config, scaffolding |
| `test` | adding or updating tests |
| `docs` | documentation only |
| `refactor` | code restructuring without behaviour change |

Examples:
- `feat: add workflow CRUD API and tests`
- `fix: correct edge deletion cascade`
- `chore: install React Flow and configure Vite`
- `test: add extractor service unit tests`

## Code Conventions
- No TypeScript, plain JS throughout
- TDD: write a failing test first, then implement to make it pass
- Backend MVC: routes → controllers → services → models (no business logic in controllers or routes)
- All API routes prefixed /api
- Env vars: never commit .env, always update .env.example when adding new vars
- React Flow handles canvas; custom nodes live in frontend/src/components/nodes/
- Zustand stores in frontend/src/stores/, one store per domain
- Axios instance with auth header in frontend/src/services/api.js

## Key Architecture Notes
- Supabase JWT is validated in backend auth middleware on every protected route
- Documents are stored in Supabase Storage; only URLs are stored in Postgres
- pgvector extension must be enabled in Supabase for extractor training feedback embeddings
- Workflow execution runs in-process (no external job queue for MVP)
- A document_execution record tracks each document's journey through a workflow
- SWITCH node always has a fallback output port in addition to case ports
- Reconciliation node input ports are labeled with extractor names from the rule config
