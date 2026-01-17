# Tech Stack

## Frontend
- **Framework**: Svelte + Vite
- **Charts**: TradingView Lightweight Charts
- **State Management**: Zustand
- **Storage**: IndexedDB (Dexie)
- **Workers**: Web Workers

## Backend
- **Runtime**: Bun
- **Framework**: Hono
- **Cache**: Redis
- **Data Sources**: Alpha Vantage API, ForexRateAPI

## Rationale
- **Svelte**: Smallest bundle, no vDOM overhead
- **TradingView Charts**: 60fps canvas rendering
- **Bun**: Native TS, 200k req/s vs Express 15k
- **IndexedDB**: Weeks of cached data, offline capability
