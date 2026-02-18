<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tradingStore } from '$lib/stores/trading';
  import { positionManager } from '$lib/engine/positions';
  import { orderBook } from '$lib/engine/orderbook';
  import { computeAnalyticsSnapshot, computeCrossSessionAnalytics } from '$lib/engine/analytics';
  import {
    createPendingOrder,
    evaluateStopsOnBar,
    executeMarketOrder,
    tryFillOrderOnBar
  } from '$lib/engine/execution';
  import { closePosition } from '$lib/engine/pnl';
  import { calculateRiskBasedSize, validateStopTargets } from '$lib/engine/risk';
  import { toTickDistance } from '$lib/engine/order-form-controller';
  import {
    createDefaultDrawingStyle,
    isDrawingTool
  } from '$lib/engine/chart-tools';
  import {
    buildChartEntryIntent,
    deriveRiskSide,
    type ChartEntryOrderMode,
    type ChartEntrySizingMode
  } from '$lib/engine/chart-entry';
  import {
    getDrawingSnapshot,
    getDrawings,
    getSessionEvents,
    getSessionEntities,
    getJournalEntries,
    getToolPrefs,
    getWorkspacePrefs,
    listAllTrades,
    getSnapshot,
    listSessions,
    saveAttachment,
    saveAnalyticsSnapshot,
    saveDrawingSnapshot,
    saveDrawings,
    saveJournalEntry,
    saveSession,
    saveSessionEvents,
    saveSessionEntities,
    saveSnapshot,
    saveToolPrefs,
    saveWorkspacePrefs
  } from '$lib/db/ticks';
  import {
    legacyDrawingsToSnapshot,
    resolveEngineToolFromAppTool,
    snapshotToLegacyDrawings
  } from '$lib/engine/tdraw-bridge';
  import type {
    BacktestSession,
    Bar,
    DrawingEngineSnapshotV1,
    DrawingEntity,
    DrawingPoint,
    DrawingStyle,
    DrawingToolType,
    RiskOverlayMetrics,
    RiskToolDraft,
    SessionEvent,
    SessionSnapshot,
    ToolDockSection,
    Timeframe,
    TradingPair,
    WorkspaceBottomTab,
    WorkspaceRightTab
  } from '$shared/types';
  import { PAIR_CATEGORIES, PAIR_LABELS, PAIR_SPREADS } from '$shared/types';
  import AnalyticsPanel from '$lib/components/AnalyticsPanel.svelte';
  import AccountMetricsPanel from '$lib/components/AccountMetricsPanel.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import ChartTdraw from '$lib/components/ChartTdraw.svelte';
  import EventLogPanel from '$lib/components/EventLogPanel.svelte';
  import JournalPanel from '$lib/components/JournalPanel.svelte';
  import OrderPanel from '$lib/components/OrderPanel.svelte';
  import PositionTable from '$lib/components/PositionTable.svelte';
  import TradeHistory from '$lib/components/TradeHistory.svelte';
  import ReplayControls from '$lib/components/ReplayControls.svelte';
  import PlaceOrderModal, { type SaveAndJournalPayload } from '$lib/components/PlaceOrderModal.svelte';
  import '../../app.css';

  const SESSION_NAME_PREFIX = 'Backtest Session';
  const TIMEFRAME_TO_MS: Record<Timeframe, number> = {
    M1: 60_000,
    M5: 300_000,
    M15: 900_000,
    H1: 3_600_000,
    H4: 14_400_000,
    D1: 86_400_000
  };
  const WATCHLIST_PAIRS: TradingPair[] = ['NAS100', 'US500', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'];
  const USE_TDRAW_TOOLS =
    import.meta.env.VITE_USE_TDRAW_TOOLS === '1' ||
    import.meta.env.VITE_USE_TDRAW_TOOLS === 'true';

  let sessions: BacktestSession[] = [];
  $: currentPair = $tradingStore.currentPair;
  $: currentTimeframe = $tradingStore.currentTimeframe;
  $: rangeFrom = $tradingStore.rangeFrom;
  $: rangeTo = $tradingStore.rangeTo;
  $: sessionId = $tradingStore.sessionId;
  $: sessionName = $tradingStore.sessionName;
  $: bars = $tradingStore.bars;
  $: currentBar = $tradingStore.currentBar;
  $: isPlaying = $tradingStore.isPlaying;
  $: balance = $tradingStore.balance;
  $: orders = $tradingStore.orders;
  $: positions = $tradingStore.positions;
  $: trades = $tradingStore.trades;
  $: currentIndex = $tradingStore.currentIndex;
  $: totalBars = $tradingStore.totalBars;
  $: spread = $tradingStore.spread;
  $: currentTick = $tradingStore.currentTick;
  $: equity = $tradingStore.equity;
  $: sessionEvents = $tradingStore.sessionEvents;
  $: drawings = $tradingStore.drawings;
  $: activeTool = $tradingStore.activeTool;
  $: selectedDrawingId = $tradingStore.selectedDrawingId;
  $: magnetEnabled = $tradingStore.magnetEnabled;
  $: drawingsVisible = $tradingStore.drawingsVisible;
  $: toolStylePresets = $tradingStore.toolStylePresets;
  $: watchlistVisible = $tradingStore.watchlistVisible;
  $: rightDrawerOpen = $tradingStore.rightDrawerOpen;
  $: rightDrawerTab = $tradingStore.rightDrawerTab;
  $: bottomDrawerOpen = $tradingStore.bottomDrawerOpen;
  $: bottomDrawerTab = $tradingStore.bottomDrawerTab;
  $: compactToolbar = $tradingStore.compactToolbar;
  $: toolDockOpen = $tradingStore.toolDockOpen;
  $: toolDockSection = $tradingStore.toolDockSection;
  $: selectedDrawing = selectedDrawingId
    ? drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null
    : null;
  $: styleEditor = resolveStyleEditorState(selectedDrawing, activeTool);
  $: analyticsSnapshot = $tradingStore.analyticsSnapshot;
  $: crossSessionAnalytics = $tradingStore.crossSessionAnalytics;
  $: chartViewKey = `${currentPair}_${currentTimeframe}_${rangeFrom}_${rangeTo}`;
  $: unrealizedPnL = equity - balance;
  $: replayProgressPct = totalBars > 0 ? (currentIndex / totalBars) * 100 : 0;
  $: activeTimestampLabel = currentBar ? new Date(currentBar.timestamp).toLocaleString() : '--';
  $: openPanelCount = [watchlistVisible, rightDrawerOpen, bottomDrawerOpen, toolDockOpen].filter(Boolean).length;

  let worker: Worker | null = null;
  let isLoading = false;
  let errorMessage = '';
  let warningMessage = '';
  let isBootstrapping = true;
  let lastAnalyticsTradeCount = -1;
  let latestLoadRequestId = 0;
  let drawingPersistTimer: ReturnType<typeof setTimeout> | null = null;
  let tdrawSnapshotSeed: DrawingEngineSnapshotV1 | null = null;
  let latestTdrawSnapshot: DrawingEngineSnapshotV1 | null = null;
  let riskDraftSeed: DrawingPoint | null = null;
  let riskDraft: RiskToolDraft | null = null;
  let riskPanelError = '';
  let riskOrderType: ChartEntryOrderMode = 'market';
  let riskSizingMode: ChartEntrySizingMode = 'fixed';
  let riskLotSize = 0.1;
  let riskPercent = 1;
  let riskTakeProfit = '';
  let riskOverlayMetrics: RiskOverlayMetrics | null = null;
  let placeOrderOpen = false;
  let layoutMenu: HTMLDetailsElement | null = null;
  let journalPrefill: {
    id: string;
    setupTags: string[];
    notes: string;
    confidence: number;
    checklist: string;
    tradeId?: string;
  } | null = null;

  const chartTools: Array<{ id: DrawingToolType; label: string; icon: string }> = [
    { id: 'cursor', label: 'Cursor', icon: '⌖' },
    { id: 'trend_line', label: 'Trend', icon: '╱' },
    { id: 'horizontal_line', label: 'Horizontal', icon: '═' },
    { id: 'vertical_line', label: 'Vertical', icon: '║' },
    { id: 'ray', label: 'Ray', icon: '➤' },
    { id: 'extended_line', label: 'Extended', icon: '⟷' },
    { id: 'rectangle', label: 'Rectangle', icon: '▭' },
    { id: 'text', label: 'Text', icon: 'T' },
    { id: 'arrow', label: 'Arrow', icon: '➜' },
    { id: 'ruler', label: 'Ruler', icon: '⌗' },
    { id: 'fibonacci', label: 'Fibonacci', icon: 'Φ' },
    { id: 'brush', label: 'Brush', icon: '✎' },
    { id: 'risk_position', label: 'Risk', icon: 'R' }
  ];

  const dockTabs: Array<{ id: WorkspaceBottomTab; label: string }> = [
    { id: 'positions', label: 'Positions' },
    { id: 'trades', label: 'Trades' },
    { id: 'events', label: 'Events' },
    { id: 'journal', label: 'Journal' },
    { id: 'analytics', label: 'Analytics' }
  ];
  const rightDrawerTabs: Array<{ id: WorkspaceRightTab; label: string; icon: string }> = [
    { id: 'order', label: 'Order', icon: '◎' },
    { id: 'risk', label: 'Risk', icon: 'R' },
    { id: 'account', label: 'Account', icon: '◌' }
  ];

  type LoadDataOverrides = Partial<{
    pair: TradingPair;
    timeframe: Timeframe;
    from: number;
    to: number;
    sessionId: string;
    spread: number;
    replayAnchor: number | null;
  }>;

  interface LoadDataRequestConfig {
    pair: TradingPair;
    timeframe: Timeframe;
    from: number;
    to: number;
    sessionId: string;
    spread: number;
    replayAnchor: number | null;
  }

  function resolveLoadDataRequestConfig(overrides: LoadDataOverrides = {}): LoadDataRequestConfig {
    return {
      pair: overrides.pair ?? tradingStore.currentPair,
      timeframe: overrides.timeframe ?? tradingStore.currentTimeframe,
      from: overrides.from ?? tradingStore.rangeFrom,
      to: overrides.to ?? tradingStore.rangeTo,
      sessionId: overrides.sessionId ?? tradingStore.sessionId,
      spread: overrides.spread ?? tradingStore.spread,
      replayAnchor: overrides.replayAnchor ?? tradingStore.currentBar?.timestamp ?? null
    };
  }

  function medianBarIntervalMs(localBars: Bar[]): number | null {
    if (localBars.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < localBars.length; i += 1) {
      const gap = localBars[i].timestamp - localBars[i - 1].timestamp;
      if (gap > 0) gaps.push(gap);
      if (gaps.length >= 200) break;
    }
    if (gaps.length === 0) return null;
    gaps.sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    if (gaps.length % 2 === 0) {
      return Math.round((gaps[middle - 1] + gaps[middle]) / 2);
    }
    return gaps[middle];
  }

  function formatInterval(ms: number): string {
    if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)}d`;
    if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
    return `${Math.round(ms / 60_000)}m`;
  }

  function formatPrice(value: number): string {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    });
  }

  function formatPairPrice(value: number): string {
    const digits = PAIR_CATEGORIES[currentPair] === 'index' ? 3 : 5;
    return value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatMoney(value: number): string {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatTicks(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '--';
    const digits = PAIR_CATEGORIES[currentPair] === 'index' ? 3 : 1;
    return value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatSpread(pair: TradingPair): string {
    const spreadValue = PAIR_SPREADS[pair];
    const decimals = pair === 'NAS100' || pair === 'US500' ? 2 : 5;
    return spreadValue.toFixed(decimals);
  }

  function dockCount(tab: WorkspaceBottomTab): number {
    if (tab === 'positions') return positions.length;
    if (tab === 'trades') return trades.length;
    if (tab === 'events') return sessionEvents.length;
    if (tab === 'journal') return $tradingStore.journalEntries.length;
    return analyticsSnapshot ? analyticsSnapshot.totalTrades : 0;
  }

  function applyWorkspacePrefs(prefs?: {
    watchlistVisible?: boolean;
    rightDrawerOpen?: boolean;
    rightDrawerTab?: WorkspaceRightTab;
    bottomDrawerOpen?: boolean;
    bottomDrawerTab?: WorkspaceBottomTab;
    compactToolbar?: boolean;
    toolDockOpen?: boolean;
    toolDockSection?: ToolDockSection;
  }) {
    tradingStore.setWatchlistVisible(prefs?.watchlistVisible ?? true);
    tradingStore.setRightDrawerOpen(prefs?.rightDrawerOpen ?? true);
    tradingStore.setRightDrawerTab(prefs?.rightDrawerTab ?? 'order');
    tradingStore.setBottomDrawerOpen(prefs?.bottomDrawerOpen ?? true);
    tradingStore.setBottomDrawerTab(prefs?.bottomDrawerTab ?? 'positions');
    tradingStore.setCompactToolbar(prefs?.compactToolbar ?? false);
    tradingStore.setToolDockOpen(prefs?.toolDockOpen ?? true);
    tradingStore.setToolDockSection(prefs?.toolDockSection ?? 'tools');
  }

  async function persistWorkspacePrefs(targetSessionId = sessionId) {
    if (!targetSessionId) return;
    await saveWorkspacePrefs(targetSessionId, {
      watchlistVisible,
      rightDrawerOpen,
      rightDrawerTab,
      bottomDrawerOpen,
      bottomDrawerTab,
      compactToolbar,
      toolDockOpen,
      toolDockSection
    });
  }

  function toggleWatchlist() {
    setWatchlistVisible(!watchlistVisible);
  }

  function setWatchlistVisible(open: boolean) {
    tradingStore.setWatchlistVisible(open);
    void persistWorkspacePrefs();
  }

  function toggleToolDock() {
    setToolDockOpen(!toolDockOpen);
  }

  function setToolDockOpen(open: boolean) {
    tradingStore.setToolDockOpen(open);
    void persistWorkspacePrefs();
  }

  function setToolDockSection(section: ToolDockSection) {
    tradingStore.setToolDockOpen(true);
    tradingStore.setToolDockSection(section);
    void persistWorkspacePrefs();
  }

  function setBottomDrawerTab(tab: WorkspaceBottomTab) {
    tradingStore.setBottomDrawerOpen(true);
    tradingStore.setBottomDrawerTab(tab);
    void persistWorkspacePrefs();
  }

  function toggleBottomDrawer() {
    setBottomDrawerOpen(!bottomDrawerOpen);
  }

  function setBottomDrawerOpen(open: boolean) {
    tradingStore.setBottomDrawerOpen(open);
    void persistWorkspacePrefs();
  }

  function setRightDrawerTab(tab: WorkspaceRightTab) {
    tradingStore.setRightDrawerOpen(true);
    tradingStore.setRightDrawerTab(tab);
    void persistWorkspacePrefs();
  }

  function toggleRightDrawer() {
    setRightDrawerOpen(!rightDrawerOpen);
  }

  function setRightDrawerOpen(open: boolean) {
    tradingStore.setRightDrawerOpen(open);
    void persistWorkspacePrefs();
  }

  function closeLayoutMenu() {
    if (layoutMenu?.open) {
      layoutMenu.open = false;
    }
  }

  function handleRightRailTabFromMenu(tab: WorkspaceRightTab) {
    setRightDrawerTab(tab);
    closeLayoutMenu();
  }

  function handleBottomTabFromMenu(tab: WorkspaceBottomTab) {
    setBottomDrawerTab(tab);
    closeLayoutMenu();
  }

  function runViewCommand(command: 'watchlist' | 'right_rail' | 'bottom_dock' | 'tool_dock' | 'focus_chart' | 'restore_workspace') {
    if (command === 'watchlist') {
      setWatchlistVisible(!watchlistVisible);
      closeLayoutMenu();
      return;
    }
    if (command === 'right_rail') {
      setRightDrawerOpen(!rightDrawerOpen);
      closeLayoutMenu();
      return;
    }
    if (command === 'bottom_dock') {
      setBottomDrawerOpen(!bottomDrawerOpen);
      closeLayoutMenu();
      return;
    }
    if (command === 'tool_dock') {
      setToolDockOpen(!toolDockOpen);
      closeLayoutMenu();
      return;
    }

    const expanded = command === 'restore_workspace';
    tradingStore.setWatchlistVisible(expanded);
    tradingStore.setRightDrawerOpen(expanded);
    tradingStore.setBottomDrawerOpen(expanded);
    tradingStore.setToolDockOpen(expanded);
    void persistWorkspacePrefs();
    closeLayoutMenu();
  }

  function buildSnapshotFromLegacy(
    sourceDrawings: DrawingEntity[],
    targetSessionId: string,
    targetPair: TradingPair
  ): DrawingEngineSnapshotV1 {
    return legacyDrawingsToSnapshot(sourceDrawings, {
      bars: tradingStore.bars,
      activeTool: resolveEngineToolFromAppTool(tradingStore.activeTool),
      snapMode: tradingStore.magnetEnabled ? 'weak' : 'off',
      meta: {
        sessionId: targetSessionId,
        pair: targetPair,
        migratedFromLegacy: true
      }
    });
  }

  function drawingSyncToken(sourceDrawings: DrawingEntity[]): string {
    return sourceDrawings
      .map((drawing) =>
        [
          drawing.id,
          drawing.tool,
          drawing.points.length,
          drawing.updatedAt,
          drawing.hidden ? 1 : 0,
          drawing.locked ? 1 : 0,
          drawing.zIndex ?? 0
        ].join(':')
      )
      .join('|');
  }

  function snapshotMatchesDrawings(
    snapshot: DrawingEngineSnapshotV1,
    sourceDrawings: DrawingEntity[],
    targetSessionId: string,
    targetPair: TradingPair
  ): boolean {
    const projected = snapshotToLegacyDrawings(snapshot, {
      sessionId: targetSessionId,
      pair: targetPair,
      bars: tradingStore.bars
    });
    return drawingSyncToken(projected) === drawingSyncToken(sourceDrawings);
  }

  async function persistDrawingsForContext(
    targetSessionId = sessionId,
    targetPair = currentPair,
    sourceDrawings = tradingStore.drawings
  ) {
    if (!targetSessionId) return;

    const fallbackSnapshot = buildSnapshotFromLegacy(sourceDrawings, targetSessionId, targetPair);
    const snapshot =
      USE_TDRAW_TOOLS &&
      latestTdrawSnapshot &&
      snapshotMatchesDrawings(latestTdrawSnapshot, sourceDrawings, targetSessionId, targetPair)
        ? latestTdrawSnapshot
        : fallbackSnapshot;

    tdrawSnapshotSeed = snapshot;

    await Promise.all([
      saveDrawings(targetSessionId, targetPair, sourceDrawings),
      saveDrawingSnapshot(targetSessionId, targetPair, snapshot)
    ]);
  }

  function queueDrawingPersist(targetSessionId = sessionId, targetPair = currentPair) {
    if (!targetSessionId) return;
    if (drawingPersistTimer) clearTimeout(drawingPersistTimer);
    drawingPersistTimer = setTimeout(() => {
      void persistDrawingsForContext(targetSessionId, targetPair, tradingStore.drawings);
      drawingPersistTimer = null;
    }, 160);
  }

  async function loadDrawingsForContext(targetSessionId: string, targetPair: TradingPair) {
    const [snapshot, loaded] = await Promise.all([
      getDrawingSnapshot(targetSessionId, targetPair),
      getDrawings(targetSessionId, targetPair)
    ]);

    if (snapshot) {
      const hydrated = snapshotToLegacyDrawings(snapshot, {
        sessionId: targetSessionId,
        pair: targetPair,
        bars: tradingStore.bars
      });
      tradingStore.setDrawings(hydrated.length > 0 || loaded.length === 0 ? hydrated : loaded);
      tdrawSnapshotSeed = snapshot;
      latestTdrawSnapshot = snapshot;
    } else {
      tradingStore.setDrawings(loaded);
      const bridged = buildSnapshotFromLegacy(loaded, targetSessionId, targetPair);
      tdrawSnapshotSeed = bridged;
      latestTdrawSnapshot = bridged;
    }

    tradingStore.setSelectedDrawing(null);
  }

  function handleTdrawSnapshotChange(snapshot: DrawingEngineSnapshotV1) {
    latestTdrawSnapshot = snapshot;
    tdrawSnapshotSeed = snapshot;
  }

  function handleToolSelect(tool: DrawingToolType) {
    tradingStore.setActiveTool(tool);
    if (tool !== 'risk_position') {
      riskDraftSeed = null;
      riskDraft = null;
      riskPanelError = '';
    } else {
      tradingStore.setRightDrawerOpen(true);
      tradingStore.setRightDrawerTab('risk');
      void persistWorkspacePrefs();
    }
    void persistToolPrefs();
  }

  function handleToggleMagnet() {
    tradingStore.setMagnetEnabled(!magnetEnabled);
    void persistToolPrefs();
  }

  function handleToggleDrawingsVisible() {
    tradingStore.setDrawingsVisible(!drawingsVisible);
    void persistToolPrefs();
  }

  async function persistToolPrefs(targetSessionId = sessionId) {
    if (!targetSessionId) return;
    await saveToolPrefs(targetSessionId, {
      activeTool,
      magnetEnabled,
      drawingsVisible,
      stylePresets: toolStylePresets
    });
  }

  function normalizeDrawing(input: DrawingEntity): DrawingEntity {
    const toolStyle = toolStylePresets[input.tool];
    return {
      ...input,
      sessionId,
      pair: currentPair,
      style: toolStyle ? { ...toolStyle } : input.style,
      text: input.tool === 'text' ? input.text || 'Note' : input.text,
      updatedAt: Date.now()
    };
  }

  function handleCreateDrawing(input: DrawingEntity) {
    const drawing = normalizeDrawing(input);
    tradingStore.addDrawing(drawing);
    tradingStore.setSelectedDrawing(drawing.id);
    appendSessionEvent('drawing_created', { drawingId: drawing.id, tool: drawing.tool });
    queueDrawingPersist();
  }

  function handleUpdateDrawing(input: DrawingEntity) {
    tradingStore.updateDrawing(input.id, { ...input, updatedAt: Date.now() });
    appendSessionEvent('drawing_updated', { drawingId: input.id, tool: input.tool });
    queueDrawingPersist();
  }

  function handleDeleteDrawing(drawingId: string) {
    const drawing = drawings.find((item) => item.id === drawingId);
    if (!drawing) return;
    tradingStore.removeDrawing(drawingId);
    appendSessionEvent('drawing_deleted', { drawingId, tool: drawing.tool });
    queueDrawingPersist();
  }

  function resolveStyleEditorState(
    drawing: DrawingEntity | null,
    tool: DrawingToolType
  ): DrawingStyle {
    if (drawing) {
      return drawing.style;
    }

    if (isDrawingTool(tool)) {
      return toolStylePresets[tool] ?? createDefaultDrawingStyle(tool);
    }

    return createDefaultDrawingStyle('trend_line');
  }

  function applyStyleChange(partial: Partial<DrawingStyle>) {
    if (selectedDrawing) {
      handleUpdateDrawing({
        ...selectedDrawing,
        style: {
          ...selectedDrawing.style,
          ...partial
        }
      });
    }

    const targetTool = selectedDrawing?.tool ?? (isDrawingTool(activeTool) ? activeTool : null);
    if (!targetTool) return;

    const currentStyle = toolStylePresets[targetTool] ?? createDefaultDrawingStyle(targetTool);
    tradingStore.setToolStylePreset(targetTool, {
      ...currentStyle,
      ...partial
    });
    void persistToolPrefs();
  }

  function duplicateSelectedDrawing() {
    if (!selectedDrawing) return;
    const now = Date.now();
    const duplicate: DrawingEntity = {
      ...selectedDrawing,
      id: `draw_${now}_${Math.random().toString(36).slice(2, 8)}`,
      points: selectedDrawing.points.map((point) => ({ ...point })),
      createdAt: now,
      updatedAt: now,
      zIndex: now
    };
    tradingStore.addDrawing(duplicate);
    tradingStore.setSelectedDrawing(duplicate.id);
    appendSessionEvent('drawing_created', { drawingId: duplicate.id, tool: duplicate.tool, source: selectedDrawing.id });
    queueDrawingPersist();
  }

  function toggleSelectedDrawingLock() {
    if (!selectedDrawing) return;
    handleUpdateDrawing({
      ...selectedDrawing,
      locked: !selectedDrawing.locked
    });
  }

  function toggleSelectedDrawingHidden() {
    if (!selectedDrawing) return;
    handleUpdateDrawing({
      ...selectedDrawing,
      hidden: !selectedDrawing.hidden
    });
  }

  function moveSelectedDrawing(direction: 'front' | 'back') {
    if (!selectedDrawing) return;
    const zValues = drawings.map((drawing) => drawing.zIndex ?? 0);
    const maxZ = zValues.length > 0 ? Math.max(...zValues) : Date.now();
    const minZ = zValues.length > 0 ? Math.min(...zValues) : Date.now();
    handleUpdateDrawing({
      ...selectedDrawing,
      zIndex: direction === 'front' ? maxZ + 1 : minZ - 1
    });
  }

  function handleRiskDraftPoint(point: DrawingPoint) {
    if (activeTool !== 'risk_position') return;
    if (!riskDraftSeed) {
      riskDraftSeed = point;
      riskDraft = null;
      riskPanelError = '';
      appendSessionEvent('risk_tool_opened', { entry: point });
      return;
    }

    const side = deriveRiskSide(riskDraftSeed.price, point.price);
    riskDraft = {
      entry: riskDraftSeed,
      stop: point,
      side,
      takeProfit: null,
      createdAt: Date.now()
    };
    riskOrderType = 'market';
    riskSizingMode = 'fixed';
    riskLotSize = 0.1;
    riskPercent = 1;
    riskTakeProfit = '';
    riskPanelError = '';
    riskDraftSeed = null;
  }

  function applyRiskTakeProfitInput(value: string) {
    riskTakeProfit = value;
    if (!riskDraft) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      riskDraft = {
        ...riskDraft,
        takeProfit: null
      };
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    riskDraft = {
      ...riskDraft,
      takeProfit: {
        timestamp: riskDraft.entry.timestamp,
        price: parsed
      }
    };
  }

  function handleRiskDraftAdjust(patch: Partial<RiskToolDraft>) {
    if (!riskDraft) return;
    const nextEntry = patch.entry ?? riskDraft.entry;
    const nextStop = patch.stop ?? riskDraft.stop;
    const nextTakeProfit =
      patch.takeProfit === undefined ? riskDraft.takeProfit ?? null : patch.takeProfit ?? null;
    const nextSide = deriveRiskSide(nextEntry.price, nextStop.price);

    riskDraft = {
      ...riskDraft,
      ...patch,
      entry: nextEntry,
      stop: nextStop,
      takeProfit: nextTakeProfit,
      side: nextSide
    };
    riskTakeProfit = nextTakeProfit ? String(nextTakeProfit.price) : '';
  }

  function deriveRiskOverlayMetrics(): RiskOverlayMetrics | null {
    if (!riskDraft) return null;

    const entryPrice = riskDraft.entry.price;
    const stopPrice = riskDraft.stop.price;
    const targetPrice = riskDraft.takeProfit?.price ?? null;
    const riskDistance = Math.abs(entryPrice - stopPrice);
    if (!Number.isFinite(riskDistance) || riskDistance <= 0 || entryPrice <= 0) return null;

    let resolvedSize = riskLotSize;
    if (riskSizingMode === 'risk_percent') {
      resolvedSize = calculateRiskBasedSize(equity, riskPercent, entryPrice, stopPrice, currentPair).size;
    }
    if (!Number.isFinite(resolvedSize) || resolvedSize <= 0) {
      resolvedSize = 0;
    }

    const pointValue = PAIR_CATEGORIES[currentPair] === 'index' ? 1 : 10;
    const riskAmount = riskDistance * resolvedSize * pointValue;
    const rewardDistance = targetPrice !== null ? Math.abs(targetPrice - entryPrice) : null;
    const targetAmount = rewardDistance !== null ? rewardDistance * resolvedSize * pointValue : null;
    const rewardRatio =
      rewardDistance !== null && riskDistance > 0 ? rewardDistance / riskDistance : null;
    const ticksToStop = toTickDistance(currentPair, riskDistance);
    const ticksToTarget = rewardDistance !== null ? toTickDistance(currentPair, rewardDistance) : null;
    const pctToStop = (riskDistance / Math.abs(entryPrice)) * 100;
    const pctToTarget =
      rewardDistance !== null ? (rewardDistance / Math.abs(entryPrice)) * 100 : null;
    const markPrice = currentTick
      ? (riskDraft.side === 'buy' ? currentTick.bid : currentTick.ask)
      : (currentBar?.close ?? entryPrice);
    const direction = riskDraft.side === 'buy' ? 1 : -1;
    const openPnlEstimate = (markPrice - entryPrice) * direction * resolvedSize * pointValue;

    const topLabel =
      targetPrice === null
        ? 'Target: -- (-- ) --, Amount: --'
        : `Target: ${formatTicks(ticksToTarget)} (${pctToTarget?.toFixed(2)}%) ${formatPairPrice(targetPrice)}, Amount: ${formatMoney(targetAmount ?? 0)}`;
    const middleLabel = `Open P&L: ${openPnlEstimate >= 0 ? '+' : ''}${formatMoney(openPnlEstimate)}, Qty: ${resolvedSize.toFixed(2)}${
      rewardRatio === null ? ', Risk/Reward Ratio: --' : `, Risk/Reward Ratio: ${rewardRatio.toFixed(2)}`
    }`;
    const bottomLabel = `Stop: ${formatTicks(ticksToStop)} (${pctToStop.toFixed(2)}%) ${formatPairPrice(stopPrice)}, Amount: ${formatMoney(riskAmount)}`;

    return {
      side: riskDraft.side,
      size: resolvedSize,
      openPnlEstimate,
      rewardRatio,
      riskAmount,
      targetAmount,
      ticksToStop,
      ticksToTarget,
      pctToStop,
      pctToTarget,
      entryPrice,
      stopPrice,
      targetPrice,
      topLabel,
      middleLabel,
      bottomLabel
    };
  }

  $: riskOverlayMetrics = deriveRiskOverlayMetrics();

  function cancelRiskDraft() {
    riskDraft = null;
    riskDraftSeed = null;
    riskPanelError = '';
    if (activeTool === 'risk_position') {
      tradingStore.setActiveTool('cursor');
      void persistToolPrefs();
    }
  }

  function openPlaceOrderModal() {
    placeOrderOpen = true;
  }

  function closePlaceOrderModal() {
    placeOrderOpen = false;
  }

  function handleSaveAndJournal(payload: SaveAndJournalPayload) {
    const tags = [currentPair, currentTimeframe, payload.side, payload.orderType];
    const checklist = [
      `Pair: ${currentPair}`,
      `Timeframe: ${currentTimeframe}`,
      `Side: ${payload.side.toUpperCase()}`,
      `Type: ${payload.orderType.toUpperCase()}`,
      `Size: ${payload.size.toFixed(2)}`,
      `Risk %: ${payload.riskPercent.toFixed(2)}`
    ];
    journalPrefill = {
      id: `prefill_${Date.now()}`,
      setupTags: tags,
      notes: `Planned ${payload.side.toUpperCase()} ${payload.orderType.toUpperCase()} @ ${formatPairPrice(payload.entryPrice)} | SL ${payload.stopLoss ? formatPairPrice(payload.stopLoss) : '--'} | TP ${payload.takeProfit ? formatPairPrice(payload.takeProfit) : '--'}`,
      confidence: 3,
      checklist: checklist.join('\n')
    };
    tradingStore.setBottomDrawerOpen(true);
    tradingStore.setBottomDrawerTab('journal');
    void persistWorkspacePrefs();
  }

  function resolveReplayMarketContext() {
    const timestamp = currentBar?.timestamp ?? Date.now();
    const mid = currentBar?.close ?? 0;
    const bid = $tradingStore.currentTick?.bid ?? mid - spread / 2;
    const ask = $tradingStore.currentTick?.ask ?? mid + spread / 2;
    return { timestamp, bid, ask };
  }

  function confirmRiskDraft() {
    if (!riskDraft) return;
    riskPanelError = '';
    const market = resolveReplayMarketContext();
    const takeProfit =
      riskDraft.takeProfit?.price ??
      (riskTakeProfit.trim().length > 0 ? Number(riskTakeProfit) : undefined);

    const intent = buildChartEntryIntent({
      draft: riskDraft,
      orderMode: riskOrderType,
      market,
      pair: currentPair
    });

    const stopValidation = validateStopTargets({
      side: intent.side,
      entryPrice: intent.entryPrice,
      stopLoss: riskDraft.stop.price,
      takeProfit
    });

    if (stopValidation) {
      riskPanelError = stopValidation;
      return;
    }

    let size = riskLotSize;
    if (riskSizingMode === 'risk_percent') {
      const riskCalc = calculateRiskBasedSize(
        equity,
        riskPercent,
        intent.entryPrice,
        riskDraft.stop.price,
        currentPair
      );
      size = riskCalc.size;
      if (size <= 0) {
        riskPanelError = 'Unable to compute size from risk inputs.';
        return;
      }
    }

    if (size <= 0) {
      riskPanelError = 'Size must be greater than zero.';
      return;
    }

    const riskAmount =
      riskOverlayMetrics?.riskAmount ?? Math.abs(intent.entryPrice - riskDraft.stop.price) * size;

    if (riskOrderType === 'market') {
      const position = executeMarketOrder(
        intent.side,
        size,
        market.bid,
        market.ask,
        market.timestamp,
        {
          sessionId,
          stopLoss: riskDraft.stop.price,
          takeProfit,
          riskAmount,
          slippage: $tradingStore.slippage
        }
      );
      positionManager.add(position);
      tradingStore.addPosition(position);
      appendSessionEvent('position_opened', { positionId: position.id, side: position.side, size: position.size, source: 'risk_tool' });
    } else {
      const pending = createPendingOrder({
        sessionId,
        type: riskOrderType,
        side: intent.side,
        size,
        createdAt: market.timestamp,
        price: riskOrderType === 'limit' ? intent.entryPrice : undefined,
        stopPrice: riskOrderType === 'stop' ? intent.entryPrice : undefined,
        stopLoss: riskDraft.stop.price,
        takeProfit,
        riskAmount
      });
      orderBook.add(pending);
      tradingStore.addOrder(pending);
      appendSessionEvent('order_placed', { orderId: pending.id, type: pending.type, side: pending.side, size: pending.size, source: 'risk_tool' });
    }

    appendSessionEvent('risk_tool_confirmed', {
      side: intent.side,
      orderType: riskOrderType,
      entryPrice: intent.entryPrice,
        stopLoss: riskDraft.stop.price,
        takeProfit: takeProfit ?? null,
        size
    });
    riskDraft = null;
    riskDraftSeed = null;
    tradingStore.setActiveTool('cursor');
    void persistToolPrefs();
  }

  function handlePositionLevelDrag(payload: { positionId: string; level: 'stopLoss' | 'takeProfit'; price: number }) {
    const updated = positionManager.update(payload.positionId, { [payload.level]: payload.price });
    if (!updated) return;
    tradingStore.setPositions(positionManager.getAll());
    appendSessionEvent('position_level_dragged', payload);
  }

  onMount(async () => {
    initWorker();
    await bootstrapSessions();
    isBootstrapping = false;
  });

  onDestroy(() => {
    void persistCurrentSession();
    if (drawingPersistTimer) {
      clearTimeout(drawingPersistTimer);
      drawingPersistTimer = null;
    }
    if (worker) {
      worker.terminate();
    }
  });

  async function bootstrapSessions() {
    sessions = await listSessions();

    if (sessions.length === 0) {
      const created = createSessionDefinition();
      await saveSession(created);
      sessions = [created];
    }

    await loadSession(sessions[0].id);
  }

  function createSessionDefinition(): BacktestSession {
    const now = Date.now();
    const rangeTo = now;
    const rangeFrom = rangeTo - 7 * 24 * 60 * 60 * 1000;
    const defaultPair: TradingPair = 'NAS100';
    const sessionNumber = sessions.length + 1;

    return {
      id: `session_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: `${SESSION_NAME_PREFIX} ${sessionNumber}`,
      createdAt: now,
      updatedAt: now,
      lastReplayIndex: 0,
      config: {
        pair: defaultPair,
        timeframe: 'M1',
        from: rangeFrom,
        to: rangeTo,
        startingBalance: 10000,
        execution: {
          spread: PAIR_SPREADS[defaultPair],
          slippage: 0.3,
          commissionPerLot: 0
        }
      }
    };
  }

  async function persistCurrentSession() {
    if (!sessionId || isBootstrapping) return;

    const now = Date.now();
    const updatedSession: BacktestSession = {
      id: sessionId,
      name: sessionName,
      createdAt: sessions.find((session) => session.id === sessionId)?.createdAt ?? now,
      updatedAt: now,
      lastReplayIndex: currentIndex,
      config: {
        pair: currentPair,
        timeframe: currentTimeframe,
        from: rangeFrom,
        to: rangeTo,
        startingBalance: balance,
        execution: {
          spread: $tradingStore.spread,
          slippage: $tradingStore.slippage,
          commissionPerLot: $tradingStore.commissionPerLot
        }
      }
    };

    await saveSession(updatedSession);

    await saveSessionEntities(sessionId, {
      orders,
      positions,
      trades
    });
    await saveSessionEvents(sessionId, sessionEvents);
    await persistDrawingsForContext(sessionId, currentPair, drawings);
    await persistToolPrefs(sessionId);
    await persistWorkspacePrefs(sessionId);

    const snapshot: SessionSnapshot = {
      sessionId,
      savedAt: now,
      currentIndex,
      balance,
      equity: $tradingStore.equity,
      orders,
      positions,
      trades
    };
    await saveSnapshot(snapshot);

    sessions = await listSessions();
    appendSessionEvent('session_saved', { orders: orders.length, positions: positions.length, trades: trades.length });
  }

  async function loadSession(targetSessionId: string) {
    const session = sessions.find((item) => item.id === targetSessionId);
    if (!session) return;

    await persistCurrentSession();

    tradingStore.applySession(session);
    tradingStore.setDrawings([]);
    tradingStore.setSelectedDrawing(null);
    tdrawSnapshotSeed = null;
    latestTdrawSnapshot = null;

    const [snapshot, entities, events, journalEntries, prefs, workspacePrefs] = await Promise.all([
      getSnapshot(targetSessionId),
      getSessionEntities(targetSessionId),
      getSessionEvents(targetSessionId),
      getJournalEntries(targetSessionId),
      getToolPrefs(targetSessionId),
      getWorkspacePrefs(targetSessionId)
    ]);

    orderBook.replaceAll(entities.orders);
    positionManager.replaceAll(entities.positions);
    tradingStore.setOrders(entities.orders);
    tradingStore.setPositions(entities.positions);
    tradingStore.setTrades(entities.trades);
    tradingStore.setSessionEvents(events);
    tradingStore.setJournalEntries(journalEntries);
    tradingStore.setToolStylePresets({});
    if (prefs) {
      tradingStore.setActiveTool(prefs.activeTool);
      tradingStore.setMagnetEnabled(prefs.magnetEnabled);
      tradingStore.setDrawingsVisible(prefs.drawingsVisible);
      tradingStore.setToolStylePresets(prefs.stylePresets);
    } else {
      tradingStore.setActiveTool('cursor');
      tradingStore.setMagnetEnabled(false);
      tradingStore.setDrawingsVisible(true);
    }
    applyWorkspacePrefs(workspacePrefs);

    if (snapshot) {
      tradingStore.setBalance(snapshot.balance);
      tradingStore.setEquity(snapshot.equity);
      tradingStore.setProgress(snapshot.currentIndex, $tradingStore.totalBars);
    }

    await loadData({
      pair: session.config.pair,
      timeframe: session.config.timeframe,
      from: session.config.from,
      to: session.config.to,
      sessionId: session.id,
      spread: session.config.execution.spread
    });
    await loadDrawingsForContext(targetSessionId, session.config.pair);
    appendSessionEvent('session_loaded', { sessionId: targetSessionId });
    await refreshCrossSessionAnalytics();
  }

  async function createSession() {
    await persistCurrentSession();
    const session = createSessionDefinition();
    await saveSession(session);
    sessions = await listSessions();
    await loadSession(session.id);
  }

  async function duplicateSession() {
    const source = sessions.find((session) => session.id === sessionId);
    if (!source) {
      await createSession();
      return;
    }

    await persistCurrentSession();
    const now = Date.now();
    const duplicate: BacktestSession = {
      ...source,
      id: `session_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      lastReplayIndex: 0
    };
    await saveSession(duplicate);
    sessions = await listSessions();
    await loadSession(duplicate.id);
  }

  async function loadData(overrides: LoadDataOverrides = {}) {
    const requestId = ++latestLoadRequestId;
    const requestConfig = resolveLoadDataRequestConfig(overrides);
    isLoading = true;
    errorMessage = '';
    warningMessage = '';

    try {
      const response = await fetch(
        `/api/data/${requestConfig.pair}/${requestConfig.from}/${requestConfig.to}?sessionId=${encodeURIComponent(requestConfig.sessionId)}&timeframe=${requestConfig.timeframe}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        timeframe?: string;
        bars?: Bar[];
      };
      const timeframeBars = (data.bars ?? []).slice().sort((a, b) => a.timestamp - b.timestamp);

      if (timeframeBars.length === 0) {
        throw new Error('No market data found for selected range.');
      }

      const diagnostics: string[] = [];
      if (typeof data.timeframe === 'string' && data.timeframe !== requestConfig.timeframe) {
        diagnostics.push(`API responded with ${data.timeframe}, expected ${requestConfig.timeframe}.`);
      }

      const detectedIntervalMs = medianBarIntervalMs(timeframeBars);
      const expectedIntervalMs = TIMEFRAME_TO_MS[requestConfig.timeframe];
      if (detectedIntervalMs !== null) {
        const toleranceMs = Math.max(1_000, Math.floor(expectedIntervalMs * 0.2));
        if (Math.abs(detectedIntervalMs - expectedIntervalMs) > toleranceMs) {
          diagnostics.push(
            `Loaded interval is ~${formatInterval(detectedIntervalMs)} while selected timeframe is ${requestConfig.timeframe}.`
          );
          console.warn('[data] timeframe mismatch detected', {
            pair: requestConfig.pair,
            timeframe: requestConfig.timeframe,
            expectedIntervalMs,
            detectedIntervalMs,
            bars: timeframeBars.length
          });
        }
      }

      if (requestId !== latestLoadRequestId) return;

      warningMessage = diagnostics.join(' ');
      tradingStore.setSourceBars(timeframeBars);
      tradingStore.setBars(timeframeBars);
      tradingStore.resetForReplay();

      if (worker) {
        worker.postMessage({
          type: 'init',
          payload: {
            bars: timeframeBars,
            spread: requestConfig.spread,
            sessionId: requestConfig.sessionId,
            timeframe: requestConfig.timeframe
          }
        });
      }

      if (requestConfig.replayAnchor) {
        seekToTimestamp(requestConfig.replayAnchor, timeframeBars);
      }
    } catch (error) {
      if (requestId !== latestLoadRequestId) return;
      console.error('Failed to load data:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to load data';
    } finally {
      if (requestId === latestLoadRequestId) {
        isLoading = false;
      }
    }
  }

  function initWorker() {
    worker = new Worker(
      new URL('$lib/workers/tick-replay.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'tick') {
        tradingStore.setCurrentBar(payload.bar);
        tradingStore.setCurrentTick(payload.tick);
        tradingStore.setProgress(payload.index, payload.total);

        processOrderLifecycle(payload.bar, payload.tick.bid, payload.tick.ask, payload.tick.timestamp);

        // Update positions
        positionManager.updatePrices(payload.tick.bid, payload.tick.ask);
        const positions = positionManager.getAll();
        tradingStore.setPositions(positions);

        // Update equity
        const unrealizedPnL = positionManager.getTotalUnrealizedPnL();
        tradingStore.updateEquity(balance + unrealizedPnL);
      } else if (type === 'complete') {
        tradingStore.setPlaying(false);
      }
    };
  }

  function processOrderLifecycle(bar: { high: number; low: number }, bid: number, ask: number, timestamp: number) {
    const pending = orderBook.getPending();
    let didChange = false;

    for (const order of pending) {
      const filled = tryFillOrderOnBar(order, {
        timestamp,
        open: bid,
        high: bar.high,
        low: bar.low,
        close: bid
      }, spread, timestamp, $tradingStore.slippage);
      if (!filled || typeof filled.order.filledPrice !== 'number') continue;

      orderBook.fill(order.id, filled.order.filledPrice, timestamp);
      positionManager.add(filled.position);
      tradingStore.addPosition(filled.position);
      appendSessionEvent('order_filled', {
        orderId: order.id,
        positionId: filled.position.id,
        fillPrice: filled.order.filledPrice
      });
      appendSessionEvent('position_opened', {
        positionId: filled.position.id,
        side: filled.position.side,
        size: filled.position.size
      });
      didChange = true;
    }

    const positions = positionManager.getAll();
    for (const position of positions) {
      const stopState = evaluateStopsOnBar(position, {
        timestamp,
        open: bid,
        high: bar.high,
        low: bar.low,
        close: bid
      }, spread);
      if (!stopState.stopHit && !stopState.takeProfitHit) continue;

      const trade = closePosition(position, bid, ask, timestamp, {
        pair: currentPair,
        commissionPerLot: $tradingStore.commissionPerLot,
        exitPrice: stopState.exitPrice,
        slippage: $tradingStore.slippage,
        closeReason: stopState.stopHit ? 'stop_loss' : 'take_profit'
      });

      positionManager.remove(position.id);
      tradingStore.removePosition(position.id);
      tradingStore.addTrade(trade);
      tradingStore.updateBalance(trade.realizedPnL);
      appendSessionEvent('position_closed', {
        positionId: position.id,
        tradeId: trade.id,
        reason: trade.closeReason
      });
      didChange = true;
    }

    if (didChange) {
      tradingStore.setOrders(orderBook.getAll());
      tradingStore.setPositions(positionManager.getAll());
    }
  }

  function handlePlayPause() {
    if (!worker) return;

    if (isPlaying) {
      worker.postMessage({ type: 'pause' });
      tradingStore.setPlaying(false);
    } else {
      worker.postMessage({ type: 'play' });
      tradingStore.setPlaying(true);
    }
  }

  function handleSpeedChange(speed: number) {
    if (!worker) return;
    worker.postMessage({ type: 'setSpeed', payload: { speed } });
    tradingStore.setSpeed(speed);
  }

  function handleReset() {
    if (!worker) return;
    worker.postMessage({ type: 'reset' });
    tradingStore.resetForReplay();
  }

  async function handlePairChange(pair: TradingPair) {
    cancelRiskDraft();
    if (sessionId) {
      await persistDrawingsForContext(sessionId, currentPair, drawings);
    }
    tradingStore.setDrawings([]);
    tradingStore.setSelectedDrawing(null);
    tdrawSnapshotSeed = null;
    latestTdrawSnapshot = null;
    const nextSpread = PAIR_SPREADS[pair];
    tradingStore.setCurrentPair(pair);
    tradingStore.setExecutionConfig({ spread: nextSpread });
    if (worker) {
      worker.postMessage({ type: 'applyExecutionConfig', payload: { spread: nextSpread } });
    }
    await loadData({ pair, spread: nextSpread });
    await loadDrawingsForContext(sessionId, pair);
  }

  async function handleTimeframeChange(timeframe: Timeframe) {
    tradingStore.setTimeframe(timeframe);
    appendSessionEvent('timeframe_changed', { timeframe });
    await loadData({ timeframe });
  }

  async function handleDateRangeChange(from: number, to: number) {
    tradingStore.setDateRange(from, to);
    await loadData({ from, to });
  }

  async function handleSaveSession() {
    await persistCurrentSession();
  }

  async function handleSaveJournalEntry(entry: import('$shared/types').JournalEntry, files: File[]) {
    await saveJournalEntry(entry);
    tradingStore.addJournalEntry(entry);
    appendSessionEvent('journal_entry_added', { journalEntryId: entry.id });

    for (const file of files) {
      await saveAttachment({
        id: `att_${entry.id}_${file.name}_${Date.now()}`,
        sessionId,
        journalEntryId: entry.id,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        createdAt: Date.now(),
        blob: file
      });
    }
  }

  function downloadBlob(fileName: string, content: string, contentType: string) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportSessionJson() {
    const payload = {
      sessionId,
      pair: currentPair,
      timeframe: currentTimeframe,
      trades,
      journalEntries: $tradingStore.journalEntries,
      analytics: analyticsSnapshot
    };
    downloadBlob(
      `${sessionName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
  }

  function exportSessionCsv() {
    const headers = [
      'id',
      'side',
      'size',
      'entryPrice',
      'exitPrice',
      'entryTime',
      'exitTime',
      'realizedPnL',
      'pips',
      'commission',
      'slippage',
      'rMultiple',
      'closeReason'
    ];
    const rows = trades.map((trade) => [
      trade.id,
      trade.side,
      trade.size,
      trade.entryPrice,
      trade.exitPrice,
      new Date(trade.entryTime).toISOString(),
      new Date(trade.exitTime).toISOString(),
      trade.realizedPnL,
      trade.pips,
      trade.commission || 0,
      trade.slippage || 0,
      trade.rMultiple || '',
      trade.closeReason || ''
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    downloadBlob(
      `${sessionName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.csv`,
      csv,
      'text/csv'
    );
  }

  function appendSessionEvent(type: SessionEvent['type'], payload?: Record<string, unknown>) {
    if (!sessionId) return;
    const currentEvents = tradingStore.sessionEvents;
    const sequence =
      currentEvents.length > 0
        ? currentEvents[currentEvents.length - 1].sequence + 1
        : 1;
    tradingStore.addSessionEvent({
      id: `event_${sessionId}_${sequence}`,
      sessionId,
      sequence,
      type,
      timestamp: Date.now(),
      payload
    });
  }

  function seekToTimestamp(targetTimestamp: number, localBars = bars) {
    if (localBars.length === 0 || !worker) return;

    let index = 0;
    for (let i = 0; i < localBars.length; i += 1) {
      if (localBars[i].timestamp <= targetTimestamp) {
        index = i;
      } else {
        break;
      }
    }

    worker.postMessage({ type: 'seekTimestamp', payload: { timestamp: targetTimestamp } });
    tradingStore.setProgress(index, localBars.length);
    appendSessionEvent('replay_seek', { index, timestamp: targetTimestamp });
  }

  $: if (!isBootstrapping && sessionId && trades.length !== lastAnalyticsTradeCount) {
    lastAnalyticsTradeCount = trades.length;
    const snapshot = computeAnalyticsSnapshot(sessionId, trades, balance - trades.reduce((sum, t) => sum + t.realizedPnL, 0));
    tradingStore.setAnalyticsSnapshot(snapshot);
    void saveAnalyticsSnapshot(snapshot);
    void refreshCrossSessionAnalytics();
    appendSessionEvent('analytics_updated', { trades: trades.length });
  }

  async function refreshCrossSessionAnalytics() {
    const allTrades = await listAllTrades();
    tradingStore.setCrossSessionAnalytics(computeCrossSessionAnalytics(allTrades));
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (e.key === 'Escape' && placeOrderOpen) {
      e.preventDefault();
      closePlaceOrderModal();
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      handlePlayPause();
    } else if (e.key === 'b') {
      e.preventDefault();
      toggleBottomDrawer();
    } else if (e.key === 'w') {
      e.preventDefault();
      toggleWatchlist();
    } else if (e.key === 'o') {
      e.preventDefault();
      toggleRightDrawer();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      openPlaceOrderModal();
    } else if (e.key === 'Escape' && (riskDraft || riskDraftSeed)) {
      e.preventDefault();
      cancelRiskDraft();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app-container tradingview-shell" class:bottom-open={bottomDrawerOpen}>
  <div class="header terminal-header">
    <div class="control-strip">
      <div class="brand-block">
        <h1 class="mono">{currentPair}</h1>
        <div class="brand-sub mono">
          <span>{currentTimeframe}</span>
          <span>{sessionName}</span>
        </div>
      </div>
      <ReplayControls
        onPlayPause={handlePlayPause}
        onSpeedChange={handleSpeedChange}
        onReset={handleReset}
        onPairChange={handlePairChange}
        onTimeframeChange={handleTimeframeChange}
        onDateRangeChange={handleDateRangeChange}
        onCreateSession={createSession}
        onDuplicateSession={duplicateSession}
        onSaveSession={handleSaveSession}
        onLoadSession={loadSession}
        {sessions}
        activeSessionId={sessionId}
      />
      <div class="workspace-menu mono">
        <details class="layout-menu" bind:this={layoutMenu}>
          <summary>
            <span>View</span>
            <strong>{openPanelCount}/4</strong>
          </summary>
          <div class="layout-sheet">
            <section>
              <h3>Panels</h3>
              <div class="layout-actions">
                <button class:active={watchlistVisible} on:click={() => runViewCommand('watchlist')}>
                  {watchlistVisible ? 'Hide Watchlist' : 'Show Watchlist'}
                </button>
                <button class:active={rightDrawerOpen} on:click={() => runViewCommand('right_rail')}>
                  {rightDrawerOpen ? 'Hide Right Rail' : 'Show Right Rail'}
                </button>
                <button class:active={bottomDrawerOpen} on:click={() => runViewCommand('bottom_dock')}>
                  {bottomDrawerOpen ? 'Hide Bottom Dock' : 'Show Bottom Dock'}
                </button>
                <button class:active={toolDockOpen} on:click={() => runViewCommand('tool_dock')}>
                  {toolDockOpen ? 'Hide Tool Dock' : 'Show Tool Dock'}
                </button>
              </div>
            </section>
            <section>
              <h3>Right Rail</h3>
              <div class="layout-actions">
                {#each rightDrawerTabs as tab}
                  <button class:active={rightDrawerTab === tab.id} on:click={() => handleRightRailTabFromMenu(tab.id)}>
                    {tab.label}
                  </button>
                {/each}
              </div>
            </section>
            <section>
              <h3>Bottom Dock</h3>
              <div class="layout-actions">
                {#each dockTabs as tab}
                  <button class:active={bottomDrawerTab === tab.id} on:click={() => handleBottomTabFromMenu(tab.id)}>
                    {tab.label}
                  </button>
                {/each}
              </div>
            </section>
            <section>
              <h3>Presets</h3>
              <div class="layout-actions">
                <button on:click={() => runViewCommand('focus_chart')}>Focus Chart</button>
                <button on:click={() => runViewCommand('restore_workspace')}>Restore Workspace</button>
              </div>
            </section>
          </div>
        </details>
        <button class="place-order-btn" on:click={openPlaceOrderModal} title="Place order (P)">Place Order</button>
      </div>
      <div class="header-metrics mono">
        <span>Balance ${balance.toFixed(2)}</span>
        <span class:positive={unrealizedPnL > 0} class:negative={unrealizedPnL < 0}>
          UPNL ${unrealizedPnL.toFixed(2)}
        </span>
        <span>Open {positions.length}</span>
        <span>Orders {orders.length}</span>
      </div>
    </div>
  </div>

  <div class="main-content workspace-grid" class:with-watchlist={watchlistVisible} class:with-right-drawer={rightDrawerOpen}>
    {#if watchlistVisible}
      <aside class="watchlist-panel">
        <div class="watchlist-head">
          <span>Watchlist</span>
          <button class="icon-inline" on:click={toggleWatchlist} title="Hide watchlist">✕</button>
        </div>
        <div class="watchlist-body">
          {#each WATCHLIST_PAIRS as pair}
            <button class="watch-item mono" class:active={currentPair === pair} on:click={() => void handlePairChange(pair)}>
              <span class="watch-symbol">{pair}</span>
              <span>{PAIR_LABELS[pair]}</span>
              <span class="watch-spread">Spr {formatSpread(pair)}</span>
            </button>
          {/each}
        </div>
      </aside>
    {/if}

    <div class="chart-area">
      <div class="chart-shell">
        <div class="chart-shell-head">
          <div class="instrument-line">
            <strong class="mono">{currentPair}</strong>
            <span>{currentTimeframe}</span>
            <span>Bars {bars.length}</span>
            {#if currentBar}
              <span class="mono ohlc-line">
                O {formatPrice(currentBar.open)} H {formatPrice(currentBar.high)} L {formatPrice(currentBar.low)} C {formatPrice(currentBar.close)}
              </span>
            {/if}
          </div>
          <div class="status-strip">
            {#if warningMessage}
              <span class="warning-pill">⚠ Data</span>
            {:else}
              <span class="ok-pill">● Live</span>
            {/if}
            <button class="panel-toggle mono" on:click={() => setBottomDrawerTab('events')}>
              ◴ {sessionEvents.length}
            </button>
          </div>
        </div>

        {#if isLoading}
          <div class="loading-overlay">
            <div class="spinner"></div>
            <p>Loading market data...</p>
          </div>
        {:else if errorMessage}
          <div class="error-overlay">
            <p class="error-message">{errorMessage}</p>
            <button class="btn" on:click={() => loadData()}>Retry</button>
          </div>
        {:else}
          {#if warningMessage}
            <div class="warning-banner">{warningMessage}</div>
          {/if}
          <div class="chart-host">
            <div class="chart-workspace">
              {#if toolDockOpen}
                <aside class="chart-toolbar">
                  <div class="dock-title mono">Chart Tools</div>
                  <div class="dock-sections">
                    <button class="dock-section mono" class:active={toolDockSection === 'tools'} on:click={() => setToolDockSection('tools')}>
                      Tools
                    </button>
                    <button class="dock-section mono" class:active={toolDockSection === 'arrange'} on:click={() => setToolDockSection('arrange')}>
                      Arrange
                    </button>
                    <button class="dock-section mono" class:active={toolDockSection === 'style'} on:click={() => setToolDockSection('style')}>
                      Style
                    </button>
                  </div>

                  {#if toolDockSection === 'tools'}
                    <div class="dock-grid">
                      {#each chartTools as tool}
                        <button
                          class="tool-btn mono"
                          class:active={activeTool === tool.id}
                          on:click={() => handleToolSelect(tool.id)}
                          title={tool.label}
                        >
                          <span aria-hidden="true">{tool.icon}</span>
                          <span class="sr-only">{tool.label}</span>
                        </button>
                      {/each}
                      <button class="tool-btn mono" class:active={magnetEnabled} on:click={handleToggleMagnet} title="Magnet mode">
                        <span aria-hidden="true">⌁</span>
                        <span class="sr-only">Magnet</span>
                      </button>
                      <button class="tool-btn mono" class:active={drawingsVisible} on:click={handleToggleDrawingsVisible} title="Toggle drawings">
                        <span aria-hidden="true">◉</span>
                        <span class="sr-only">Show drawings</span>
                      </button>
                    </div>
                    <button
                      class="tool-btn mono danger tool-clear"
                      on:click={() => {
                        for (const drawing of drawings) {
                          appendSessionEvent('drawing_deleted', { drawingId: drawing.id, tool: drawing.tool });
                        }
                        tradingStore.clearDrawings();
                        queueDrawingPersist();
                      }}
                      disabled={drawings.length === 0}
                      title="Clear drawings"
                    >
                      Clear Drawings
                    </button>
                  {:else if toolDockSection === 'arrange'}
                    <div class="dock-stack">
                      <button class="tool-btn mono" on:click={duplicateSelectedDrawing} disabled={!selectedDrawing} title="Duplicate selection">
                        Duplicate
                      </button>
                      <button class="tool-btn mono" on:click={toggleSelectedDrawingLock} disabled={!selectedDrawing} title={selectedDrawing?.locked ? 'Unlock' : 'Lock'}>
                        {selectedDrawing?.locked ? 'Unlock' : 'Lock'}
                      </button>
                      <button class="tool-btn mono" on:click={toggleSelectedDrawingHidden} disabled={!selectedDrawing} title={selectedDrawing?.hidden ? 'Unhide' : 'Hide'}>
                        {selectedDrawing?.hidden ? 'Unhide' : 'Hide'}
                      </button>
                      <button class="tool-btn mono" on:click={() => moveSelectedDrawing('front')} disabled={!selectedDrawing} title="Bring to front">
                        Bring Front
                      </button>
                      <button class="tool-btn mono" on:click={() => moveSelectedDrawing('back')} disabled={!selectedDrawing} title="Send to back">
                        Send Back
                      </button>
                    </div>
                  {:else}
                    <div class="dock-style-grid">
                      <label class="style-label">
                        <span>Color</span>
                        <input
                          type="color"
                          value={styleEditor.color}
                          on:input={(event) => applyStyleChange({ color: (event.currentTarget as HTMLInputElement).value })}
                        />
                      </label>
                      <label class="style-label">
                        <span>Width</span>
                        <select
                          value={String(styleEditor.lineWidth)}
                          on:change={(event) =>
                            applyStyleChange({ lineWidth: Number((event.currentTarget as HTMLSelectElement).value) })}
                        >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </label>
                      <label class="style-label">
                        <span>Line</span>
                        <select
                          value={styleEditor.lineStyle}
                          on:change={(event) =>
                            applyStyleChange({ lineStyle: (event.currentTarget as HTMLSelectElement).value as DrawingStyle['lineStyle'] })}
                        >
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                        </select>
                      </label>
                      <label class="style-label">
                        <span>Fill</span>
                        <input
                          type="range"
                          min="0"
                          max="0.9"
                          step="0.05"
                          value={String(styleEditor.fillOpacity ?? 0.12)}
                          on:input={(event) =>
                            applyStyleChange({ fillOpacity: Number((event.currentTarget as HTMLInputElement).value) })}
                        />
                      </label>
                      <label class="style-label">
                        <span>Text</span>
                        <input
                          type="number"
                          min="9"
                          max="28"
                          step="1"
                          value={String(styleEditor.textSize ?? 12)}
                          on:change={(event) =>
                            applyStyleChange({ textSize: Number((event.currentTarget as HTMLInputElement).value) })}
                        />
                      </label>
                    </div>
                  {/if}
                </aside>
              {/if}

              {#key chartViewKey}
                {#if USE_TDRAW_TOOLS}
                  <ChartTdraw
                    bars={bars}
                    currentBar={currentBar}
                    timeframe={currentTimeframe}
                    pair={currentPair}
                    {sessionId}
                    drawings={drawings}
                    drawingSnapshot={tdrawSnapshotSeed}
                    activeTool={activeTool}
                    selectedDrawingId={selectedDrawingId}
                    magnetEnabled={magnetEnabled}
                    drawingsVisible={drawingsVisible}
                    positions={positions}
                    {riskDraft}
                    riskDraftSeed={riskDraftSeed}
                    {riskOverlayMetrics}
                    onCreateDrawing={handleCreateDrawing}
                    onUpdateDrawing={handleUpdateDrawing}
                    onDeleteDrawing={handleDeleteDrawing}
                    onSelectDrawing={(drawingId) => tradingStore.setSelectedDrawing(drawingId)}
                    onSnapshotChange={handleTdrawSnapshotChange}
                    onRiskDraftPoint={handleRiskDraftPoint}
                    onRiskDraftAdjust={handleRiskDraftAdjust}
                    onPositionLevelDrag={handlePositionLevelDrag}
                  />
                {:else}
                  <Chart
                    bars={bars}
                    currentBar={currentBar}
                    timeframe={currentTimeframe}
                    pair={currentPair}
                    {sessionId}
                    drawings={drawings}
                    activeTool={activeTool}
                    selectedDrawingId={selectedDrawingId}
                    magnetEnabled={magnetEnabled}
                    drawingsVisible={drawingsVisible}
                    positions={positions}
                    {riskDraft}
                    riskDraftSeed={riskDraftSeed}
                    {riskOverlayMetrics}
                    onCreateDrawing={handleCreateDrawing}
                    onUpdateDrawing={handleUpdateDrawing}
                    onDeleteDrawing={handleDeleteDrawing}
                    onSelectDrawing={(drawingId) => tradingStore.setSelectedDrawing(drawingId)}
                    onRiskDraftPoint={handleRiskDraftPoint}
                    onRiskDraftAdjust={handleRiskDraftAdjust}
                    onPositionLevelDrag={handlePositionLevelDrag}
                  />
                {/if}
              {/key}
            </div>
          </div>
          <div class="chart-footer mono">
            <span>{activeTimestampLabel}</span>
            <span>Progress {replayProgressPct.toFixed(1)}%</span>
            <span>Spread {spread.toFixed(2)}</span>
            <button class="panel-toggle mono" on:click={() => setBottomDrawerTab('positions')}>
              ◫ {positions.length}
            </button>
          </div>
        {/if}
      </div>
    </div>

    {#if rightDrawerOpen}
      <aside class="side-panel right-rail">
        <div class="rail-head">
          <div class="rail-tabs">
            {#each rightDrawerTabs as tab}
              <button class="rail-tab" class:active={rightDrawerTab === tab.id} on:click={() => setRightDrawerTab(tab.id)}>
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            {/each}
          </div>
          <button class="icon-inline" on:click={toggleRightDrawer} title="Close right panel">✕</button>
        </div>
        {#if rightDrawerTab === 'order'}
          <div class="rail-pane">
            <div class="rail-order-head">
              <span class="mono">Quick Edit</span>
              <button class="panel-toggle mono" on:click={openPlaceOrderModal} title="Open full place order ticket (P)">
                ◎ Place
              </button>
            </div>
            <OrderPanel onSessionEvent={appendSessionEvent} />
          </div>
        {:else if rightDrawerTab === 'account'}
          <div class="rail-pane">
            <AccountMetricsPanel />
          </div>
        {:else}
          <div class="rail-pane risk-pane">
            {#if riskDraft}
              <div class="risk-panel">
                <div class="risk-panel-head">
                  <strong>Risk Entry</strong>
                  <span class="mono">{riskDraft.side.toUpperCase()}</span>
                </div>
                <div class="risk-panel-grid">
                  <label>
                    Side
                    <select bind:value={riskDraft.side}>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </select>
                  </label>
                  <label>
                    Type
                    <select bind:value={riskOrderType}>
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                      <option value="stop">Stop</option>
                    </select>
                  </label>
                  <label>
                    Size Mode
                    <select bind:value={riskSizingMode}>
                      <option value="fixed">Fixed</option>
                      <option value="risk_percent">Risk %</option>
                    </select>
                  </label>
                  {#if riskSizingMode === 'fixed'}
                    <label>
                      Lot Size
                      <input type="number" min="0.01" step="0.01" bind:value={riskLotSize} />
                    </label>
                  {:else}
                    <label>
                      Risk %
                      <input type="number" min="0.1" step="0.1" bind:value={riskPercent} />
                    </label>
                  {/if}
                  <label>
                    Entry
                    <input type="number" step="0.01" value={riskDraft.entry.price.toFixed(2)} readonly />
                  </label>
                  <label>
                    Stop
                    <input type="number" step="0.01" value={riskDraft.stop.price.toFixed(2)} readonly />
                  </label>
                  <label>
                    TP (optional)
                    <input
                      type="number"
                      step="0.01"
                      value={riskTakeProfit}
                      on:input={(event) => applyRiskTakeProfitInput((event.currentTarget as HTMLInputElement).value)}
                      placeholder="none"
                    />
                  </label>
                </div>
                {#if riskOverlayMetrics}
                  <div class="risk-summary mono">
                    <span>Risk ${formatMoney(riskOverlayMetrics.riskAmount)}</span>
                    <span>Qty {riskOverlayMetrics.size.toFixed(2)}</span>
                    <span>
                      RR {riskOverlayMetrics.rewardRatio === null ? '--' : riskOverlayMetrics.rewardRatio.toFixed(2)}
                    </span>
                  </div>
                {/if}
                {#if riskPanelError}
                  <p class="risk-error">{riskPanelError}</p>
                {/if}
                <div class="risk-panel-actions">
                  <button class="tool-btn mono" on:click={confirmRiskDraft}>Confirm</button>
                  <button class="tool-btn mono" on:click={cancelRiskDraft}>Cancel</button>
                </div>
              </div>
            {:else}
              <div class="risk-hint">
                <h3>Risk Tool</h3>
                <p>Select Risk from the chart toolbar, then click entry and stop on chart.</p>
                <button class="panel-toggle mono" on:click={() => handleToolSelect('risk_position')}>
                  Enable Risk Tool
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </aside>
    {/if}
  </div>

  <div class="bottom-panel" class:collapsed={!bottomDrawerOpen}>
    <div class="dock-tabs">
      {#each dockTabs as tab}
        <button class="dock-tab" class:active={bottomDrawerTab === tab.id} on:click={() => setBottomDrawerTab(tab.id)}>
          {tab.label}
          <span class="dock-count mono">{dockCount(tab.id)}</span>
        </button>
      {/each}
      <button class="dock-tab dock-collapse" on:click={toggleBottomDrawer}>
        {bottomDrawerOpen ? 'Hide' : 'Show'}
      </button>
    </div>

    {#if bottomDrawerOpen}
      <div class="dock-body">
        <section class="dock-panel" class:active={bottomDrawerTab === 'positions'}>
          <PositionTable onSessionEvent={appendSessionEvent} />
        </section>
        <section class="dock-panel" class:active={bottomDrawerTab === 'trades'}>
          <TradeHistory />
        </section>
        <section class="dock-panel" class:active={bottomDrawerTab === 'events'}>
          <EventLogPanel events={sessionEvents} />
        </section>
        <section class="dock-panel" class:active={bottomDrawerTab === 'journal'}>
          <JournalPanel onSaveEntry={handleSaveJournalEntry} prefill={journalPrefill} />
        </section>
        <section class="dock-panel" class:active={bottomDrawerTab === 'analytics'}>
          <AnalyticsPanel
            snapshot={analyticsSnapshot}
            crossSession={crossSessionAnalytics}
            onExportCsv={exportSessionCsv}
            onExportJson={exportSessionJson}
          />
        </section>
      </div>
    {/if}
  </div>

  <PlaceOrderModal
    open={placeOrderOpen}
    seedDraft={riskDraft}
    onClose={closePlaceOrderModal}
    onSessionEvent={appendSessionEvent}
    onSaveAndJournal={handleSaveAndJournal}
  />
</div>

<style>
  .tradingview-shell {
    grid-template-rows: 72px minmax(0, 1fr) 44px;
    transition: grid-template-rows 0.2s ease;
  }

  .tradingview-shell.bottom-open {
    grid-template-rows: 72px minmax(0, 1fr) 220px;
  }

  .terminal-header {
    padding: 0 10px;
    border-bottom: 0;
    background: rgba(7, 12, 19, 0.94);
    box-shadow: inset 0 -1px 0 rgba(95, 126, 162, 0.18);
  }

  .control-strip {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .brand-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 120px;
  }

  .brand-block h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #f4f8ff;
  }

  .brand-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: #7f98b6;
    min-width: 0;
  }

  .brand-sub span {
    padding: 0;
    border-radius: 0;
    background: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-menu {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
    white-space: nowrap;
  }

  .panel-toggle,
  .icon-inline,
  .place-order-btn {
    border: 0;
    background: rgba(43, 64, 89, 0.32);
    color: #b4c9e3;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 7px;
    transition: background 0.14s ease, color 0.14s ease, transform 0.14s ease;
  }

  .panel-toggle,
  .icon-inline {
    padding: 6px 10px;
  }

  .panel-toggle:hover,
  .icon-inline:hover,
  .place-order-btn:hover {
    background: rgba(62, 92, 126, 0.44);
  }

  .place-order-btn {
    color: #ebf5ff;
    background: rgba(70, 127, 201, 0.62);
    white-space: nowrap;
  }

  .icon-inline {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 8px;
  }

  .control-strip :global(.replay-controls) {
    flex: 1;
    min-width: 0;
  }

  .layout-menu {
    position: relative;
  }

  .layout-menu > summary {
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 7px;
    background: rgba(37, 57, 80, 0.4);
    color: #c0d4ec;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .layout-menu > summary::-webkit-details-marker {
    display: none;
  }

  .layout-menu > summary strong {
    color: #f0f6ff;
    font-weight: 700;
  }

  .layout-menu[open] > summary {
    background: rgba(62, 102, 151, 0.54);
  }

  .layout-sheet {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    width: 312px;
    border-radius: 10px;
    background: rgba(8, 14, 22, 0.98);
    box-shadow: 0 14px 30px rgba(2, 7, 13, 0.62);
    border: 1px solid rgba(86, 120, 157, 0.36);
    padding: 8px 10px;
    display: grid;
    gap: 0;
    z-index: 40;
  }

  .layout-sheet section {
    display: grid;
    gap: 7px;
    padding: 8px 0;
    border-top: 1px solid rgba(92, 124, 160, 0.22);
  }

  .layout-sheet section:first-child {
    border-top: 0;
    padding-top: 2px;
  }

  .layout-sheet h3 {
    margin: 0;
    font-size: 10px;
    letter-spacing: 0.48px;
    text-transform: uppercase;
    color: #8ea8c6;
  }

  .layout-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .layout-actions button {
    border: 0;
    border-radius: 7px;
    background: rgba(38, 56, 78, 0.44);
    color: #acc4e0;
    padding: 6px 9px;
    font-size: 10px;
    font-weight: 600;
    transition: background 0.14s ease, color 0.14s ease;
  }

  .layout-actions button:hover {
    background: rgba(60, 93, 130, 0.44);
  }

  .layout-actions button.active {
    color: #eff5ff;
    background: rgba(79, 136, 220, 0.52);
  }

  .header-metrics {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    white-space: nowrap;
    color: #9ab0cc;
  }

  .header-metrics span {
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(38, 56, 78, 0.24);
  }

  .header-metrics .positive {
    color: var(--bull);
  }

  .header-metrics .negative {
    color: var(--bear);
  }

  .workspace-grid {
    position: relative;
    display: block;
    padding: 8px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .watchlist-panel,
  .chart-area,
  .right-rail {
    background: rgba(8, 14, 22, 0.9);
    border-radius: 10px;
    border: 1px solid rgba(88, 118, 152, 0.22);
    box-shadow: 0 8px 22px rgba(3, 8, 14, 0.38);
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .workspace-grid.with-watchlist .watchlist-panel,
  .workspace-grid.with-right-drawer .right-rail {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  .watchlist-panel {
    position: absolute;
    left: 8px;
    top: 8px;
    bottom: 8px;
    width: min(264px, calc(100% - 16px));
    z-index: 24;
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: translateX(-8px);
    pointer-events: none;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  .watchlist-head {
    padding: 10px 11px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9eb2cd;
    border-bottom: 1px solid rgba(87, 119, 154, 0.2);
  }

  .watchlist-body {
    overflow: hidden;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .watch-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    text-align: left;
    padding: 8px 9px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: #a7bdd9;
    font-size: 12px;
    transition: background 0.14s ease, color 0.14s ease, transform 0.14s ease;
  }

  .watch-item:hover {
    background: rgba(45, 67, 92, 0.38);
  }

  .watch-item.active {
    color: #edf4ff;
    background: rgba(73, 123, 194, 0.34);
    border-color: rgba(100, 151, 224, 0.46);
    transform: none;
  }

  .watch-symbol {
    font-weight: 600;
    letter-spacing: 0.03em;
    color: #f0f6ff;
  }

  .watch-spread {
    color: #8fd7b3;
  }

  .chart-area {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chart-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .chart-shell-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(9, 16, 25, 0.62);
    border-bottom: 1px solid rgba(89, 123, 159, 0.22);
  }

  .instrument-line {
    display: flex;
    gap: 8px;
    align-items: center;
    color: #abc0da;
    font-size: 11px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .instrument-line strong {
    color: #f0f6ff;
    font-size: 12px;
  }

  .ohlc-line {
    color: #8fa5c2;
  }

  .status-strip {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ok-pill,
  .warning-pill {
    padding: 5px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  .ok-pill {
    color: #9ce8bf;
    background: rgba(28, 174, 119, 0.2);
  }

  .warning-pill {
    color: #ffd797;
    background: rgba(219, 153, 52, 0.24);
  }

  .loading-overlay,
  .error-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    height: 100%;
  }

  .spinner {
    width: 34px;
    height: 34px;
    border: 3px solid rgba(108, 139, 176, 0.25);
    border-top-color: rgba(131, 181, 255, 0.85);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-overlay p,
  .error-message {
    color: #9cb1cd;
    font-size: 13px;
  }

  .error-message {
    color: #ff9aa9;
  }

  .btn {
    padding: 7px 12px;
    border-radius: 7px;
    background: rgba(89, 145, 224, 0.88);
    color: #f2f7ff;
    font-size: 11px;
    font-weight: 600;
  }

  .chart-host {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .chart-workspace {
    height: 100%;
    display: block;
    position: relative;
    min-height: 0;
  }

  .chart-toolbar {
    position: absolute;
    left: 14px;
    top: 14px;
    z-index: 22;
    width: 222px;
    background: rgba(8, 14, 22, 0.78);
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid rgba(88, 118, 152, 0.3);
    box-shadow: 0 8px 20px rgba(3, 9, 16, 0.42);
    overflow: hidden;
  }

  .dock-title {
    font-size: 10px;
    color: #95acc7;
    text-transform: uppercase;
    letter-spacing: 0.48px;
    padding: 0 2px;
  }

  .dock-sections {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .dock-section {
    border: 0;
    border-radius: 8px;
    background: rgba(44, 66, 90, 0.42);
    color: #adc2dd;
    padding: 7px 8px;
    font-size: 10px;
    letter-spacing: 0.03em;
  }

  .dock-section.active {
    color: #ecf3ff;
    background: rgba(76, 133, 213, 0.42);
  }

  .dock-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .dock-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dock-style-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .tool-clear {
    width: 100%;
  }

  .tool-btn {
    border: 0;
    background: rgba(41, 62, 84, 0.4);
    color: #b4c9e4;
    font-size: 11px;
    padding: 8px 6px;
    border-radius: 8px;
    transition: background 0.14s ease, color 0.14s ease, transform 0.14s ease;
  }

  .tool-btn:hover {
    background: rgba(55, 83, 113, 0.52);
  }

  .tool-btn.active {
    color: #f0f6ff;
    background: rgba(78, 136, 217, 0.48);
  }

  .tool-btn.danger {
    color: #ffd5db;
    background: rgba(150, 48, 64, 0.45);
  }

  .tool-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .style-label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 9px;
    color: #7d93af;
    text-transform: uppercase;
    letter-spacing: 0.35px;
  }

  .style-label input,
  .style-label select {
    width: 100%;
    border: 0;
    background: rgba(28, 43, 61, 0.78);
    color: #d7e6fb;
    font-size: 10px;
    padding: 6px 7px;
    border-radius: 8px;
  }

  .chart-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 10px 7px;
    color: #7e95b0;
    font-size: 10px;
    background: rgba(9, 16, 25, 0.56);
    border-top: 1px solid rgba(90, 123, 160, 0.2);
  }

  .warning-banner {
    margin: 9px 12px 0;
    padding: 8px 11px;
    border-radius: 7px;
    color: #ffd797;
    background: rgba(219, 153, 52, 0.26);
    font-size: 11px;
  }

  .right-rail {
    position: absolute;
    right: 8px;
    top: 8px;
    bottom: 8px;
    width: min(348px, calc(100% - 16px));
    z-index: 25;
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: translateX(8px);
    pointer-events: none;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  .rail-head {
    padding: 10px 10px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid rgba(90, 122, 157, 0.2);
  }

  .rail-tabs {
    display: flex;
    gap: 6px;
  }

  .rail-tab {
    padding: 7px 10px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 600;
    color: #a6bcd8;
    background: rgba(51, 74, 100, 0.36);
    border: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: background 0.14s ease, color 0.14s ease;
  }

  .rail-tab:hover {
    background: rgba(72, 123, 194, 0.34);
  }

  .rail-tab.active {
    color: #ecf3ff;
    background: rgba(82, 139, 219, 0.46);
  }

  .rail-pane {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 8px 8px;
  }

  .rail-order-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 0;
    color: #8fa5c2;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.42px;
  }

  .risk-pane {
    padding-top: 10px;
  }

  .risk-hint {
    border-radius: 9px;
    background: rgba(26, 42, 60, 0.32);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .risk-hint h3 {
    font-size: 12px;
    color: #e4efff;
  }

  .risk-hint p {
    color: #9cb1cd;
    font-size: 11px;
    line-height: 1.4;
  }

  .risk-panel {
    border-radius: 9px;
    background: rgba(13, 23, 35, 0.76);
    padding: 9px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .risk-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #e5efff;
    font-size: 11px;
  }

  .risk-panel-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .risk-panel-grid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: #8fa4bf;
  }

  .risk-panel-grid input,
  .risk-panel-grid select {
    border: 0;
    background: rgba(26, 42, 60, 0.72);
    color: #d7e6fb;
    border-radius: 8px;
    padding: 6px;
    font-size: 11px;
  }

  .risk-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 10px;
    color: #93abc8;
  }

  .risk-summary span {
    border-radius: 999px;
    background: rgba(58, 83, 113, 0.4);
    padding: 4px 8px;
  }

  .risk-panel-actions {
    display: flex;
    gap: 8px;
  }

  .risk-error {
    margin: 0;
    color: #ffb1be;
    font-size: 11px;
  }

  .right-rail :global(.order-panel),
  .right-rail :global(.metrics-panel) {
    border-radius: 0;
    border: 0;
    background: transparent;
  }

  .bottom-panel {
    padding: 0 10px 10px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bottom-panel.collapsed {
    padding-bottom: 0;
  }

  .dock-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dock-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 7px;
    border: 0;
    background: rgba(37, 56, 78, 0.34);
    color: #a7bdd9;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .dock-tab.active {
    color: #eff5ff;
    background: rgba(73, 122, 193, 0.44);
  }

  .dock-collapse {
    margin-left: auto;
  }

  .dock-count {
    color: #8096b2;
    font-size: 10px;
  }

  .dock-body {
    min-height: 0;
    flex: 1;
    border-radius: 10px;
    background: rgba(8, 14, 22, 0.9);
    border: 1px solid rgba(87, 119, 154, 0.2);
    overflow: hidden;
    position: relative;
  }

  .dock-panel {
    position: absolute;
    inset: 0;
    display: none;
    min-height: 0;
    overflow: hidden;
  }

  .dock-panel.active {
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 1399px) {
    .header-metrics {
      display: none;
    }

    .layout-sheet {
      right: -24px;
    }

    .chart-toolbar {
      width: 220px;
    }
  }

  @media (max-width: 1199px) {
    .tradingview-shell {
      grid-template-rows: 108px minmax(0, 1fr) 42px;
    }

    .tradingview-shell.bottom-open {
      grid-template-rows: 108px minmax(0, 1fr) 210px;
    }

    .control-strip {
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 6px;
      padding: 6px 0;
    }

    .brand-block {
      min-width: 130px;
    }

    .watchlist-panel {
      width: 240px;
    }

    .right-rail {
      width: 328px;
    }

    .chart-toolbar {
      width: 208px;
    }

    .dock-style-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .tradingview-shell {
      grid-template-rows: 126px minmax(0, 1fr) 42px;
    }

    .tradingview-shell.bottom-open {
      grid-template-rows: 126px minmax(0, 1fr) 220px;
    }

    .workspace-menu {
      width: 100%;
      order: 4;
      justify-content: space-between;
    }

    .layout-sheet {
      position: fixed;
      left: 12px;
      right: 12px;
      width: auto;
    }

    .workspace-grid {
      padding: 8px;
    }

    .watchlist-panel,
    .right-rail {
      left: 8px;
      right: 8px;
      width: auto;
      top: 8px;
      bottom: 8px;
      transform: translateY(-8px);
    }

    .workspace-grid.with-watchlist .watchlist-panel,
    .workspace-grid.with-right-drawer .right-rail {
      transform: translateY(0);
    }

    .chart-toolbar {
      left: 8px;
      top: 8px;
      width: min(320px, calc(100% - 16px));
      padding: 6px;
    }

    .dock-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .risk-panel-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
