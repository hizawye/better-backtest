<script context="module" lang="ts">
  export interface SaveAndJournalPayload {
    side: 'buy' | 'sell';
    orderType: 'market' | 'limit' | 'stop';
    size: number;
    entryPrice: number;
    stopLoss?: number;
    takeProfit?: number;
    riskPercent: number;
    riskAmount?: number;
  }
</script>

<script lang="ts">
  import { createPendingOrder, executeMarketOrder } from '$lib/engine/execution';
  import {
    calculateRiskAmountForDraft,
    isIndexPair,
    resolveEntryPrice,
    toTickDistance,
    validateOrderInput,
    type OrderFormOrderType
  } from '$lib/engine/order-form-controller';
  import { orderBook } from '$lib/engine/orderbook';
  import { positionManager } from '$lib/engine/positions';
  import { getOpenRisk } from '$lib/engine/risk';
  import { tradingStore } from '$lib/stores/trading';
  import type { RiskToolDraft, SessionEvent, TradingPair } from '$shared/types';

  export let open = false;
  export let seedDraft: RiskToolDraft | null = null;
  export let onClose: (() => void) | undefined = undefined;
  export let onSessionEvent:
    | ((type: SessionEvent['type'], payload?: Record<string, unknown>) => void)
    | undefined = undefined;
  export let onSaveAndJournal: ((payload: SaveAndJournalPayload) => void) | undefined = undefined;

  const riskPresets = [0.3, 0.5, 0.7, 1, 2, 3];
  const MAX_POSITION_SIZE = 100;

  $: sessionId = $tradingStore.sessionId;
  $: currentPair = $tradingStore.currentPair;
  $: currentTick = $tradingStore.currentTick;
  $: equity = $tradingStore.equity;
  $: balance = $tradingStore.balance;
  $: slippage = $tradingStore.slippage;
  $: openRisk = getOpenRisk($tradingStore.positions, currentPair);
  $: pointValue = isIndexPair(currentPair) ? 1 : 10;
  $: priceStep = isIndexPair(currentPair) ? 0.1 : 0.00001;
  $: referenceBalance = useCurrentBalance ? equity : balance;
  $: riskAmount = Number(((referenceBalance * riskPercent) / 100).toFixed(2));
  $: stopDistance = Math.abs(entryPrice - stopLoss);
  $: stopTicks = stopLoss > 0 ? toTickDistance(currentPair, stopDistance) : 0;
  $: targetDistance = takeProfit > 0 ? Math.abs(takeProfit - entryPrice) : 0;
  $: estimatedLoss = stopLoss > 0 ? Number((stopDistance * positionSize * pointValue).toFixed(2)) : 0;
  $: estimatedProfit = takeProfit > 0
    ? Number((targetDistance * positionSize * pointValue).toFixed(2))
    : 0;
  $: autoSize = stopLoss > 0 && stopDistance > 0
    ? Number((riskAmount / (stopDistance * pointValue)).toFixed(4))
    : 0;

  let useCurrentBalance = true;
  let side: 'buy' | 'sell' = 'buy';
  let orderType: OrderFormOrderType = 'market';
  let riskPercent = 1;
  let positionSize = 0.1;
  let entryPrice = 0;
  let stopLoss = 0;
  let takeProfit = 0;
  let tags = '';
  let formError = '';
  let hydrated = false;
  let manualSize = false;
  let isSubmitting = false;

  function formatPrice(value: number): string {
    const decimals = isIndexPair(currentPair) ? 2 : 5;
    return Number.isFinite(value) ? value.toFixed(decimals) : '--';
  }

  function seedFromMarket(pair: TradingPair) {
    const fallbackEntry = currentTick ? (side === 'buy' ? currentTick.ask : currentTick.bid) : 0;
    const baselineDistance = isIndexPair(pair) ? 10 : 0.001;

    entryPrice = fallbackEntry;
    stopLoss = side === 'buy' ? fallbackEntry - baselineDistance : fallbackEntry + baselineDistance;
    takeProfit = 0;
  }

  function hydrateFromDraft(draft: RiskToolDraft) {
    side = draft.side;
    entryPrice = draft.entry.price;
    stopLoss = draft.stop.price;
    takeProfit = draft.takeProfit?.price ?? 0;
  }

  function resetTransient() {
    formError = '';
    tags = '';
    riskPercent = 1;
    orderType = 'market';
    positionSize = 0.1;
    manualSize = false;
  }

  function initializeForm() {
    resetTransient();
    useCurrentBalance = true;
    if (seedDraft) {
      hydrateFromDraft(seedDraft);
    } else {
      seedFromMarket(currentPair);
    }
  }

  function closeModal() {
    if (isSubmitting) return;
    onClose?.();
  }

  function handleBackdropClick(event: PointerEvent) {
    if (isSubmitting) return;
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function handleSizeInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    positionSize = Number(target.value);
    manualSize = true;
  }

  function applyRiskPreset(value: number) {
    riskPercent = value;
    manualSize = false;
  }

  function buildOrderPayload() {
    if (!currentTick || !sessionId) return null;
    const resolvedEntry = orderType === 'market'
      ? resolveEntryPrice({
          side,
          orderType,
          currentTick,
          limitPrice: entryPrice,
          stopPrice: entryPrice
        })
      : entryPrice;
    const riskAmountForTrade = calculateRiskAmountForDraft({
      pair: currentPair,
      side,
      entryPrice: resolvedEntry,
      stopLoss,
      size: positionSize
    });

    const validationError = validateOrderInput({
      side,
      pair: currentPair,
      orderType,
      size: positionSize,
      currentTick,
      limitPrice: entryPrice,
      stopPrice: entryPrice,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined,
      entryPrice: resolvedEntry,
      openRisk,
      equity,
      riskAmount: riskAmountForTrade,
      sizingMode: 'fixed',
      riskPercent,
      maxPositionSize: MAX_POSITION_SIZE
    });
    if (validationError) {
      formError = validationError;
      return null;
    }

    return {
      resolvedEntry,
      riskAmountForTrade
    };
  }

  function submit(mode: 'save' | 'save_and_journal') {
    if (isSubmitting) return;
    isSubmitting = true;
    formError = '';
    const payload = buildOrderPayload();
    if (!payload || !currentTick || !sessionId) {
      isSubmitting = false;
      return;
    }

    if (orderType === 'market') {
      const position = executeMarketOrder(
        side,
        positionSize,
        currentTick.bid,
        currentTick.ask,
        currentTick.timestamp,
        {
          sessionId,
          stopLoss: stopLoss > 0 ? stopLoss : undefined,
          takeProfit: takeProfit > 0 ? takeProfit : undefined,
          riskAmount: payload.riskAmountForTrade,
          slippage
        }
      );
      positionManager.add(position);
      tradingStore.addPosition(position);
      onSessionEvent?.('position_opened', { positionId: position.id, side, size: position.size, source: 'modal' });
    } else {
      const pending = createPendingOrder({
        sessionId,
        type: orderType,
        side,
        size: positionSize,
        createdAt: currentTick.timestamp,
        price: orderType === 'limit' ? payload.resolvedEntry : undefined,
        stopPrice: orderType === 'stop' ? payload.resolvedEntry : undefined,
        stopLoss: stopLoss > 0 ? stopLoss : undefined,
        takeProfit: takeProfit > 0 ? takeProfit : undefined,
        riskAmount: payload.riskAmountForTrade
      });
      orderBook.add(pending);
      tradingStore.addOrder(pending);
      onSessionEvent?.('order_placed', {
        orderId: pending.id,
        type: pending.type,
        side: pending.side,
        size: pending.size,
        source: 'modal',
        setupTags: tags
      });
    }

    if (mode === 'save_and_journal') {
      onSaveAndJournal?.({
        side,
        orderType,
        size: positionSize,
        entryPrice: payload.resolvedEntry,
        stopLoss: stopLoss > 0 ? stopLoss : undefined,
        takeProfit: takeProfit > 0 ? takeProfit : undefined,
        riskPercent,
        riskAmount: payload.riskAmountForTrade
      });
    }
    isSubmitting = false;
    closeModal();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!open || isSubmitting) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  }

  $: if (open && !hydrated) {
    initializeForm();
    hydrated = true;
  }

  $: if (!open && hydrated) {
    hydrated = false;
  }

  $: if (open && !manualSize && autoSize > 0) {
    positionSize = autoSize;
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if open}
  <div class="order-modal-backdrop" on:pointerdown={handleBackdropClick}>
    <div
      class="order-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Place order"
      tabindex="-1"
    >
      <header class="modal-head">
        <h3 class="mono">
          <span aria-hidden="true">◎</span>
          Place Order
        </h3>
        <button class="modal-icon-btn" on:click={closeModal} aria-label="Close place order modal" title="Close">✕</button>
      </header>

      <div class="balance-toggle">
        <button class="pill" class:active={!useCurrentBalance} on:click={() => (useCurrentBalance = false)}>
          Initial Balance
        </button>
        <button class="pill" class:active={useCurrentBalance} on:click={() => (useCurrentBalance = true)}>
          Current Balance
        </button>
      </div>

      <div class="estimates mono">
        <span class="loss">Estimated Loss -${estimatedLoss.toFixed(2)}</span>
        <span class="profit">Estimated Profit ${estimatedProfit.toFixed(2)}</span>
      </div>

      <div class="risk-presets">
        {#each riskPresets as preset}
          <button class="preset" class:active={riskPercent === preset} on:click={() => applyRiskPreset(preset)}>
            {preset}%
          </button>
        {/each}
      </div>

      <div class="form-grid">
        <label>
          Side
          <select bind:value={side}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>
        <label>
          Type
          <select bind:value={orderType}>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
          </select>
        </label>
        <label>
          Risk %
          <input type="number" min="0.1" max="20" step="0.1" bind:value={riskPercent} />
        </label>
        <label>
          Risk Amount
          <input type="number" value={riskAmount.toFixed(2)} readonly />
        </label>
        <label>
          Position Size
          <input type="number" min="0.01" step="0.01" value={positionSize} on:input={handleSizeInput} />
        </label>
        <label>
          Entry Price
          <input type="number" step={priceStep} bind:value={entryPrice} />
        </label>
        <label>
          Stop Loss
          <input type="number" step={priceStep} bind:value={stopLoss} />
        </label>
        <label>
          Stop Ticks
          <input type="number" value={stopTicks.toFixed(isIndexPair(currentPair) ? 1 : 0)} readonly />
        </label>
        <label>
          Take Profit
          <input type="number" step={priceStep} bind:value={takeProfit} placeholder={formatPrice(0)} />
        </label>
        <label>
          Tags
          <input type="text" bind:value={tags} placeholder="breakout, ny-open" />
        </label>
      </div>

      {#if formError}
        <p class="form-error">{formError}</p>
      {/if}

      <footer class="modal-actions">
        <button class="btn ghost" on:click={closeModal} disabled={isSubmitting}>Discard</button>
        <button class="btn muted" on:click={() => submit('save')} disabled={isSubmitting}>
          <span aria-hidden="true">◈</span>
          Save
        </button>
        <button class="btn primary" on:click={() => submit('save_and_journal')} disabled={isSubmitting}>
          <span aria-hidden="true">✎</span>
          Save &amp; Journal
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .order-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(6, 11, 18, 0.6);
    display: grid;
    place-items: center;
    padding: 18px;
    animation: fade-in 140ms ease-out;
  }

  .order-modal {
    width: min(560px, 96vw);
    max-height: calc(100dvh - 36px);
    overflow: auto;
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(11, 17, 26, 0.97), rgba(9, 15, 22, 0.96));
    border: 1px solid rgba(103, 132, 166, 0.32);
    box-shadow: 0 18px 48px rgba(4, 8, 13, 0.56);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slide-up 160ms ease-out;
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .modal-head h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #e6efff;
    font-size: 13px;
    font-weight: 650;
  }

  .modal-icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(102, 131, 165, 0.3);
    background: rgba(36, 52, 72, 0.45);
    color: #bad0ea;
    font-size: 12px;
  }

  .balance-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .pill {
    border-radius: 999px;
    border: 1px solid rgba(102, 131, 165, 0.3);
    background: rgba(35, 52, 73, 0.4);
    color: #9cb2cf;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 10px;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .pill.active {
    color: #e8f2ff;
    border-color: rgba(107, 167, 245, 0.48);
    background: rgba(74, 132, 212, 0.3);
  }

  .estimates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 12px;
  }

  .estimates span {
    border-radius: 8px;
    padding: 8px 10px;
    border: 1px solid rgba(95, 124, 158, 0.3);
    background: rgba(32, 47, 67, 0.42);
  }

  .estimates .loss {
    color: #ff9eac;
  }

  .estimates .profit {
    color: #8de1b4;
    text-align: right;
  }

  .risk-presets {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset {
    border-radius: 999px;
    border: 1px solid rgba(102, 131, 165, 0.3);
    background: rgba(35, 52, 73, 0.36);
    color: #aac1dc;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
  }

  .preset.active {
    background: rgba(69, 129, 213, 0.34);
    border-color: rgba(113, 168, 244, 0.44);
    color: #e5efff;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .form-grid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: #8da4c0;
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .form-grid input,
  .form-grid select {
    border-radius: 8px;
    border: 1px solid rgba(99, 128, 162, 0.32);
    background: rgba(24, 36, 51, 0.88);
    color: #dbe8f8;
    font-size: 12px;
    padding: 8px 9px;
  }

  .form-grid input:focus-visible,
  .form-grid select:focus-visible,
  .modal-icon-btn:focus-visible,
  .pill:focus-visible,
  .preset:focus-visible,
  .btn:focus-visible {
    outline: 2px solid rgba(95, 159, 244, 0.7);
    outline-offset: 1px;
  }

  .form-error {
    margin: 0;
    border: 1px solid rgba(232, 103, 125, 0.42);
    background: rgba(164, 54, 72, 0.24);
    color: #ffc8d2;
    border-radius: 8px;
    padding: 8px 9px;
    font-size: 11px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  }

  .btn {
    border-radius: 10px;
    border: 1px solid rgba(102, 131, 165, 0.3);
    background: rgba(33, 49, 69, 0.44);
    color: #bed0e5;
    font-size: 12px;
    font-weight: 600;
    padding: 9px 12px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn.primary {
    color: #eff6ff;
    background: linear-gradient(180deg, rgba(58, 121, 210, 0.9), rgba(46, 102, 180, 0.9));
    border-color: rgba(113, 170, 245, 0.54);
  }

  .btn.muted {
    color: #e3efff;
    background: rgba(61, 104, 161, 0.45);
  }

  .btn.ghost {
    color: #9fb5cf;
    background: transparent;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      transform: translateY(10px);
      opacity: 0.75;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 760px) {
    .order-modal {
      width: min(620px, 100vw - 14px);
      padding: 10px;
    }

    .estimates,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .modal-actions {
      flex-wrap: wrap;
      justify-content: stretch;
    }

    .btn {
      flex: 1;
      justify-content: center;
    }
  }
</style>
