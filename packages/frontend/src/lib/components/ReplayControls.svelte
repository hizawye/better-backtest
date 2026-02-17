<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import type { BacktestSession, Timeframe, TradingPair } from '$shared/types';
  import { PAIR_LABELS } from '$shared/types';

  $: currentPair = $tradingStore.currentPair;
  $: isPlaying = $tradingStore.isPlaying;
  $: speed = $tradingStore.speed;
  $: currentIndex = $tradingStore.currentIndex;
  $: totalBars = $tradingStore.totalBars;
  $: currentBar = $tradingStore.currentBar;
  $: timeframe = $tradingStore.currentTimeframe;
  $: rangeFrom = $tradingStore.rangeFrom;
  $: rangeTo = $tradingStore.rangeTo;

  export let onPlayPause: () => void;
  export let onSpeedChange: (speed: number) => void;
  export let onReset: () => void;
  export let onPairChange: (pair: TradingPair) => void;
  export let onTimeframeChange: (timeframe: Timeframe) => void;
  export let onDateRangeChange: (from: number, to: number) => void;
  export let onCreateSession: () => void;
  export let onDuplicateSession: () => void;
  export let onSaveSession: () => void;
  export let onLoadSession: (sessionId: string) => void;
  export let sessions: BacktestSession[] = [];
  export let activeSessionId = '';

  let selectedPair: TradingPair = 'NAS100';
  let selectedTimeframe: Timeframe = 'M1';
  let fromInput = '';
  let toInput = '';
  let selectedSessionId = '';
  const speeds = [1, 5, 10, 25, 50, 100];
  const timeframes: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'];

  function handlePairChange() {
    onPairChange(selectedPair);
  }

  function handleTimeframeChange() {
    onTimeframeChange(selectedTimeframe);
  }

  function toDateTimeInput(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function fromInputToMs(value: string): number {
    return new Date(value).getTime();
  }

  function applyDateRange() {
    const from = fromInputToMs(fromInput);
    const to = fromInputToMs(toInput);

    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return;
    onDateRangeChange(from, to);
  }

  function handleSessionChange() {
    if (!selectedSessionId) return;
    onLoadSession(selectedSessionId);
  }

  $: if (currentPair !== selectedPair) selectedPair = currentPair;
  $: if (timeframe !== selectedTimeframe) selectedTimeframe = timeframe;
  $: fromInput = toDateTimeInput(rangeFrom);
  $: toInput = toDateTimeInput(rangeTo);
  $: if (activeSessionId !== selectedSessionId) selectedSessionId = activeSessionId;
</script>

<div class="replay-controls">
  <div class="control-group">
    <label for="session-select">Session:</label>
    <select id="session-select" bind:value={selectedSessionId} on:change={handleSessionChange}>
      <option value="">Select session</option>
      {#each sessions as session}
        <option value={session.id}>{session.name}</option>
      {/each}
    </select>
    <button class="btn" on:click={onCreateSession} title="Create new session">New</button>
    <button class="btn" on:click={onDuplicateSession} title="Duplicate current session">Duplicate</button>
    <button class="btn" on:click={onSaveSession} title="Save current session">Save</button>
  </div>

  <div class="control-group">
    <label for="pair-select">Instrument:</label>
    <select id="pair-select" bind:value={selectedPair} on:change={handlePairChange}>
      <option value="NAS100">{PAIR_LABELS.NAS100}</option>
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
    <label for="timeframe-select">Timeframe:</label>
    <select id="timeframe-select" bind:value={selectedTimeframe} on:change={handleTimeframeChange}>
      {#each timeframes as tf}
        <option value={tf}>{tf}</option>
      {/each}
    </select>
  </div>

  <div class="control-group range-group">
    <label for="range-from">From:</label>
    <input id="range-from" type="datetime-local" bind:value={fromInput} />
    <label for="range-to">To:</label>
    <input id="range-to" type="datetime-local" bind:value={toInput} />
    <button class="btn" on:click={applyDateRange}>Apply</button>
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

  .range-group input {
    padding: 6px 8px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 12px;
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
