# Decision Log

## 2026-01-17 - Project Initialization

**Decision**: Use Bun + Hono backend with Svelte frontend
**Rationale**:
- Bun provides 3x faster performance than Node (200k vs 15k req/s)
- Hono is lightweight and fast
- Svelte has smallest bundle size and no vDOM overhead

**Decision**: Use TradingView Lightweight Charts
**Rationale**:
- Canvas-based rendering at 60fps
- Industry standard for financial charts
- Excellent performance with large datasets

**Decision**: IndexedDB for client-side storage
**Rationale**:
- Enables offline mode
- Can store weeks of historical data
- No subscription data loss

**Decision**: 1-minute bars instead of tick data
**Rationale**:
- Free APIs support 1-min granularity
- Realistic for practice/backtesting
- Manageable data volumes

---

## 2026-01-17 - Implementation Complete

**Decision**: Use Bun for both backend and frontend dependency installation
**Rationale**:
- Faster than npm/pnpm
- Better compatibility in this environment
- Consistent tooling across monorepo

**Decision**: Implement keyboard shortcuts early
**Rationale**:
- Critical for UX and efficient trading practice
- B (buy), S (sell), Space (play/pause) are intuitive
- Makes platform feel professional

**Decision**: Build analytics into TradeHistory component
**Rationale**:
- Win rate and total P&L are essential metrics
- Displaying in same component reduces complexity
- Easy to expand with more analytics later

---

## 2026-01-18 - Timeout System Implementation

**Decision**: Implement layered timeout strategy (10s→12s→25s→30s)
**Rationale**:
- Socket hang up errors caused by external API calls timing out indefinitely
- Bun's `idleTimeout` only affects server idle connections, not outbound fetch
- Need AbortController for proper fetch timeout handling
- Layered approach ensures each level times out before parent to prevent cascading hangs

**Implementation**:
1. Adapter Level (10s): `fetchWithTimeout` helper with AbortController in both alpha-vantage.ts and forexrate.ts
2. Provider Level (12s): Promise.race wrapper in aggregator.ts for each provider attempt
3. Request Level (25s): Promise.race wrapper in data.ts route handler
4. Proxy Level (30s): Vite proxy timeout configuration
5. Server Level (120s): Increased Bun idleTimeout to handle long-running requests

**Result**: No more socket hang up errors, graceful timeout handling with clear error messages
