<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import type { BacktestSession, Bar, Timeframe, TradingPair } from '$shared/types';
  import { PAIR_LABELS } from '$shared/types';

  $: currentPair = $tradingStore.currentPair;
  $: isPlaying = $tradingStore.isPlaying;
  $: speed = $tradingStore.speed;
  $: currentIndex = $tradingStore.currentIndex;
  $: totalBars = $tradingStore.totalBars;
  $: bars = $tradingStore.bars;
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
  export let dense = true;

  let selectedPair: TradingPair = 'NAS100';
  let selectedTimeframe: Timeframe = 'M1';
  let fromInput = '';
  let toInput = '';
  let selectedSessionId = '';
  const speeds = [1, 5, 10, 25, 50, 100];
  const timeframes: Timeframe[] = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'];
  const KNOWN_INTERVALS = [
    { ms: 60_000, label: '1m' },
    { ms: 300_000, label: '5m' },
    { ms: 900_000, label: '15m' },
    { ms: 3_600_000, label: '1h' },
    { ms: 14_400_000, label: '4h' },
    { ms: 86_400_000, label: '1d' }
  ];

  function getSelectValue(event: Event): string | null {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
      return null;
    }
    return target.value;
  }

  function handlePairChange(event: Event) {
    const value = getSelectValue(event);
    if (value === null) return;
    selectedPair = value as TradingPair;
    onPairChange(selectedPair);
  }

  function handleTimeframeChange(next: Timeframe) {
    if (selectedTimeframe === next) return;
    selectedTimeframe = next;
    onTimeframeChange(next);
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

  function handleSessionChange(event: Event) {
    const value = getSelectValue(event);
    if (value === null) return;
    selectedSessionId = value;
    if (!selectedSessionId) return;
    onLoadSession(selectedSessionId);
  }

  function handleSpeedChange(event: Event) {
    const value = getSelectValue(event);
    if (value === null) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onSpeedChange(parsed);
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
    return gaps[Math.floor(gaps.length / 2)];
  }

  function intervalLabel(ms: number | null): string {
    if (ms === null) return 'n/a';
    let closest = KNOWN_INTERVALS[0];
    let closestDiff = Math.abs(ms - closest.ms);
    for (let i = 1; i < KNOWN_INTERVALS.length; i += 1) {
      const candidate = KNOWN_INTERVALS[i];
      const diff = Math.abs(ms - candidate.ms);
      if (diff < closestDiff) {
        closest = candidate;
        closestDiff = diff;
      }
    }
    return `~${closest.label}`;
  }

  $: if (currentPair !== selectedPair) selectedPair = currentPair;
  $: if (timeframe !== selectedTimeframe) selectedTimeframe = timeframe;
  $: fromInput = toDateTimeInput(rangeFrom);
  $: toInput = toDateTimeInput(rangeTo);
  $: if (activeSessionId !== selectedSessionId) selectedSessionId = activeSessionId;
  $: loadedInterval = intervalLabel(medianBarIntervalMs(bars));
</script>

<div class="replay-controls" class:dense>
  <div class="cluster play-cluster">
    <button class="icon-btn" on:click={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
      {#if isPlaying}
        ⏸
      {:else}
        ▶
      {/if}
    </button>
    <button class="icon-btn" on:click={onReset} title="Reset">⏹</button>
    <select id="speed-select" value={speed} on:change={handleSpeedChange} aria-label="Replay speed">
      {#each speeds as spd}
        <option value={spd}>{spd}x</option>
      {/each}
    </select>
  </div>

  <div class="cluster timeframe-cluster">
    {#each timeframes as tf}
      <button
        class="tf-pill mono"
        class:active={selectedTimeframe === tf}
        on:click={() => handleTimeframeChange(tf)}
      >
        {tf}
      </button>
    {/each}
  </div>

  <div class="cluster session-cluster">
    <select id="session-select" value={selectedSessionId} on:change={handleSessionChange} aria-label="Session">
      <option value="">Select session</option>
      {#each sessions as session}
        <option value={session.id}>{session.name}</option>
      {/each}
    </select>
    <button class="subtle-btn icon-btn-small" on:click={onCreateSession} title="Create new session">
      <span aria-hidden="true">＋</span>
    </button>
    <button class="subtle-btn icon-btn-small" on:click={onDuplicateSession} title="Duplicate current session">
      <span aria-hidden="true">⧉</span>
    </button>
    <button class="subtle-btn icon-btn-small" on:click={onSaveSession} title="Save current session">
      <span aria-hidden="true">◈</span>
    </button>
  </div>

  <div class="cluster pair-cluster">
    <select id="pair-select" value={selectedPair} on:change={handlePairChange} aria-label="Instrument">
      <option value="NAS100">{PAIR_LABELS.NAS100}</option>
    </select>
  </div>

  <div class="cluster range-cluster">
    <input id="range-from" type="datetime-local" bind:value={fromInput} aria-label="From" />
    <input id="range-to" type="datetime-local" bind:value={toInput} aria-label="To" />
    <button class="subtle-btn accent icon-btn-small" on:click={applyDateRange} title="Apply date range">
      <span aria-hidden="true">↻</span>
    </button>
  </div>

  <div class="cluster progress-cluster">
    <div class="progress-bar">
      <div class="progress-fill" style="width: {(currentIndex / Math.max(totalBars, 1)) * 100}%"></div>
    </div>
    <div class="progress-text mono">
      {currentIndex}/{totalBars}
      <span>TF {timeframe}</span>
      <span>Loaded {loadedInterval}</span>
      {#if currentBar}
        <span>{new Date(currentBar.timestamp).toLocaleTimeString()}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .replay-controls {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(114, 136, 166, 0.4) transparent;
  }

  .replay-controls.dense {
    gap: 4px;
  }

  .cluster {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px;
    border: 1px solid rgba(111, 144, 182, 0.12);
    background: rgba(29, 46, 65, 0.38);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .play-cluster {
    padding-right: 8px;
  }

  .session-cluster {
    max-width: 320px;
  }

  .session-cluster select {
    min-width: 130px;
  }

  .timeframe-cluster {
    gap: 4px;
  }

  .pair-cluster select {
    width: 105px;
  }

  .range-cluster input {
    width: 144px;
  }

  .progress-cluster {
    min-width: 240px;
    flex: 1;
    max-width: 360px;
    margin-left: auto;
  }

  .icon-btn,
  .subtle-btn,
  .tf-pill,
  select,
  input {
    border: 1px solid transparent;
    background: rgba(44, 66, 90, 0.42);
    color: #d9e7fa;
    border-radius: 6px;
    font-size: 10px;
    line-height: 1;
    transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
  }

  select,
  input {
    padding: 6px 8px;
    min-height: 30px;
    color: var(--text-mid);
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
  }

  .subtle-btn {
    padding: 6px 8px;
    min-height: 30px;
    font-weight: 600;
    color: var(--text-mid);
  }

  .icon-btn-small {
    width: 30px;
    min-width: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
  }

  .subtle-btn.accent {
    color: #e9f2ff;
    border-color: rgba(111, 171, 255, 0.4);
    background: rgba(79, 136, 220, 0.3);
  }

  .tf-pill {
    padding: 6px 8px;
    min-height: 30px;
    min-width: 38px;
    font-weight: 600;
    color: var(--text-mid);
  }

  .tf-pill.active {
    color: #e9f2ff;
    background: rgba(79, 136, 220, 0.24);
    border-color: rgba(111, 171, 255, 0.4);
  }

  .icon-btn:hover,
  .subtle-btn:hover,
  .tf-pill:hover,
  select:hover,
  input:hover {
    border-color: rgba(130, 169, 211, 0.34);
    background: rgba(54, 80, 109, 0.58);
  }

  .icon-btn:focus-visible,
  .subtle-btn:focus-visible,
  .tf-pill:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(76, 141, 255, 0.65);
    outline-offset: 1px;
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: #0f1721;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgba(38, 49, 66, 0.65);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3a7fff 0%, #6ba5ff 100%);
    transition: width 0.2s linear;
  }

  .progress-text {
    display: flex;
    gap: 8px;
    font-size: 10px;
    color: var(--text-low);
    white-space: nowrap;
  }

  .replay-controls::-webkit-scrollbar {
    height: 4px;
  }

  .replay-controls::-webkit-scrollbar-thumb {
    background: rgba(114, 136, 166, 0.42);
    border-radius: 999px;
  }

  @media (max-width: 1199px) {
    .replay-controls {
      width: 100%;
    }

    .progress-cluster {
      max-width: none;
      width: 280px;
    }
  }

  @media (max-width: 767px) {
    .range-cluster {
      display: none;
    }

    .session-cluster {
      max-width: 220px;
    }
  }
</style>
