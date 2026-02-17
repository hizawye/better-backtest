# Changelog

## [0.3.0] - 2026-02-17

### Added
- Milestone 1 session-centric backtest core:
  - `BacktestSession`/`BacktestConfig`/`ExecutionConfig`/`SessionSnapshot` shared contracts.
  - Dexie persistence for sessions, snapshots, and session-scoped entities (orders, positions, trades).
  - Timeframe aggregation utility for `M1/M5/M15/H1/H4/D1`.
  - Session-aware replay controls: session select/new/save, timeframe switch, custom date range apply.

### Changed
- Trade route now boots through persisted session state and restores replay context.
- Market data load is now date-range-driven and timeframe-aware instead of fixed 7-day replay only.
- Store contract now includes session identity, range/timeframe state, and execution config.

## [0.2.0] - 2026-02-16

### Added
- HistData NSXUSD (M1) downloader script:
  - `scripts/histdata/download_nsxusd_m1.sh`
- Dataset build and validation scripts:
  - `scripts/histdata/build_nsxusd_dataset.ts`
  - `scripts/histdata/validate_nsxusd_dataset.ts`
- Local NSXUSD/NAS100 adapter:
  - `packages/backend/src/adapters/histdata-local.ts`
- New root scripts:
  - `data:nsxusd:download`
  - `data:nsxusd:build`
  - `data:nsxusd:validate`

### Changed
- Aggregator now prioritizes local HistData for `NAS100` and falls back to remote providers.
- API route now accepts `NSXUSD` as alias for `NAS100`.
- Redis connection mode changed to fail fast when unavailable, preventing blocking behavior.
- Dataset generated under `data/histdata/nsxusd/` with monthly normalized files and manifest.

## [0.1.1] - 2026-01-18

### Fixed
- **Socket hang up errors** - Implemented layered timeout system to prevent indefinite API hangs
  - Added `fetchWithTimeout` helper with AbortController to alpha-vantage.ts and forexrate.ts (10s timeout)
  - Added provider-level timeout in aggregator.ts (12s per provider)
  - Added request-level timeout in data.ts route handler (25s total)
  - Configured Vite proxy timeout (30s)
  - Increased Bun server idleTimeout to 120s
  - Enhanced logging with visual indicators (✓/✗/→/⚡) for better debugging

### Improved
- Error messages now clearly indicate timeout failures instead of cryptic "socket hang up"
- Each timeout layer completes before parent layer to prevent cascading hangs

## [0.1.0] - 2026-01-17

### Added
- Complete monorepo structure with backend, frontend, and shared packages
- Bun + Hono backend with REST API
- Alpha Vantage and ForexRateAPI data adapters with fallback
- Redis caching layer with 24h TTL
- Svelte + SvelteKit frontend with Vite
- TradingView Lightweight Charts integration
- IndexedDB storage with Dexie for offline capability
- Web Worker for tick replay at variable speeds (1x-100x)
- Trading engine with market/limit/stop orders
- Position management with real-time P&L calculation
- Zustand state management
- Dark mode theme with TradingView-inspired design
- OrderPanel component with keyboard shortcuts
- PositionTable component with live P&L updates
- TradeHistory component with win rate analytics
- ReplayControls component with speed control
- Landing page with feature showcase
- Main trading page with grid layout
- Keyboard shortcuts: B (buy), S (sell), Space (play/pause)
- Support for 4 forex pairs: EUR/USD, GBP/USD, USD/JPY, USD/CHF
- Realistic spread simulation (1.5-2.5 pips)

### Infrastructure
- Git repository with .gitignore
- Documentation (README, architecture, tech stack, decision log)
- Project status tracking
- Dependencies installed for both packages
