<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tradingStore } from '$lib/stores/trading';
  import { positionManager } from '$lib/engine/positions';
  import { orderBook } from '$lib/engine/orderbook';
  import { computeAnalyticsSnapshot } from '$lib/engine/analytics';
  import { detectMinuteGaps } from '$lib/engine/data-quality';
  import { aggregateBarsByTimeframe } from '$lib/engine/timeframe';
  import { evaluateStopsOnBar, tryFillOrderOnBar } from '$lib/engine/execution';
  import { closePosition } from '$lib/engine/pnl';
  import {
    getAggregatedBars,
    getBars,
    getSessionEvents,
    getSessionEntities,
    getJournalEntries,
    getSnapshot,
    listSessions,
    saveAttachment,
    saveAggregatedBars,
    saveAnalyticsSnapshot,
    saveBars,
    saveJournalEntry,
    saveSession,
    saveSessionEvents,
    saveSessionEntities,
    saveSnapshot
  } from '$lib/db/ticks';
  import type { BacktestSession, SessionEvent, SessionSnapshot, Timeframe, TradingPair } from '$shared/types';
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
  $: spread = $tradingStore.spread;
  $: sessionEvents = $tradingStore.sessionEvents;
  $: analyticsSnapshot = $tradingStore.analyticsSnapshot;

  let worker: Worker | null = null;
  let isLoading = false;
  let errorMessage = '';
  let warningMessage = '';
  let isBootstrapping = true;
  let lastAnalyticsTradeCount = -1;

  onMount(async () => {
    initWorker();
    await bootstrapSessions();
    isBootstrapping = false;
  });

  onDestroy(() => {
    void persistCurrentSession();
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

    const [snapshot, entities, events, journalEntries] = await Promise.all([
      getSnapshot(targetSessionId),
      getSessionEntities(targetSessionId),
      getSessionEvents(targetSessionId),
      getJournalEntries(targetSessionId)
    ]);

    orderBook.replaceAll(entities.orders);
    positionManager.replaceAll(entities.positions);
    tradingStore.setOrders(entities.orders);
    tradingStore.setPositions(entities.positions);
    tradingStore.setTrades(entities.trades);
    tradingStore.setSessionEvents(events);
    tradingStore.setJournalEntries(journalEntries);

    if (snapshot) {
      tradingStore.setBalance(snapshot.balance);
      tradingStore.setEquity(snapshot.equity);
      tradingStore.setProgress(snapshot.currentIndex, $tradingStore.totalBars);
    }

    await loadData();
    appendSessionEvent('session_loaded', { sessionId: targetSessionId });
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

  async function loadData() {
    isLoading = true;
    errorMessage = '';
    warningMessage = '';
    const replayAnchor = currentBar?.timestamp;

    try {
      // Try to load from IndexedDB first
      let sourceBars = await getBars(currentPair, rangeFrom, rangeTo);

      if (sourceBars.length === 0) {
        // Fetch from API
        const response = await fetch(
          `/api/data/${currentPair}/${rangeFrom}/${rangeTo}?sessionId=${encodeURIComponent(sessionId)}&timeframe=M1`
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        sourceBars = data.bars;

        // Save to IndexedDB
        await saveBars(currentPair, sourceBars);
      }

      if (sourceBars.length === 0) {
        throw new Error('No market data found for selected range.');
      }

      const gaps = detectMinuteGaps(sourceBars);
      if (gaps.length > 0) {
        const totalMissing = gaps.reduce((sum, gap) => sum + gap.missingBars, 0);
        warningMessage = `Detected ${gaps.length} data gap(s), ${totalMissing} missing minute bars.`;
      }

      let timeframeBars = currentTimeframe === 'M1'
        ? sourceBars
        : await getAggregatedBars(sessionId, currentPair, currentTimeframe, rangeFrom, rangeTo);

      if (timeframeBars.length === 0) {
        timeframeBars = aggregateBarsByTimeframe(sourceBars, currentTimeframe);
        if (sessionId && currentTimeframe !== 'M1') {
          await saveAggregatedBars(sessionId, currentPair, currentTimeframe, timeframeBars);
        }
      }

      tradingStore.setSourceBars(sourceBars);
      tradingStore.setBars(timeframeBars);
      tradingStore.resetForReplay();

      if (replayAnchor) {
        seekToTimestamp(replayAnchor, timeframeBars);
      }

      if (worker) {
        worker.postMessage({
          type: 'init',
          payload: {
            bars: timeframeBars,
            spread,
            sessionId,
            timeframe: currentTimeframe
          }
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      errorMessage = error instanceof Error ? error.message : 'Failed to load data';
    } finally {
      isLoading = false;
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
    tradingStore.setCurrentPair(pair);
    tradingStore.setExecutionConfig({ spread: PAIR_SPREADS[pair] });
    if (worker) {
      worker.postMessage({ type: 'applyExecutionConfig', payload: { spread: PAIR_SPREADS[pair] } });
    }
    await loadData();
  }

  async function handleTimeframeChange(timeframe: Timeframe) {
    tradingStore.setTimeframe(timeframe);
    appendSessionEvent('timeframe_changed', { timeframe });
    if (worker) {
      worker.postMessage({ type: 'setTimeframe', payload: { timeframe } });
    }
    await loadData();
  }

  async function handleDateRangeChange(from: number, to: number) {
    tradingStore.setDateRange(from, to);
    await loadData();
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
    appendSessionEvent('analytics_updated', { trades: trades.length });
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (e.key === ' ') {
      e.preventDefault();
      handlePlayPause();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app-container">
  <div class="header">
    <div class="logo">
      <h1>Better Backtest</h1>
      <span class="pair-badge">{currentPair}</span>
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
  </div>

  <div class="main-content">
    <div class="chart-area">
      {#if isLoading}
        <div class="loading-overlay">
          <div class="spinner"></div>
          <p>Loading market data...</p>
        </div>
      {:else if errorMessage}
        <div class="error-overlay">
          <p class="error-message">{errorMessage}</p>
          <button class="btn" on:click={loadData}>Retry</button>
        </div>
      {:else}
        {#if warningMessage}
          <div class="warning-banner">{warningMessage}</div>
        {/if}
        <Chart bars={bars} currentBar={currentBar} />
      {/if}
    </div>

    <div class="side-panel">
      <OrderPanel onSessionEvent={appendSessionEvent} />
      <AccountMetricsPanel />
    </div>
  </div>

  <div class="bottom-panel">
    <div class="panel-tabs">
      <PositionTable onSessionEvent={appendSessionEvent} />
      <TradeHistory />
      <EventLogPanel events={sessionEvents} />
      <JournalPanel onSaveEntry={handleSaveJournalEntry} />
      <AnalyticsPanel snapshot={analyticsSnapshot} onExportCsv={exportSessionCsv} onExportJson={exportSessionJson} />
    </div>
  </div>
</div>

<style>
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .pair-badge {
    padding: 4px 10px;
    background: var(--accent-color);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    color: white;
  }

  .loading-overlay,
  .error-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
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
    padding: 8px 16px;
    background: var(--accent-color);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .panel-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr 1fr;
    gap: 1px;
    background: var(--border-color);
    height: 100%;
  }

  .panel-tabs > :global(*) {
    background: var(--bg-secondary);
  }

  .warning-banner {
    margin: 8px 12px 0 12px;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    color: #ffd08a;
    border: 1px solid rgba(255, 208, 138, 0.5);
    background: rgba(255, 178, 58, 0.15);
  }
</style>
