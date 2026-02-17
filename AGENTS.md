# Project: Better Backtest

## Tech Stack
- Core: TypeScript monorepo
- Backend: Bun + Hono + Redis
- Frontend: SvelteKit + Vite + Lightweight Charts + Dexie
- Env: Fedora / Fish / Neovim

## Build Scripts (Auto-Detected)
- Root:
  - `npm run dev:backend`
  - `npm run dev:frontend`
  - `npm run build:backend`
  - `npm run build:frontend`
  - `npm run data:nsxusd:download`
  - `npm run data:nsxusd:build`
  - `npm run data:nsxusd:validate`
- Backend (`packages/backend`):
  - `bun run dev`
  - `bun run build`
  - `bun run start`
- Frontend (`packages/frontend`):
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm run check`

## Autonomous Workflow
- Initialization: Read `docs/` to restore mental model.
- Sync Routine:
  1. Update `docs/`
  2. `git add docs/ && git commit -m "docs: sync project state"`
  3. `git add . && git commit -m "feat/fix: [desc]"`

## Agent Commands
- `/context`: `cat docs/project-status.md docs/decision-log.md docs/architecture.md`
- `/status`: `cat docs/project-status.md`
- `/history`: `tail -n 20 docs/decision-log.md`
