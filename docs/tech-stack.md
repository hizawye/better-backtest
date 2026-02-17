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
- **Data Sources**:
  - Local HistData NSXUSD M1 dataset (`data/histdata/nsxusd/normalized`)
  - Alpha Vantage API (fallback)
  - ForexRateAPI (fallback)

## Data Pipeline
- **Downloader**: Bash + `curl` + `ripgrep` + `unzip`
- **Normalizer/Manifest**: TypeScript (Bun runtime)
- **Validator**: TypeScript (Bun runtime)
- **Dataset Layout**: Monthly JSON partitions (`nsxusd_m1_YYYYMM.json`)

## Rationale
- **Svelte**: Smallest bundle, no vDOM overhead
- **TradingView Charts**: 60fps canvas rendering
- **Bun**: Native TS, 200k req/s vs Express 15k
- **IndexedDB**: Offline capability on frontend
- **Local HistData for NAS100**: Stable, high-volume 1m history without API quota limits
