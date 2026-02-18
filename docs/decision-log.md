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

---

## 2026-02-17 - Trade Page Vertical Freeze Hardening

**Decision**: Move chart into a dedicated bounded flex host under the warning banner
**Rationale**:
- Warning/banner UI and `height: 100%` chart siblings can over-constrain layout and trigger repeated resize churn.
- A dedicated `chart-host` (`flex: 1; min-height: 0`) guarantees bounded chart height independent of banner visibility.

**Decision**: Add global shrink-safe grid/flex constraints for trade layout containers
**Rationale**:
- `min-height: 0`/`minmax(0, ...)` are required in nested grid/flex layouts to prevent min-content expansion loops.
- Explicit overflow boundaries keep panel/chart internals from forcing parent growth.

**Decision**: Replace raw ResizeObserver -> applyOptions loop with deduped, RAF-coalesced resize updates
**Rationale**:
- Reapplying identical dimensions from ResizeObserver can create feedback loops and browser stalls.
- Flooring dimensions + no-op dedupe + single-frame coalescing makes resize behavior deterministic and loop-resistant.

---

## 2026-02-17 - Replay Controls Select Event Correctness

**Decision**: Read select values from `change` event targets instead of relying on `bind:value` state inside the same handler.
**Rationale**:
- In Svelte, `on:change` handlers can observe pre-bind values, which caused stale timeframe/pair/speed/session values to be submitted.
- Direct event-target reads make control changes deterministic and remove one-step-lag/revert behavior in timeframe switching.

---

## 2026-02-17 - Terminal-Style Trade UI Overhaul

**Decision**: Redesign trade screen around a dense terminal workspace (clustered top toolbar, chart shell header, right rail ticket, tabbed bottom dock).
**Rationale**:
- Existing UI lacked hierarchy and density expected in discretionary backtesting workflows.
- FXReplay/TradingView-inspired interaction structure improves readability, control discoverability, and screen efficiency.

**Decision**: Introduce a stronger design token system with dedicated surface tiers and typography (`IBM Plex Sans/Mono`) while keeping existing runtime logic unchanged.
**Rationale**:
- Consistent tokens are required to scale panel styling and state colors without ad-hoc CSS drift.
- Monospace numeric typography materially improves quote/time/metric scanning in trading UIs.

---

## 2026-02-17 - UI Parity Second Pass (Workspace + Dock Content)

**Decision**: Add explicit chart workspace chrome (platform strip, tool rail, OHLC telemetry row, chart footer status) while keeping replay/execution behavior untouched.
**Rationale**:
- The first visual pass improved shell structure but still lacked recognizable chart-workspace affordances from FXReplay/TradingView.
- A dedicated chrome layer improves scanability and perceived product maturity without changing trade logic or data flow.

**Decision**: Bring all dock content tabs onto the same terminal design system instead of mixing redesigned shell with legacy table/form styles.
**Rationale**:
- Mixed-era styling made the interface feel inconsistent even when core shell looked improved.
- Unified panel styling (headers, pills, table density, cards) creates a coherent UX and better visual hierarchy for trading workflows.

---

## 2026-02-17 - Trade UI De-Bento Refinement

**Decision**: Remove non-functional visual chrome (top platform strip and left chart tool rail) and keep only controls wired to trading/replay behavior.
**Rationale**:
- Decorative controls reduced trust and made the workspace feel like a mockup instead of a trading terminal.
- A stricter functional hierarchy better matches TradingView/FxReplay expectations for production workflows.

**Decision**: Flatten right rail and analytics/metrics layouts from card-grid presentation into table-like terminal sections.
**Rationale**:
- Card-heavy composition created the "bento box" look and wasted vertical space.
- Flat rows and section dividers improve scan speed for risk, order, and performance data.

---

## 2026-02-17 - Codex TradingView MCP Integration

**Decision**: Use `atilaahmettaner/tradingview-mcp` as the default TradingView data/tool connector for Codex MCP.
**Rationale**:
- Provides a practical initial tool surface for market screening and technical-analysis queries (`top_gainers`, `top_losers`, Bollinger/candle scans, per-symbol analysis).
- Works as a zero-code integration path by launching directly from Git via `uv tool run`.

**Decision**: Register MCP with an absolute `uv` binary path in Codex config (`/home/nagara/.local/bin/uv`).
**Rationale**:
- Avoids shell PATH drift between interactive shells and Codex runtime.
- Keeps MCP server startup deterministic across sessions.

---

## 2026-02-17 - Session-Scoped Workspace Persistence + TV-Style Shell

**Decision**: Persist trade workspace UI layout as first-class session data (`watchlistVisible`, right/bottom drawer state+tab, `compactToolbar`) using Dexie `workspacePrefs`.
**Rationale**:
- Backtesting workflows need stable panel context between sessions, not just order/position/trade state.
- Preserving panel layout removes friction when switching between scenario sessions.

**Decision**: Move risk entry controls from chart-local overlay region into a dedicated right drawer risk context.
**Rationale**:
- Keeps chart viewport visually clean and focused on price action/drawing interactions.
- Aligns with TradingView-like contextual side panels and improves discoverability of risk workflow controls.

**Decision**: Restructure trade page into three-zone workspace (watchlist rail, chart core, contextual right drawer) plus a collapsible bottom results drawer.
**Rationale**:
- Reduces border-heavy block layout and improves visual hierarchy for fast scan/use.
- Makes navigation and tool access more predictable for active replay/backtesting loops.

---

## 2026-02-17 - Risk Overlay Parity + Modal/Rail Order Form Unification

**Decision**: Add TradingView-style interactive risk overlay primitives directly in `Chart.svelte` and keep `+page.svelte` as the source of truth via patch callbacks (`onRiskDraftAdjust`).
**Rationale**:
- Preserves current backtest engine semantics while enabling responsive drag interactions and live metric chips.
- Prevents chart-local state drift by routing drag mutations through the page/store layer.

**Decision**: Extract shared order math/validation into `order-form-controller.ts` and consume it from both `OrderPanel` and `PlaceOrderModal`.
**Rationale**:
- Removes duplicated business rules and prevents rail/modal behavior divergence.
- Keeps sizing/risk/tick precision logic consistent with existing execution pathways.

**Decision**: Implement dual-surface order UX (right rail quick edit + floating full ticket modal) and make Save & Journal populate journal context.
**Rationale**:
- Supports both fast iteration and detailed order authoring without hiding existing rail workflows.
- Reduces post-trade journaling friction by auto-seeding context from the submitted order.

**Decision**: Shift trade shell toward icon-first minimalist density with lower border contrast and subtle-fast motion timings.
**Rationale**:
- Addresses previous feedback about heavy borders/text and lifeless visuals.
- Improves scan speed and interaction feel while keeping chart performance priorities intact.

---

## 2026-02-18 - UI Declutter and Typography Refresh

**Decision**: Replace the legacy vertical chart tool rail with a compact floating dock that uses section tabs (`tools`, `arrange`, `style`) and persist its state per workspace.
**Rationale**:
- Removes always-on dense icon stacks and extra internal scrolling that made the chart area feel cramped.
- Keeps advanced drawing/style actions available while making default workspace cleaner for replay workflows.

**Decision**: Standardize frontend typography on `Manrope` (UI) and `JetBrains Mono` (numeric/data) and remove hardcoded IBM Plex font usage.
**Rationale**:
- Previous font mix felt inconsistent and too technical for non-data text.
- A simpler two-font system improves readability and visual coherence across rails, tables, and overlays.

**Decision**: Flatten panel/table surfaces (`OrderPanel`, `PositionTable`, `TradeHistory`, `JournalPanel`, `EventLogPanel`) to reduce border-heavy card composition.
**Rationale**:
- Excessive boxes and separators reduced scanability and contributed to visual noise.
- Softer surfaces, rounded grouping, and reduced line density preserve hierarchy without the “boxed-in” look.

---

## 2026-02-18 - TradingView-Inspired Control System (Foldable Groups + Layout Menu)

**Decision**: Replace standalone header toggle buttons with a single `Layout` menu that controls workspace panels and active rail/dock tabs.
**Rationale**:
- The old toggle strip was visually noisy and fragmented related actions.
- A grouped layout control center improves discoverability and reduces toolbar clutter.

**Decision**: Convert replay controls into foldable groups for related settings (`Market`, `Dates`, `Session`).
**Rationale**:
- Timeframe/date/session controls are related but infrequent during replay; always-on controls consumed too much horizontal space.
- Foldable groups keep the topbar compact while preserving fast access when needed.

**Decision**: Remove chart-local dock open/close toggle button and rely on layout-level visibility control.
**Rationale**:
- Eliminates duplicate toggle patterns and keeps interaction model consistent.
- Reduces floating UI chrome inside the chart viewport.

---

## 2026-02-18 - QFChart Adoption + Foldout Interaction Hardening

**Decision**: Replace `lightweight-charts` with `@qfo/qfchart` (`echarts` peer) for trade chart rendering.
**Rationale**:
- Aligns chart capabilities with the desired advanced trading UX direction while keeping existing backtest and overlay logic intact.
- Enables direct data/pixel coordinate conversion needed by existing drawing/risk interaction layers.

**Decision**: Make replay control foldouts (`Market`, `Dates`, `Session`) mutually exclusive and auto-close on outside click / `Escape`.
**Rationale**:
- Prevents stacked popovers from creating visual clutter in the topbar.
- Produces a cleaner, faster control workflow closer to TradingView interaction patterns.

**Decision**: Finalize topbar interaction model around command-style view actions and remove legacy checkbox/toggle patterns.
**Rationale**:
- Checkbox/toggle-heavy controls felt noisy and fragmented.
- Command actions with workspace presets improve discoverability and reduce control clutter.

**Decision**: Flatten shell surfaces and standardize typography/scroll behavior (`IBM Plex Sans` + `IBM Plex Mono`, thin scrollbars, no nested side-rail scroll container).
**Rationale**:
- Directly addresses feedback about excessive boxes, poor typography feel, and too many visible scrollbars.
- Preserves information density while reducing friction and visual noise.

---

## 2026-02-18 - Chart Engine Rollback to Lightweight Charts

**Decision**: Roll back chart engine from `@qfo/qfchart` (`echarts`) to `lightweight-charts`.
**Rationale**:
- User preference favored the prior rendering/interaction feel over the QFChart integration.
- Existing drawing and risk overlays already have stable `lightweight-charts` coordinate logic.

**Decision**: Keep UI declutter and foldout control-system refactors while reverting only the chart engine layer.
**Rationale**:
- Preserves improvements to borders/boxes, control grouping, and scrollbar reduction.
- Limits rollback scope to charting stack and avoids undoing unrelated UX gains.
