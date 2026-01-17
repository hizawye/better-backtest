# Project: Better Backtest

Lightweight, fast, browser-based forex backtesting platform. Better than FXReplay: faster performance, offline-capable, improved UX.

## 🛠 Tech Stack
- **Frontend**: Svelte + Vite + TradingView Lightweight Charts
- **Backend**: Bun + Hono
- **Storage**: IndexedDB + Redis
- **State**: Zustand
- **Environment**: Fedora Linux / Fish Shell
- **Tools**: Bun, npm/pnpm

## 🧠 Automated Workflow
- **State Recovery**: On start, read `docs/project-status.md` and `docs/decision-log.md`
- **Sync Command**: `/update-docs-and-commit`
  * Action: Update `docs/` → `git add docs/` → `git commit -m "docs: sync state"` → `git add .` → `git commit -m "feat: implementation"`

## ⚡ Commands
- **/context**: `cat docs/project-status.md docs/decision-log.md docs/architecture.md`
- **/status**: `cat docs/project-status.md`
- **/log**: `cat docs/decision-log.md | tail -n 20`

## 🎯 Key Features
- Market/Limit/Stop orders with real-time P&L
- 60fps chart rendering with TradingView
- Offline mode with IndexedDB caching
- 1x to 100x replay speed
- Trade analytics: win rate, drawdown, Sharpe ratio
- Mobile responsive
