# Architecture

## System Overview

```
Browser (Svelte)
├─ Session Manager (pair/timeframe/range/snapshot)
├─ TradingView Chart (Canvas, 60fps)
├─ Trading Engine (orders, P&L, positions)
├─ Web Worker (replay stream)
└─ IndexedDB (bars + sessions + snapshots + entities)
    ↕ REST API
Backend (Bun + Hono)
├─ HistData Local Adapter (NSXUSD -> NAS100, M1)
├─ Alpha Vantage Adapter (fallback)
├─ ForexRateAPI Adapter (fallback)
└─ Redis Cache (24h TTL, optional)
```

## Data Sources
- `NAS100` (and alias `NSXUSD`) are served from local HistData files in `data/histdata/nsxusd/normalized`.
- Forex/index fallbacks still use external providers when local data is not available.
- Local dataset currently contains `5,075,918` bars across `2010-2026` (M1).

## Session Flow (Milestone 1)
1. Load persisted sessions from Dexie (`sessions` table).
2. Select/create session with config: pair, timeframe, date range, starting balance, execution assumptions.
3. Load bars from local cache/API using configured range (`/api/data/:pair/:from/:to`).
4. Aggregate source M1 bars client-side to selected timeframe (`M1/M5/M15/H1/H4/D1`).
5. Resume replay with persisted snapshot (balance/equity/index + entities).
6. Save updated session/snapshot/entities on explicit save and on page teardown.

## Execution Flow (Milestone 2)
1. Replay worker emits bar/tick payload.
2. Pending orders are evaluated against bar high/low semantics.
3. Filled orders open positions with execution config (spread/slippage/commission assumptions).
4. Open positions are evaluated for SL/TP hits on each replay bar.
5. Realized trades update balance/equity and append deterministic session event log entries.
6. Session state persists entities + event log for resume/audit.

## Request Flow (`/api/data/:pair/:from/:to`)
1. Normalize pair (`NSXUSD` -> `NAS100`).
2. Check Redis cache (fast-fail if Redis unavailable).
3. If `NAS100`, load relevant month files from local HistData dataset.
4. If local data is missing, query remote providers in parallel.
5. Cache successful result and return JSON bars payload.

## Dataset Build Flow
1. `scripts/histdata/download_nsxusd_m1.sh` scrapes/downloads all NSXUSD M1 zip periods from HistData.
2. `scripts/histdata/build_nsxusd_dataset.ts` extracts CSVs and normalizes into monthly JSON files.
3. `scripts/histdata/validate_nsxusd_dataset.ts` verifies bar counts, ordering, and manifest consistency.
