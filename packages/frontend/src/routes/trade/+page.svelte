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
    getDrawings,
    getSessionEvents,
    getSessionEntities,
    getJournalEntries,
    getToolPrefs,
    listAllTrades,
    getSnapshot,
    listSessions,
    saveAttachment,
    saveAnalyticsSnapshot,
    saveDrawings,
    saveJournalEntry,
    saveSession,
    saveSessionEvents,
    saveSessionEntities,
    saveSnapshot,
    saveToolPrefs
  } from '$lib/db/ticks';
  import type {
    BacktestSession,
    Bar,
    DrawingEntity,
    DrawingPoint,
    DrawingStyle,
    DrawingToolType,
    RiskToolDraft,
    SessionEvent,
    SessionSnapshot,
    Timeframe,
    TradingPair
  } from '$shared/types';
  import { PAIR_SPREADS } from '$shared/types';
  import AnalyticsPanel from '$lib/components/AnalyticsPanel.svelte';
  import AccountMetricsPanel from '$lib/components/AccountMetricsPanel.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import EventLogPanel from '$lib/components/EventLogPanel.svelte';
  import JournalPanel from '$lib/components/JournalPanel.svelte';
  import OrderPanel from '$lib/components/OrderPanel.svelte';
  import PositionTable from '$lib/components/PositionTable.svelte';
  import TradeHistory from '$lib/components/TradeHistory.svelte';
  import ReplayControls from '$lib/components/ReplayControls.svelte';
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
  type DockTab = 'positions' | 'trades' | 'events' | 'journal' | 'analytics';

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
  $: equity = $tradingStore.equity;
  $: sessionEvents = $tradingStore.sessionEvents;
  $: drawings = $tradingStore.drawings;
  $: activeTool = $tradingStore.activeTool;
  $: selectedDrawingId = $tradingStore.selectedDrawingId;
  $: magnetEnabled = $tradingStore.magnetEnabled;
  $: drawingsVisible = $tradingStore.drawingsVisible;
  $: toolStylePresets = $tradingStore.toolStylePresets;
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

  let worker: Worker | null = null;
  let isLoading = false;
  let errorMessage = '';
  let warningMessage = '';
  let isBootstrapping = true;
  let lastAnalyticsTradeCount = -1;
  let latestLoadRequestId = 0;
  let activeDockTab: DockTab = 'positions';
  let drawingPersistTimer: ReturnType<typeof setTimeout> | null = null;
  let riskDraftSeed: DrawingPoint | null = null;
  let riskDraft: RiskToolDraft | null = null;
  let riskPanelError = '';
  let riskOrderType: ChartEntryOrderMode = 'market';
  let riskSizingMode: ChartEntrySizingMode = 'fixed';
  let riskLotSize = 0.1;
  let riskPercent = 1;
  let riskTakeProfit = '';

  const chartTools: Array<{ id: DrawingToolType; label: string }> = [
    { id: 'cursor', label: 'Cursor' },
    { id: 'trend_line', label: 'Trend' },
    { id: 'horizontal_line', label: 'HLine' },
    { id: 'vertical_line', label: 'VLine' },
    { id: 'ray', label: 'Ray' },
    { id: 'extended_line', label: 'Ext' },
    { id: 'rectangle', label: 'Rect' },
    { id: 'text', label: 'Text' },
    { id: 'arrow', label: 'Arrow' },
    { id: 'ruler', label: 'Ruler' },
    { id: 'fibonacci', label: 'Fib' },
    { id: 'brush', label: 'Brush' },
    { id: 'risk_position', label: 'Risk' }
  ];

  const dockTabs: Array<{ id: DockTab; label: string }> = [
    { id: 'positions', label: 'Positions' },
    { id: 'trades', label: 'Trades' },
    { id: 'events', label: 'Events' },
    { id: 'journal', label: 'Journal' },
    { id: 'analytics', label: 'Analytics' }
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

  function dockCount(tab: DockTab): number {
    if (tab === 'positions') return positions.length;
    if (tab === 'trades') return trades.length;
    if (tab === 'events') return sessionEvents.length;
    if (tab === 'journal') return $tradingStore.journalEntries.length;
    return analyticsSnapshot ? analyticsSnapshot.totalTrades : 0;
  }

  function queueDrawingPersist(targetSessionId = sessionId, targetPair = currentPair) {
    if (!targetSessionId) return;
    if (drawingPersistTimer) clearTimeout(drawingPersistTimer);
    drawingPersistTimer = setTimeout(() => {
      void saveDrawings(targetSessionId, targetPair, tradingStore.drawings);
      drawingPersistTimer = null;
    }, 160);
  }

  async function loadDrawingsForContext(targetSessionId: string, targetPair: TradingPair) {
    const loaded = await getDrawings(targetSessionId, targetPair);
    tradingStore.setDrawings(loaded);
    tradingStore.setSelectedDrawing(null);
  }

  function handleToolSelect(tool: DrawingToolType) {
    tradingStore.setActiveTool(tool);
    if (tool !== 'risk_position') {
      riskDraftSeed = null;
      riskDraft = null;
      riskPanelError = '';
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

  function cancelRiskDraft() {
    riskDraft = null;
    riskDraftSeed = null;
    riskPanelError = '';
    if (activeTool === 'risk_position') {
      tradingStore.setActiveTool('cursor');
      void persistToolPrefs();
    }
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
      takeProfit: riskTakeProfit ? Number(riskTakeProfit) : undefined
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

    const riskAmount = Math.abs(intent.entryPrice - riskDraft.stop.price) * size;
    const takeProfit = riskTakeProfit ? Number(riskTakeProfit) : undefined;

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
    await saveDrawings(sessionId, currentPair, drawings);
    await persistToolPrefs(sessionId);

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

    const [snapshot, entities, events, journalEntries, prefs] = await Promise.all([
      getSnapshot(targetSessionId),
      getSessionEntities(targetSessionId),
      getSessionEvents(targetSessionId),
      getJournalEntries(targetSessionId),
      getToolPrefs(targetSessionId)
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
    }

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
      await saveDrawings(sessionId, currentPair, drawings);
    }
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
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (e.key === ' ') {
      e.preventDefault();
      handlePlayPause();
    } else if (e.key === 'Escape' && (riskDraft || riskDraftSeed)) {
      e.preventDefault();
      cancelRiskDraft();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app-container">
  <div class="header terminal-header">
    <div class="control-strip">
      <div class="brand-block">
        <h1>Better Backtest</h1>
        <div class="brand-sub mono">
          <span>{sessionName}</span>
          <span>{activeTimestampLabel}</span>
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

  <div class="main-content">
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
          {#if warningMessage}
            <span class="warning-pill">Data Warning</span>
          {:else}
            <span class="ok-pill">Feed Healthy</span>
          {/if}
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
              <aside class="chart-toolbar">
                {#each chartTools as tool}
                  <button
                    class="tool-btn mono"
                    class:active={activeTool === tool.id}
                    on:click={() => handleToolSelect(tool.id)}
                    title={tool.id}
                  >
                    {tool.label}
                  </button>
                {/each}
                <button class="tool-btn mono" class:active={magnetEnabled} on:click={handleToggleMagnet}>
                  Magnet
                </button>
                <button class="tool-btn mono" class:active={drawingsVisible} on:click={handleToggleDrawingsVisible}>
                  Show
                </button>
                <button
                  class="tool-btn mono danger"
                  on:click={() => {
                    for (const drawing of drawings) {
                      appendSessionEvent('drawing_deleted', { drawingId: drawing.id, tool: drawing.tool });
                    }
                    tradingStore.clearDrawings();
                    queueDrawingPersist();
                  }}
                  disabled={drawings.length === 0}
                >
                  Clear
                </button>

                <div class="tool-divider"></div>
                <button class="tool-btn mono" on:click={duplicateSelectedDrawing} disabled={!selectedDrawing}>
                  Duplicate
                </button>
                <button class="tool-btn mono" on:click={toggleSelectedDrawingLock} disabled={!selectedDrawing}>
                  {selectedDrawing?.locked ? 'Unlock' : 'Lock'}
                </button>
                <button class="tool-btn mono" on:click={toggleSelectedDrawingHidden} disabled={!selectedDrawing}>
                  {selectedDrawing?.hidden ? 'Unhide' : 'Hide'}
                </button>
                <button class="tool-btn mono" on:click={() => moveSelectedDrawing('front')} disabled={!selectedDrawing}>
                  Front
                </button>
                <button class="tool-btn mono" on:click={() => moveSelectedDrawing('back')} disabled={!selectedDrawing}>
                  Back
                </button>

                <div class="tool-divider"></div>
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
              </aside>

              {#key chartViewKey}
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
                  onCreateDrawing={handleCreateDrawing}
                  onUpdateDrawing={handleUpdateDrawing}
                  onDeleteDrawing={handleDeleteDrawing}
                  onSelectDrawing={(drawingId) => tradingStore.setSelectedDrawing(drawingId)}
                  onRiskDraftPoint={handleRiskDraftPoint}
                  onPositionLevelDrag={handlePositionLevelDrag}
                />
              {/key}
            </div>
          </div>
          <div class="chart-footer mono">
            <span>{activeTimestampLabel}</span>
            <span>Progress {replayProgressPct.toFixed(1)}%</span>
            <span>Spread {spread.toFixed(2)}</span>
          </div>

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
                  <input type="number" step="0.01" bind:value={riskTakeProfit} placeholder="none" />
                </label>
              </div>
              {#if riskPanelError}
                <p class="risk-error">{riskPanelError}</p>
              {/if}
              <div class="risk-panel-actions">
                <button class="tool-btn mono" on:click={confirmRiskDraft}>Confirm</button>
                <button class="tool-btn mono" on:click={cancelRiskDraft}>Cancel</button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="side-panel right-rail">
      <div class="rail-head">
        <span>Trade Ticket</span>
        <span class="mono">{currentPair} {currentTimeframe}</span>
      </div>
      <OrderPanel onSessionEvent={appendSessionEvent} />
      <AccountMetricsPanel />
    </div>
  </div>

  <div class="bottom-panel">
    <div class="dock-tabs">
      {#each dockTabs as tab}
        <button
          class="dock-tab"
          class:active={activeDockTab === tab.id}
          on:click={() => (activeDockTab = tab.id)}
        >
          {tab.label}
          <span class="dock-count mono">{dockCount(tab.id)}</span>
        </button>
      {/each}
    </div>

    <div class="dock-body">
      <section class="dock-panel" class:active={activeDockTab === 'positions'}>
        <PositionTable onSessionEvent={appendSessionEvent} />
      </section>
      <section class="dock-panel" class:active={activeDockTab === 'trades'}>
        <TradeHistory />
      </section>
      <section class="dock-panel" class:active={activeDockTab === 'events'}>
        <EventLogPanel events={sessionEvents} />
      </section>
      <section class="dock-panel" class:active={activeDockTab === 'journal'}>
        <JournalPanel onSaveEntry={handleSaveJournalEntry} />
      </section>
      <section class="dock-panel" class:active={activeDockTab === 'analytics'}>
        <AnalyticsPanel
          snapshot={analyticsSnapshot}
          crossSession={crossSessionAnalytics}
          onExportCsv={exportSessionCsv}
          onExportJson={exportSessionJson}
        />
      </section>
    </div>
  </div>
</div>

<style>
  .app-container {
    grid-template-rows: 64px minmax(0, 1fr) 230px;
  }

  .terminal-header {
    padding: 0 10px;
    display: flex;
    align-items: center;
    border-bottom-color: rgba(71, 85, 105, 0.5);
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
    gap: 4px;
    min-width: 150px;
  }

  .brand-block h1 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.2px;
  }

  .brand-sub {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--text-low);
    min-width: 0;
  }

  .brand-sub span {
    padding: 1px 4px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    background: #111923;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-strip :global(.replay-controls) {
    flex: 1;
    min-width: 0;
  }

  .header-metrics {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--text-mid);
    white-space: nowrap;
  }

  .header-metrics .positive {
    color: var(--bull);
  }

  .header-metrics .negative {
    color: var(--bear);
  }

  .header-metrics span {
    padding: 4px 6px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    background: #111923;
  }

  .chart-shell {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(51, 65, 85, 0.5);
    overflow: hidden;
    background: #0f151f;
    height: 100%;
    min-height: 0;
  }

  .chart-shell-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(51, 65, 85, 0.5);
    background: #101824;
  }

  .instrument-line {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--text-mid);
    font-size: 10px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .instrument-line strong {
    color: var(--text-hi);
    font-size: 11px;
  }

  .ohlc-line {
    color: #94a8c3;
  }

  .ok-pill,
  .warning-pill {
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .ok-pill {
    color: #97e2bd;
    background: rgba(20, 184, 122, 0.16);
    border: 1px solid rgba(20, 184, 122, 0.45);
  }

  .warning-pill {
    color: #ffd08a;
    background: rgba(243, 179, 90, 0.16);
    border: 1px solid rgba(243, 179, 90, 0.45);
  }

  .loading-overlay,
  .error-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 0;
    gap: 16px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-overlay p,
  .error-message {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .error-message {
    color: var(--danger-color);
  }

  .btn {
    padding: 7px 12px;
    background: var(--accent-color);
    border: none;
    color: white;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .chart-area {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .chart-host {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .chart-workspace {
    height: 100%;
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    min-height: 0;
  }

  .chart-toolbar {
    border-right: 1px solid rgba(38, 49, 66, 0.75);
    background: #0f1824;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 6px;
    overflow-y: auto;
  }

  .tool-btn {
    border: 1px solid rgba(51, 65, 85, 0.65);
    background: #141e2b;
    color: var(--text-mid);
    font-size: 10px;
    padding: 6px 4px;
    text-transform: uppercase;
    cursor: pointer;
  }

  .tool-btn:hover {
    border-color: rgba(130, 156, 191, 0.75);
  }

  .tool-btn.active {
    color: #dce9ff;
    border-color: rgba(76, 141, 255, 0.75);
    background: rgba(76, 141, 255, 0.18);
  }

  .tool-btn.danger {
    color: #fecaca;
    border-color: rgba(220, 38, 38, 0.45);
    background: rgba(127, 29, 29, 0.35);
  }

  .tool-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .tool-divider {
    border-top: 1px solid rgba(51, 65, 85, 0.65);
    margin: 4px 0;
  }

  .style-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 9px;
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.35px;
  }

  .style-label input,
  .style-label select {
    width: 100%;
    border: 1px solid rgba(51, 65, 85, 0.65);
    background: #101a28;
    color: #d8e4f7;
    font-size: 10px;
    padding: 4px;
    border-radius: 4px;
  }

  .style-label input[type='color'] {
    min-height: 28px;
    padding: 2px;
  }

  .chart-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    padding: 5px 10px;
    border-top: 1px solid rgba(38, 49, 66, 0.65);
    background: #101824;
    color: var(--text-low);
    font-size: 10px;
  }

  .warning-banner {
    margin: 7px 10px 0;
    padding: 6px 10px;
    font-size: 11px;
    color: #ffd08a;
    border: 1px solid rgba(255, 208, 138, 0.5);
    background: rgba(255, 178, 58, 0.15);
  }

  .risk-panel {
    margin: 8px 10px 10px;
    border: 1px solid rgba(76, 141, 255, 0.5);
    background: rgba(9, 18, 29, 0.92);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .risk-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-hi);
    font-size: 11px;
  }

  .risk-panel-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .risk-panel-grid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: var(--text-low);
  }

  .risk-panel-grid input,
  .risk-panel-grid select {
    border: 1px solid rgba(51, 65, 85, 0.65);
    background: #121c2a;
    color: #dae7ff;
    font-size: 11px;
    padding: 5px 6px;
  }

  .risk-panel-actions {
    display: flex;
    gap: 8px;
  }

  .risk-error {
    margin: 0;
    color: #fecaca;
    font-size: 11px;
  }

  .right-rail {
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  .rail-head {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    color: var(--text-low);
    background: #111924;
  }

  .right-rail :global(.order-panel),
  .right-rail :global(.metrics-panel) {
    border-radius: 0;
  }

  .dock-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 0 6px;
    overflow-x: auto;
  }

  .dock-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    border-bottom: none;
    background: #101824;
    color: var(--text-mid);
    padding: 6px 10px 7px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .dock-count {
    font-size: 10px;
    color: var(--text-low);
  }

  .dock-tab.active {
    color: #d9e7ff;
    border-color: rgba(76, 141, 255, 0.6);
    background: rgba(76, 141, 255, 0.18);
  }

  .dock-body {
    background: var(--bg-panel);
    border: 1px solid rgba(51, 65, 85, 0.5);
    height: calc(100% - 34px);
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .dock-panel {
    position: absolute;
    inset: 0;
    display: none;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .dock-panel.active {
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 1199px) {
    .app-container {
      grid-template-rows: 104px minmax(0, 1fr) 210px;
    }

    .header-metrics {
      display: none;
    }

    .control-strip {
      height: 100%;
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
      padding: 6px 0;
    }

    .brand-block {
      width: 100%;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }

    .control-strip :global(.replay-controls) {
      width: 100%;
    }
  }

  @media (max-width: 767px) {
    .app-container {
      grid-template-rows: 110px minmax(0, 1fr) 240px;
    }

    .control-strip {
      gap: 4px;
    }

    .dock-body {
      height: calc(100% - 40px);
    }

    .chart-workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .chart-toolbar {
      border-right: 0;
      border-bottom: 1px solid rgba(38, 49, 66, 0.75);
      flex-direction: row;
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 6px;
    }

    .tool-btn {
      min-width: 62px;
    }

    .tool-divider {
      width: 1px;
      min-height: 32px;
      border-top: 0;
      border-left: 1px solid rgba(51, 65, 85, 0.65);
      margin: 0 4px;
    }

    .style-label {
      min-width: 90px;
      flex: 0 0 auto;
    }

    .risk-panel-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
