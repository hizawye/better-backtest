<script lang="ts">
  import { onMount } from 'svelte';
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
  type FoldGroup = 'market' | 'dates' | 'session';
  const foldGroups: FoldGroup[] = ['market', 'dates', 'session'];
  let controlsRoot: HTMLDivElement | null = null;
  let marketFold: HTMLDetailsElement | null = null;
  let datesFold: HTMLDetailsElement | null = null;
  let sessionFold: HTMLDetailsElement | null = null;
  let activeFold: FoldGroup | null = null;
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
    closeAllFolds();
  }

  function handleTimeframeChange(next: Timeframe) {
    if (selectedTimeframe === next) return;
    selectedTimeframe = next;
    onTimeframeChange(next);
    closeAllFolds();
  }

  function handleTimeframeSelect(event: Event) {
    const value = getSelectValue(event);
    if (value === null) return;
    handleTimeframeChange(value as Timeframe);
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
    closeAllFolds();
  }

  function handleSessionChange(event: Event) {
    const value = getSelectValue(event);
    if (value === null) return;
    selectedSessionId = value;
    if (!selectedSessionId) return;
    onLoadSession(selectedSessionId);
    closeAllFolds();
  }

  function resolveFold(group: FoldGroup): HTMLDetailsElement | null {
    if (group === 'market') return marketFold;
    if (group === 'dates') return datesFold;
    return sessionFold;
  }

  function closeAllFolds() {
    for (const group of foldGroups) {
      const fold = resolveFold(group);
      if (fold?.open) {
        fold.open = false;
      }
    }
    activeFold = null;
  }

  function handleFoldToggle(group: FoldGroup) {
    const fold = resolveFold(group);
    if (!fold) return;
    if (!fold.open) {
      if (activeFold === group) activeFold = null;
      return;
    }

    activeFold = group;
    for (const candidate of foldGroups) {
      if (candidate === group) continue;
      const sibling = resolveFold(candidate);
      if (sibling?.open) sibling.open = false;
    }
  }

  function handleOutsidePointerDown(event: PointerEvent) {
    if (!activeFold || !controlsRoot) return;
    const target = event.target;
    if (target instanceof Node && controlsRoot.contains(target)) return;
    closeAllFolds();
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    closeAllFolds();
  }

  onMount(() => {
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });

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
  $: rangeLabel = `${new Date(rangeFrom).toLocaleDateString()} - ${new Date(rangeTo).toLocaleDateString()}`;
</script>

<div class="replay-controls" class:dense bind:this={controlsRoot}>
  <div class="cluster transport-cluster">
    <button class="icon-btn" on:click={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
      {#if isPlaying}
        ⏸
      {:else}
        ▶
      {/if}
    </button>
    <button class="icon-btn" on:click={onReset} title="Reset">⏹</button>
    <select class="compact-select" id="speed-select" value={speed} on:change={handleSpeedChange} aria-label="Replay speed">
      {#each speeds as spd}
        <option value={spd}>{spd}x</option>
      {/each}
    </select>
  </div>

  <details class="cluster fold-group market-group" bind:this={marketFold} on:toggle={() => handleFoldToggle('market')}>
    <summary class="fold-trigger">
      <span class="fold-title">Market</span>
      <strong class="mono">{selectedPair} · {selectedTimeframe}</strong>
    </summary>
    <div class="fold-content">
      <label class="fold-field">
        <span>Instrument</span>
        <select id="pair-select" value={selectedPair} on:change={handlePairChange} aria-label="Instrument">
          <option value="NAS100">{PAIR_LABELS.NAS100}</option>
        </select>
      </label>
      <label class="fold-field">
        <span>Timeframe</span>
        <select id="timeframe-select" value={selectedTimeframe} on:change={handleTimeframeSelect} aria-label="Timeframe">
          {#each timeframes as tf}
            <option value={tf}>{tf}</option>
          {/each}
        </select>
      </label>
    </div>
  </details>

  <details class="cluster fold-group date-group" bind:this={datesFold} on:toggle={() => handleFoldToggle('dates')}>
    <summary class="fold-trigger">
      <span class="fold-title">Dates</span>
      <strong class="mono">{rangeLabel}</strong>
    </summary>
    <div class="fold-content">
      <label class="fold-field">
        <span>From</span>
        <input id="range-from" type="datetime-local" bind:value={fromInput} aria-label="From" />
      </label>
      <label class="fold-field">
        <span>To</span>
        <input id="range-to" type="datetime-local" bind:value={toInput} aria-label="To" />
      </label>
      <button class="subtle-btn accent apply-range" on:click={applyDateRange} title="Apply date range">
        Apply Range
      </button>
    </div>
  </details>

  <details class="cluster fold-group session-group" bind:this={sessionFold} on:toggle={() => handleFoldToggle('session')}>
    <summary class="fold-trigger">
      <span class="fold-title">Session</span>
      <strong class="mono">{selectedSessionId ? 'Loaded' : 'Select'}</strong>
    </summary>
    <div class="fold-content">
      <label class="fold-field">
        <span>Workspace</span>
        <select id="session-select" value={selectedSessionId} on:change={handleSessionChange} aria-label="Session">
          <option value="">Select session</option>
          {#each sessions as session}
            <option value={session.id}>{session.name}</option>
          {/each}
        </select>
      </label>
      <div class="session-actions">
        <button class="subtle-btn" on:click={onCreateSession} title="Create new session">New</button>
        <button class="subtle-btn" on:click={onDuplicateSession} title="Duplicate current session">Duplicate</button>
        <button class="subtle-btn accent" on:click={onSaveSession} title="Save current session">Save</button>
      </div>
    </div>
  </details>

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
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
    overflow: visible;
  }

  .replay-controls.dense {
    gap: 3px;
  }

  .cluster {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 9px;
    background: transparent;
    border-radius: 0;
    flex-shrink: 0;
    box-shadow: none;
    border-left: 1px solid rgba(112, 149, 189, 0.32);
  }

  .transport-cluster {
    border-left: 0;
    padding-left: 0;
    padding-right: 8px;
  }

  .compact-select {
    min-width: 66px;
  }

  .fold-group {
    position: relative;
    padding-left: 6px;
    min-height: 34px;
  }

  .fold-group[open] {
    background: transparent;
  }

  .fold-trigger {
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 9px;
    border-radius: 8px;
    color: #d4e3f8;
    cursor: pointer;
    user-select: none;
    font-size: 11px;
  }

  .fold-trigger::-webkit-details-marker {
    display: none;
  }

  .fold-trigger::after {
    content: '▾';
    color: #7f9ab8;
    font-size: 10px;
    margin-left: 2px;
    transition: transform 0.14s ease;
  }

  .fold-group[open] .fold-trigger::after {
    transform: rotate(180deg);
  }

  .fold-title {
    color: #86a0be;
    font-size: 10px;
    letter-spacing: 0.42px;
    text-transform: uppercase;
  }

  .fold-content {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 290px;
    background: rgba(8, 14, 22, 0.98);
    border-radius: 10px;
    padding: 10px 10px 11px;
    display: grid;
    gap: 8px;
    box-shadow: 0 14px 28px rgba(2, 8, 14, 0.58);
    border: 1px solid rgba(84, 118, 154, 0.34);
    z-index: 35;
  }

  .date-group .fold-content {
    width: 336px;
  }

  .fold-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 10px;
    color: #8ea7c3;
    text-transform: uppercase;
    letter-spacing: 0.44px;
  }

  .session-actions {
    display: flex;
    gap: 6px;
  }

  .apply-range {
    min-height: 34px;
    justify-content: center;
  }

  .progress-cluster {
    min-width: 250px;
    flex: 1;
    max-width: 400px;
    margin-left: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    border-left: 1px solid rgba(112, 149, 189, 0.32);
    padding-left: 12px;
    padding-right: 0;
  }

  .icon-btn,
  .subtle-btn,
  select,
  input {
    border: 0;
    background: rgba(43, 65, 91, 0.42);
    color: #d6e6fd;
    border-radius: 7px;
    font-size: 11px;
    line-height: 1;
    transition: background 0.14s ease, color 0.14s ease;
  }

  select,
  input {
    padding: 6px 9px;
    min-height: 32px;
    color: var(--text-mid);
    width: 100%;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 700;
  }

  .subtle-btn {
    padding: 6px 9px;
    min-height: 32px;
    font-weight: 600;
    color: var(--text-mid);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .subtle-btn.accent {
    color: #e9f2ff;
    background: rgba(79, 136, 220, 0.52);
  }

  .icon-btn:hover,
  .subtle-btn:hover,
  .fold-trigger:hover,
  select:hover,
  input:hover {
    background: rgba(57, 88, 121, 0.56);
  }

  .icon-btn:focus-visible,
  .subtle-btn:focus-visible,
  .fold-trigger:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(76, 141, 255, 0.65);
    outline-offset: 1px;
  }

  .progress-bar {
    width: 100%;
    height: 5px;
    background: #0f1721;
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3a7fff 0%, #6ba5ff 100%);
    transition: width 0.2s linear;
  }

  .progress-text {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: var(--text-low);
    flex-wrap: wrap;
  }

  @media (max-width: 1199px) {
    .replay-controls {
      width: 100%;
    }

    .fold-content {
      position: fixed;
      left: 14px;
      right: 14px;
      width: auto;
      max-width: none;
    }

    .progress-cluster {
      max-width: none;
      width: 280px;
    }
  }

  @media (max-width: 767px) {
    .fold-group {
      width: 100%;
    }

    .fold-trigger {
      width: 100%;
      justify-content: space-between;
    }

    .progress-cluster {
      margin-left: 0;
      width: 100%;
    }
  }
</style>
