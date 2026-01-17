# Better Backtest

Fast, offline-capable forex backtesting platform. Better than FXReplay: faster performance, improved UX, offline mode.

## Features

- **Lightning Fast**: 60fps chart rendering, <10μs bar processing
- **Offline Mode**: Cache weeks of data in IndexedDB
- **TradingView Charts**: Professional-grade charting
- **Variable Speed**: Replay at 1x to 100x speed
- **Real Trading**: Market/Limit/Stop orders with realistic spreads
- **Analytics**: Win rate, drawdown, P&L tracking
- **Keyboard Shortcuts**: B (buy), S (sell), Space (play/pause)

## Tech Stack

### Backend
- **Runtime**: Bun (3x faster than Node)
- **Framework**: Hono
- **Cache**: Redis
- **APIs**: Alpha Vantage, ForexRateAPI

### Frontend
- **Framework**: Svelte + SvelteKit
- **Charts**: TradingView Lightweight Charts
- **State**: Zustand
- **Storage**: IndexedDB (Dexie)
- **Workers**: Web Workers for tick replay

## Quick Start

### Prerequisites

- Bun (https://bun.sh)
- Node.js 18+ (for frontend)
- Redis (optional, for caching)

### Backend Setup

```bash
cd packages/backend
bun install
cp .env.example .env
# Edit .env with your API keys
bun run dev
```

Backend runs on http://localhost:3000

### Frontend Setup

```bash
cd packages/frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

## API Keys

Get free API keys from:
- Alpha Vantage: https://www.alphavantage.co/support/#api-key (25 req/day)
- ForexRateAPI: https://forexrateapi.com (1000 req/month)

Add them to `packages/backend/.env`:

```
ALPHA_VANTAGE_API_KEY=your_key_here
FOREXRATE_API_KEY=your_key_here
```

## Keyboard Shortcuts

- **B**: Buy (market order)
- **S**: Sell (market order)
- **Space**: Play/Pause replay
- **Arrow Keys**: Navigate (when implemented)

## Architecture

```
Browser (Svelte)
├─ TradingView Chart (Canvas, 60fps)
├─ Trading Engine (orders, P&L, positions)
├─ Web Worker (1-min bar replay)
└─ IndexedDB (weeks of cached bars)
    ↕ REST API
Backend (Bun + Hono)
├─ Alpha Vantage API (25 req/day)
├─ ForexRateAPI (1000 req/month)
└─ Redis Cache (24h TTL)
```

## Supported Pairs

- EUR/USD (1.5 pips spread)
- GBP/USD (1.5 pips spread)
- USD/JPY (1.5 pips spread)
- USD/CHF (2.5 pips spread)

## Performance Targets

- Initial load: <2s
- Bar processing: <10μs
- Order execution: <5μs
- Chart FPS: 60fps steady
- IndexedDB read: <50ms for 10k bars

## Development

```bash
# Backend (with hot reload)
cd packages/backend
bun run dev

# Frontend (with hot reload)
cd packages/frontend
npm run dev

# Build for production
cd packages/backend
bun run build

cd packages/frontend
npm run build
```

## License

MIT
