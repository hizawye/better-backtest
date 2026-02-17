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

---

## 2026-01-18 - Timeout Optimization & Parallel Provider Fetching

**Problem**: Sequential provider attempts eating timeout budget (24s total → hitting 25s limit)
- AlphaVantage using `outputsize=full` fetching months/years of data then filtering client-side
- Providers tried sequentially: AV (12s) fails → ForexRate (12s) fails = 24s total

**Solution**: Multi-pronged optimization

1. **AlphaVantage Dynamic Output Sizing** (alpha-vantage.ts)
   - Calculate date range: `daysDiff = (to - from) / (1000 * 60 * 60 * 24)`
   - Use `outputsize=compact` for ≤7 days, `full` for >7 days
   - Reduced 7-day requests from 10-12s → 2-4s (80% improvement)
   - Increased adapter timeout to 12s for consistency

2. **Parallel Provider Fetching** (aggregator.ts)
   - Changed from sequential loop to `Promise.all` with parallel execution
   - All providers race simultaneously, first success wins
   - Provider timeout increased to 15s
   - Worst case: both timeout in parallel (15s vs 24s sequential = 37% improvement)
   - Better error reporting: shows all provider failures

3. **Route Timeout Extension** (data.ts)
   - Increased from 25s → 35s to accommodate 15s provider timeouts + overhead
   - Prevents premature timeout during legitimate slow responses

4. **Fail-Fast Validation** (data.ts)
   - Max 30-day date range limit (immediate 400 error for excessive ranges)
   - Date range sanity check (from < to)
   - Prevents wasted API calls and timeout scenarios

5. **ForexRate Consistency** (forexrate.ts)
   - Timeout increased from 10s → 12s to match AlphaVantage

**Expected Performance**:
- Best case (AV compact works): 24s → 3-5s (80% improvement)
- One provider succeeds: 24s → 5-8s (65% improvement)
- Both timeout (parallel): 24s → 15s (37% improvement)

**Files Modified**:
- packages/backend/src/adapters/alpha-vantage.ts
- packages/backend/src/adapters/forexrate.ts
- packages/backend/src/services/aggregator.ts
- packages/backend/src/routes/data.ts

---

## 2026-02-16 - NSXUSD HistData Local Dataset Integration

**Decision**: Use HistData NSXUSD (M1) as local NAS100/NQ proxy data source
**Rationale**:
- User requested NQ-like data from HistData NSXUSD for immediate use.
- API quotas/rate limits are too restrictive for broad historical backtesting.
- Local files provide deterministic, repeatable reads and no network dependency.

**Decision**: Normalize raw CSV into monthly JSON partitions
**Rationale**:
- Yearly files were slower for range reads and increased route latency.
- Monthly partitions bound per-request IO and improved fetch times.
- Simplifies targeted caching and incremental refresh later.

**Decision**: Add pair alias normalization (`NSXUSD` -> `NAS100`) in API path
**Rationale**:
- Keeps frontend/app using canonical `NAS100` while supporting requested symbol.
- Avoids duplicate code paths and cache key fragmentation.

**Decision**: Make Redis cache fail fast when unavailable
**Rationale**:
- Redis connection retries were blocking request execution.
- Fast-fail mode preserves API responsiveness in local/dev environments.

**Implementation Artifacts**:
- Scripts:
  - `scripts/histdata/download_nsxusd_m1.sh`
  - `scripts/histdata/build_nsxusd_dataset.ts`
  - `scripts/histdata/validate_nsxusd_dataset.ts`
- Backend:
  - `packages/backend/src/adapters/histdata-local.ts`
  - `packages/backend/src/services/aggregator.ts`
  - `packages/backend/src/services/cache.ts`
  - `packages/backend/src/routes/data.ts`
- Dataset:
  - `data/histdata/nsxusd/` (raw zips, raw csv, normalized monthly files, manifest)

---

## 2026-02-17 - Milestone 1 Session-Centric Frontend Core

**Decision**: Treat backtest session as first-class persisted domain object in frontend
**Rationale**:
- Manual discretionary backtesting requires resumable context (pair, timeframe, range, replay point, account state).
- Existing "last 7 days only" flow prevented deterministic backtest iteration.
- Session-scoped persistence is needed before realistic execution and journaling milestones.

**Decision**: Persist session metadata + snapshot + session entities in Dexie
**Rationale**:
- Keeps v1 single-user/local-first with no backend auth dependency.
- Supports immediate resume without round-trip to backend for local state.
- Provides compatible storage foundation for future journal and analytics tables.

**Decision**: Aggregate timeframe client-side from M1 bars
**Rationale**:
- Avoids backend contract churn while milestone sequence is still evolving.
- Keeps replay loop deterministic against a single loaded source bar set.
- Enables `M1/M5/M15/H1/H4/D1` without changing existing NAS100 data route semantics.

---

## 2026-02-17 - Milestone 2 Realistic Execution Lifecycle

**Decision**: Evaluate pending orders and SL/TP using bar high/low semantics
**Rationale**:
- Manual backtest realism requires trigger checks beyond close-only ticks.
- Deterministic high/low evaluation better approximates real trigger behavior.
- Keeps replay deterministic while remaining computationally cheap.

**Decision**: Add deterministic session event log in local persistence
**Rationale**:
- Backtest audits need a reproducible execution trail for fills/cancels/closes.
- Event sequences support debugging mismatched PnL or lifecycle behavior.
- Local event persistence keeps MVP fully offline and resumable.

**Decision**: Implement partial close and close-all at position layer
**Rationale**:
- Discretionary workflows commonly scale out and flatten across multiple positions.
- Encoding this in engine/state avoids duplicated UI-side accounting logic.

---

## 2026-02-17 - Milestone 3 Risk UX Guardrails

**Decision**: Enforce order-type directional constraints against current bid/ask
**Rationale**:
- Prevents unrealistic discretionary entries (for example invalid buy-stop below market).
- Reduces user error and keeps backtests closer to executable conditions.

**Decision**: Surface account risk metrics directly in trading view side panel
**Rationale**:
- Risk-aware discretionary decisions need live visibility of open risk and exposure.
- Explicit max-drawdown/open-risk feedback helps avoid accidental overleveraging.

---

## 2026-02-17 - Milestone 4 Timeframe Request Parity

**Decision**: Add optional `timeframe` and `sessionId` query params to data route
**Rationale**:
- Keeps backend observability aligned with session-centric replay architecture.
- Allows deterministic tracing of replay requests by session/run context.
- Enables optional server-side aggregation for debugging/parity without forcing a frontend rewrite.

---

## 2026-02-17 - Milestone 5 Cross-Session Analytics

**Decision**: Compute cross-session analytics from persisted local trades
**Rationale**:
- Users need more than single-session metrics to evaluate discretionary improvements over time.
- Local aggregation preserves offline-first behavior and avoids backend dependency for v1.

---

## 2026-02-17 - Milestone 6 Hardening and Test Baseline

**Decision**: Use Bun test runner for deterministic engine-level test coverage
**Rationale**:
- Zero-friction test runtime in existing stack.
- Covers core correctness paths (fills, stops, PnL, risk, aggregation) quickly on every change.

**Decision**: Exclude Bun test files from Svelte production typecheck scope
**Rationale**:
- Prevents false-negative build checks due to test-only runtime modules (`bun:test`).
- Keeps production `svelte-check` output signal clean for release gating.
