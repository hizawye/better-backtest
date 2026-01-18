<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import type { ForexPair } from '$shared/types';

  $: currentPair = $tradingStore.currentPair;
  $: isPlaying = $tradingStore.isPlaying;
  $: speed = $tradingStore.speed;
  $: currentIndex = $tradingStore.currentIndex;
  $: totalBars = $tradingStore.totalBars;
  $: currentBar = $tradingStore.currentBar;

  export let onPlayPause: () => void;
  export let onSpeedChange: (speed: number) => void;
  export let onReset: () => void;

  let selectedPair: ForexPair = 'EURUSD';
  const speeds = [1, 5, 10, 25, 50, 100];

  function handlePairChange() {
    tradingStore.setCurrentPair(selectedPair);
  }
</script>

<div class="replay-controls">
  <div class="control-group">
    <label for="pair-select">Pair:</label>
    <select id="pair-select" bind:value={selectedPair} on:change={handlePairChange}>
      <option value="EURUSD">EUR/USD</option>
      <option value="GBPUSD">GBP/USD</option>
      <option value="USDJPY">USD/JPY</option>
      <option value="USDCHF">USD/CHF</option>
    </select>
  </div>

  <div class="control-group">
    <button class="btn btn-icon" on:click={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
      {#if isPlaying}
        ⏸
      {:else}
        ▶
      {/if}
    </button>
    <button class="btn btn-icon" on:click={onReset} title="Reset">
      ⏹
    </button>
  </div>

  <div class="control-group">
    <label for="speed-select">Speed:</label>
    <select id="speed-select" bind:value={speed} on:change={() => onSpeedChange(speed)}>
      {#each speeds as spd}
        <option value={spd}>{spd}x</option>
      {/each}
    </select>
  </div>

  <div class="progress-bar">
    <div class="progress-fill" style="width: {(currentIndex / totalBars) * 100}%"></div>
  </div>

  <div class="progress-text">
    {currentIndex} / {totalBars} bars
    {#if currentBar}
      | {new Date(currentBar.timestamp).toLocaleString()}
    {/if}
  </div>
</div>

<style>
  .replay-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  select {
    padding: 6px 10px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
  }

  select:focus {
    border-color: var(--accent-color);
    outline: none;
  }

  .btn {
    padding: 6px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn:hover {
    background: var(--accent-color);
    border-color: var(--accent-color);
  }

  .btn-icon {
    font-size: 14px;
    padding: 6px 10px;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
    min-width: 200px;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-color);
    transition: width 0.3s;
  }

  .progress-text {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
</style>
