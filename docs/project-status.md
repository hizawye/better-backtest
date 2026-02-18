# Project Status

Last Updated: 2026-02-18 (lightweight-charts rollback + TradingView-style UI declutter pass)

## Current Progress
- Reverted frontend chart rendering back to `lightweight-charts` in `Chart.svelte` and removed `@qfo/qfchart`/`echarts` dependencies.
- Preserved drawing/risk overlay interactions using `lightweight-charts` coordinate mapping (`coordinateToTime` / `priceToCoordinate`).
- Reworked top controls into grouped/foldable interactions:
  - `Market`, `Dates`, `Session` controls are now foldouts
  - foldouts are mutually exclusive and close on outside click or `Escape`
- Replaced checkbox/toggle-style layout controls with command-style `View` actions and workspace presets.
- Flattened UI chrome to reduce border/box density across the trade shell (header, watchlist, right rail, bottom dock, toolbar).
- Reduced scrollbar clutter by removing nested rail scrolling at the shell layer and standardizing thin scrollbar styling.
- Updated typography to `IBM Plex Sans` (UI) + `IBM Plex Mono` (numeric/mono).

## Verification Status
- `npm run --prefix packages/frontend check` passes with `0 errors / 0 warnings`.
- `npm run --prefix packages/frontend build` completes successfully.

## Blockers / Bugs
- No compile/build blockers.
- Pending visual/manual QA:
  - desktop/mobile overlay behavior for watchlist/right rail/tool dock combinations
  - foldout positioning/readability on smaller viewports
  - trade shell spacing polish vs TradingView reference

## Next Immediate Starting Point
1. Run manual UI QA on the `trade` page at desktop/tablet/mobile breakpoints.
2. Fine-tune spacing and density for the topbar if any foldout overlap appears in real usage.
3. Consider lazy-loading heavier trade-page modules to reduce initial bundle size warning.
