<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { useTradingStore } from '../lib/stores/trading';
  import { positionManager } from '../lib/engine/positions';
  import { getBars, saveBars } from '../lib/db/ticks';
  import { PAIR_SPREADS } from '../../../shared/types';
  import Chart from '../lib/components/Chart.svelte';
  import OrderPanel from '../lib/components/OrderPanel.svelte';
  import PositionTable from '../lib/components/PositionTable.svelte';
  import TradeHistory from '../lib/components/TradeHistory.svelte';
  import ReplayControls from '../lib/components/ReplayControls.svelte';
  import '../app.css';

  const store = useTradingStore();

  let worker: Worker | null = null;
  let isLoading = false;
  let errorMessage = '';

  onMount(async () => {
    await loadData();
    initWorker();
  });

  onDestroy(() => {
    if (worker) {
      worker.terminate();
    }
  });

  async function loadData() {
    isLoading = true;
    errorMessage = '';

    try {
      // Try to load from IndexedDB first
      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

      let bars = await getBars($store.currentPair, weekAgo, now);

      if (bars.length === 0) {
        // Fetch from API
        const response = await fetch(`/api/data/${$store.currentPair}/${weekAgo}/${now}`);

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();
        bars = data.bars;

        // Save to IndexedDB
        await saveBars($store.currentPair, bars);
      }

      store.setBars(bars);

      if (worker) {
        worker.postMessage({
          type: 'init',
          payload: {
            bars,
            spread: PAIR_SPREADS[$store.currentPair]
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
      new URL('../lib/workers/tick-replay.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'tick') {
        store.setCurrentBar(payload.bar);
        store.setCurrentTick(payload.tick);
        store.setProgress(payload.index, payload.total);

        // Update positions
        positionManager.updatePrices(payload.tick.bid, payload.tick.ask);
        const positions = positionManager.getAll();
        store.updatePositions(positions);

        // Update equity
        const unrealizedPnL = positionManager.getTotalUnrealizedPnL();
        store.updateEquity($store.balance + unrealizedPnL);
      } else if (type === 'complete') {
        store.setPlaying(false);
      }
    };
  }

  function handlePlayPause() {
    if (!worker) return;

    if ($store.isPlaying) {
      worker.postMessage({ type: 'pause' });
      store.setPlaying(false);
    } else {
      worker.postMessage({ type: 'play' });
      store.setPlaying(true);
    }
  }

  function handleSpeedChange(speed: number) {
    if (!worker) return;
    worker.postMessage({ type: 'setSpeed', payload: { speed } });
    store.setSpeed(speed);
  }

  function handleReset() {
    if (!worker) return;
    worker.postMessage({ type: 'reset' });
    store.reset();
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
      <span class="pair-badge">{$store.currentPair}</span>
    </div>
    <ReplayControls
      onPlayPause={handlePlayPause}
      onSpeedChange={handleSpeedChange}
      onReset={handleReset}
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
        <Chart bars={$store.bars} currentBar={$store.currentBar} />
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
