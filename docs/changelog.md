# Changelog

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
