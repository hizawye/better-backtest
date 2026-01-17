# Architecture

## System Overview

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

## Data Flow
1. Backend fetches 1-min OHLC bars from free APIs
2. Caches in Redis 24h, serves to frontend
3. Frontend stores in IndexedDB (compressed)
4. Web Worker streams bars at configurable speed
5. Trading engine processes each bar, updates P&L
6. Chart renders at 60fps

## Key Components
- **Backend**: Bun + Hono for 200k req/s performance
- **Frontend**: Svelte for minimal bundle size
- **Charts**: TradingView Lightweight Charts for 60fps rendering
- **Storage**: IndexedDB (offline) + Redis (cache)
- **State**: Zustand for minimal overhead
- **Workers**: Web Workers for tick replay + calculations
