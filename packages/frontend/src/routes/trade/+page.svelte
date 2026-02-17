<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tradingStore } from '$lib/stores/trading';
  import { positionManager } from '$lib/engine/positions';
  import { orderBook } from '$lib/engine/orderbook';
  import { aggregateBarsByTimeframe } from '$lib/engine/timeframe';
  import {
    getBars,
    getSessionEntities,
    getSnapshot,
    listSessions,
    saveBars,
    saveSession,
    saveSessionEntities,
    saveSnapshot
  } from '$lib/db/ticks';
  import type { BacktestSession, SessionSnapshot, Timeframe, TradingPair } from '$shared/types';
  import { PAIR_SPREADS } from '$shared/types';
  import Chart from '$lib/components/Chart.svelte';
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

  let worker: Worker | null = null;
  let isLoading = false;
  let errorMessage = '';
  let isBootstrapping = true;

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
  }

  async function loadSession(targetSessionId: string) {
    const session = sessions.find((item) => item.id === targetSessionId);
    if (!session) return;

    await persistCurrentSession();

    tradingStore.applySession(session);

    const [snapshot, entities] = await Promise.all([
      getSnapshot(targetSessionId),
      getSessionEntities(targetSessionId)
    ]);

    orderBook.replaceAll(entities.orders);
    positionManager.replaceAll(entities.positions);
    tradingStore.setOrders(entities.orders);
    tradingStore.setPositions(entities.positions);
    tradingStore.setTrades(entities.trades);

    if (snapshot) {
      tradingStore.setBalance(snapshot.balance);
      tradingStore.setEquity(snapshot.equity);
      tradingStore.setProgress(snapshot.currentIndex, $tradingStore.totalBars);
    }

    await loadData();
  }

  async function createSession() {
    await persistCurrentSession();
    const session = createSessionDefinition();
    await saveSession(session);
    sessions = await listSessions();
    await loadSession(session.id);
  }

  async function loadData() {
    isLoading = true;
    errorMessage = '';

    try {
      // Try to load from IndexedDB first
      let sourceBars = await getBars(currentPair, rangeFrom, rangeTo);

      if (sourceBars.length === 0) {
        // Fetch from API
        const response = await fetch(`/api/data/${currentPair}/${rangeFrom}/${rangeTo}`);

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        sourceBars = data.bars;

        // Save to IndexedDB
        await saveBars(currentPair, sourceBars);
      }

      const timeframeBars = aggregateBarsByTimeframe(sourceBars, currentTimeframe);

      tradingStore.setSourceBars(sourceBars);
      tradingStore.setBars(timeframeBars);
      tradingStore.resetForReplay();

      if (worker) {
        worker.postMessage({
          type: 'init',
          payload: {
            bars: timeframeBars,
            spread
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
    await loadData();
  }

  async function handleTimeframeChange(timeframe: Timeframe) {
    tradingStore.setTimeframe(timeframe);
    await loadData();
  }

  async function handleDateRangeChange(from: number, to: number) {
    tradingStore.setDateRange(from, to);
    await loadData();
  }

  async function handleSaveSession() {
    await persistCurrentSession();
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
        <Chart bars={bars} currentBar={currentBar} />
      {/if}
    </div>

    <div class="side-panel">
      <OrderPanel />
    </div>
  </div>

  <div class="bottom-panel">
    <div class="panel-tabs">
      <PositionTable />
      <TradeHistory />
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
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--border-color);
    height: 100%;
  }

  .panel-tabs > :global(*) {
    background: var(--bg-secondary);
  }
</style>
