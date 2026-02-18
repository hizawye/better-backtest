<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import { createPendingOrder, executeMarketOrder } from '../engine/execution';
  import { getExposure, getOpenRisk } from '../engine/risk';
  import {
    resolveEntryPrice,
    resolveSizeAndRisk,
    validateOrderInput,
    type OrderFormOrderType,
    type OrderFormSizingMode
  } from '../engine/order-form-controller';
  import { positionManager } from '../engine/positions';
  import { orderBook } from '../engine/orderbook';
  import type { SessionEvent } from '$shared/types';
  import { PAIR_SPREADS, PAIR_CATEGORIES } from '$shared/types';

  $: currentTick = $tradingStore.currentTick;
  $: currentPair = $tradingStore.currentPair;
  $: sessionId = $tradingStore.sessionId;
  $: balance = $tradingStore.balance;
  $: equity = $tradingStore.equity;
  $: slippage = $tradingStore.slippage;
  $: positions = $tradingStore.positions;
  $: maxDrawdown = $tradingStore.maxDrawdown;
  $: isIndex = PAIR_CATEGORIES[currentPair] === 'index';
  $: pendingOrders = $tradingStore.orders.filter((order) => order.status === 'pending');
  $: openRisk = getOpenRisk(positions, currentPair);
  $: exposure = getExposure(positions);
  $: usedRisk = equity > 0 ? (openRisk / equity) * 100 : 0;

  export let onSessionEvent: ((type: SessionEvent['type'], payload?: Record<string, unknown>) => void) | undefined;

  let lotSize = 0.1;
  let sizingMode: OrderFormSizingMode = 'fixed';
  let riskPercent = 1;
  let orderType: OrderFormOrderType = 'market';
  let limitPrice = 0;
  let stopPrice = 0;
  let stopLoss = 0;
  let takeProfit = 0;
  let formError = '';
  let selectedPendingId = '';
  const MAX_POSITION_SIZE = 100;
  const rrPresets = [1, 2, 3];
  let selectedRrPreset = 0;
  let setupTagsInput = '';

  function applyRrPreset(side: 'buy' | 'sell') {
    if (!selectedRrPreset || !stopLoss || !currentTick) return;
    const entry = resolveEntryPrice({
      side,
      orderType,
      currentTick,
      limitPrice,
      stopPrice
    });
    const distance = Math.abs(entry - stopLoss);
    if (distance <= 0) return;
    takeProfit = side === 'buy'
      ? entry + distance * selectedRrPreset
      : entry - distance * selectedRrPreset;
  }

  function resetTransientFields() {
    formError = '';
    selectedPendingId = '';
  }

  function handleBuy() {
    if (!currentTick) return;
    formError = '';
    applyRrPreset('buy');
    const entryPrice = resolveEntryPrice({
      side: 'buy',
      orderType,
      currentTick,
      limitPrice,
      stopPrice
    });
    const resolved = resolveSizeAndRisk({
      pair: currentPair,
      side: 'buy',
      sizingMode,
      fixedSize: lotSize,
      equity,
      riskPercent,
      entryPrice,
      stopLoss
    });
    if (resolved.error) {
      formError = resolved.error;
      return;
    }
    const { size, riskAmount } = resolved;
    const error = validateOrderInput({
      side: 'buy',
      pair: currentPair,
      orderType,
      size,
      currentTick,
      limitPrice,
      stopPrice,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined,
      entryPrice,
      openRisk,
      equity,
      riskAmount,
      sizingMode,
      riskPercent,
      maxPositionSize: MAX_POSITION_SIZE
    });
    if (error) {
      formError = error;
      return;
    }

    if (orderType === 'market') {
      const position = executeMarketOrder(
        'buy',
        size,
        currentTick.bid,
        currentTick.ask,
        currentTick.timestamp,
        {
          sessionId,
          stopLoss: stopLoss > 0 ? stopLoss : undefined,
          takeProfit: takeProfit > 0 ? takeProfit : undefined,
          riskAmount,
          slippage
        }
      );
      positionManager.add(position);
      tradingStore.addPosition(position);
      onSessionEvent?.('position_opened', { positionId: position.id, side: 'buy', size: position.size });
      resetTransientFields();
      return;
    }

    const pending = createPendingOrder({
      sessionId,
      type: orderType,
      side: 'buy',
      size,
      price: orderType === 'limit' ? limitPrice : undefined,
      stopPrice: orderType === 'stop' ? stopPrice : undefined,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined,
      createdAt: currentTick.timestamp,
      riskAmount
    });
    orderBook.add(pending);
    tradingStore.addOrder(pending);
    onSessionEvent?.('order_placed', {
      orderId: pending.id,
      type: pending.type,
      side: pending.side,
      size: pending.size,
      setupTags: setupTagsInput
    });
    resetTransientFields();
  }

  function handleSell() {
    if (!currentTick) return;
    formError = '';
    applyRrPreset('sell');
    const entryPrice = resolveEntryPrice({
      side: 'sell',
      orderType,
      currentTick,
      limitPrice,
      stopPrice
    });
    const resolved = resolveSizeAndRisk({
      pair: currentPair,
      side: 'sell',
      sizingMode,
      fixedSize: lotSize,
      equity,
      riskPercent,
      entryPrice,
      stopLoss
    });
    if (resolved.error) {
      formError = resolved.error;
      return;
    }
    const { size, riskAmount } = resolved;
    const error = validateOrderInput({
      side: 'sell',
      pair: currentPair,
      orderType,
      size,
      currentTick,
      limitPrice,
      stopPrice,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined,
      entryPrice,
      openRisk,
      equity,
      riskAmount,
      sizingMode,
      riskPercent,
      maxPositionSize: MAX_POSITION_SIZE
    });
    if (error) {
      formError = error;
      return;
    }

    if (orderType === 'market') {
      const position = executeMarketOrder(
        'sell',
        size,
        currentTick.bid,
        currentTick.ask,
        currentTick.timestamp,
        {
          sessionId,
          stopLoss: stopLoss > 0 ? stopLoss : undefined,
          takeProfit: takeProfit > 0 ? takeProfit : undefined,
          riskAmount,
          slippage
        }
      );
      positionManager.add(position);
      tradingStore.addPosition(position);
      onSessionEvent?.('position_opened', { positionId: position.id, side: 'sell', size: position.size });
      resetTransientFields();
      return;
    }

    const pending = createPendingOrder({
      sessionId,
      type: orderType,
      side: 'sell',
      size,
      price: orderType === 'limit' ? limitPrice : undefined,
      stopPrice: orderType === 'stop' ? stopPrice : undefined,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined,
      createdAt: currentTick.timestamp,
      riskAmount
    });
    orderBook.add(pending);
    tradingStore.addOrder(pending);
    onSessionEvent?.('order_placed', {
      orderId: pending.id,
      type: pending.type,
      side: pending.side,
      size: pending.size,
      setupTags: setupTagsInput
    });
    resetTransientFields();
  }

  function loadOrderForAmend(orderId: string) {
    const order = pendingOrders.find((item) => item.id === orderId);
    if (!order) return;
    selectedPendingId = order.id;
    orderType = order.type;
    lotSize = order.size;
    limitPrice = order.price || 0;
    stopPrice = order.stopPrice || 0;
    stopLoss = order.stopLoss || 0;
    takeProfit = order.takeProfit || 0;
  }

  function handleAmendOrder() {
    if (!selectedPendingId || !currentTick) return;
    const amended = orderBook.amend(
      selectedPendingId,
      {
        size: lotSize,
        price: orderType === 'limit' ? limitPrice : undefined,
        stopPrice: orderType === 'stop' ? stopPrice : undefined,
        stopLoss: stopLoss > 0 ? stopLoss : undefined,
        takeProfit: takeProfit > 0 ? takeProfit : undefined
      },
      currentTick.timestamp
    );
    if (!amended) return;
    tradingStore.updateOrder(amended.id, amended);
    onSessionEvent?.('order_amended', { orderId: amended.id });
    selectedPendingId = '';
  }

  function handleCancelOrder(orderId: string) {
    if (!currentTick) return;
    const cancelled = orderBook.cancel(orderId, 'manual_cancel', currentTick.timestamp);
    if (!cancelled) return;
    tradingStore.updateOrder(cancelled.id, cancelled);
    onSessionEvent?.('order_cancelled', { orderId: cancelled.id, reason: cancelled.cancelReason });
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;

    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      handleBuy();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      handleSell();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="order-panel">
  <div class="panel-header">
    <h3>Order Entry</h3>
  </div>

  <div class="panel-body">
    <div class="price-display">
      <div class="bid">
        <span class="label">BID</span>
        <span class="price sell-price">
          {#if currentTick}
            {isIndex ? currentTick.bid.toFixed(2) : currentTick.bid.toFixed(5)}
          {:else}
            ---
          {/if}
        </span>
      </div>
      <div class="spread">
        <span class="label">SPREAD</span>
        <span class="value">
          {#if isIndex}
            {PAIR_SPREADS[currentPair].toFixed(1)} pts
          {:else}
            {(PAIR_SPREADS[currentPair] * 10000).toFixed(1)} pips
          {/if}
        </span>
      </div>
      <div class="ask">
        <span class="label">ASK</span>
        <span class="price buy-price">
          {#if currentTick}
            {isIndex ? currentTick.ask.toFixed(2) : currentTick.ask.toFixed(5)}
          {:else}
            ---
          {/if}
        </span>
      </div>
    </div>

    <div class="form-group">
      <label for="lot-size">Lot Size</label>
      <input
        id="lot-size"
        type="number"
        bind:value={lotSize}
        min="0.01"
        max="100"
        step="0.01"
      />
    </div>

    <div class="form-group">
      <label for="sizing-mode">Sizing Mode</label>
      <select id="sizing-mode" bind:value={sizingMode}>
        <option value="fixed">Fixed lot</option>
        <option value="risk_percent">Risk %</option>
      </select>
    </div>

    {#if sizingMode === 'risk_percent'}
      <div class="form-group">
        <label for="risk-percent">Risk % per trade</label>
        <input
          id="risk-percent"
          type="number"
          bind:value={riskPercent}
          min="0.1"
          max="20"
          step="0.1"
        />
      </div>
    {/if}

    <div class="form-group">
      <label for="order-type">Order Type</label>
      <select id="order-type" bind:value={orderType}>
        <option value="market">Market</option>
        <option value="limit">Limit</option>
        <option value="stop">Stop</option>
      </select>
    </div>

    {#if orderType === 'limit'}
      <div class="form-group">
        <label for="limit-price">Limit Price</label>
        <input
          id="limit-price"
          type="number"
          bind:value={limitPrice}
          step="0.00001"
        />
      </div>
    {/if}

    {#if orderType === 'stop'}
      <div class="form-group">
        <label for="stop-price">Stop Price</label>
        <input
          id="stop-price"
          type="number"
          bind:value={stopPrice}
          step="0.00001"
        />
      </div>
    {/if}

    <div class="form-group">
      <label for="stop-loss">Stop Loss (optional)</label>
      <input
        id="stop-loss"
        type="number"
        bind:value={stopLoss}
        step={isIndex ? '0.1' : '0.00001'}
      />
    </div>

    <div class="form-group">
      <label for="take-profit">Take Profit (optional)</label>
      <input
        id="take-profit"
        type="number"
        bind:value={takeProfit}
        step={isIndex ? '0.1' : '0.00001'}
      />
    </div>

    <div class="form-group">
      <label for="rr-preset">TP Preset</label>
      <select id="rr-preset" bind:value={selectedRrPreset}>
        <option value={0}>No preset</option>
        {#each rrPresets as rr}
          <option value={rr}>{rr}R</option>
        {/each}
      </select>
    </div>

    <div class="form-group">
      <label for="setup-tags">Setup Tags (comma-separated)</label>
      <input
        id="setup-tags"
        type="text"
        bind:value={setupTagsInput}
        placeholder="ict-breaker, ny-open"
      />
    </div>

    {#if formError}
      <p class="form-error">{formError}</p>
    {/if}

    <div class="action-buttons">
      <button class="btn btn-buy" on:click={handleBuy}>
        BUY (B)
      </button>
      <button class="btn btn-sell" on:click={handleSell}>
        SELL (S)
      </button>
    </div>

    {#if selectedPendingId}
      <button class="btn btn-amend" on:click={handleAmendOrder}>
        Amend Selected Pending Order
      </button>
    {/if}

    {#if pendingOrders.length > 0}
      <div class="pending-orders">
        <h4>Pending Orders</h4>
        {#each pendingOrders as order}
          <div class="pending-row" class:selected={selectedPendingId === order.id}>
            <button class="btn-mini" on:click={() => loadOrderForAmend(order.id)}>Edit</button>
            <button class="btn-mini danger" on:click={() => handleCancelOrder(order.id)}>Cancel</button>
            <span>{order.side.toUpperCase()} {order.type.toUpperCase()}</span>
            <span>{order.size}</span>
            <span>
              {#if order.type === 'limit'}
                @{order.price?.toFixed(isIndex ? 2 : 5)}
              {:else}
                @{order.stopPrice?.toFixed(isIndex ? 2 : 5)}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="account-info">
      <div class="info-row">
        <span>Balance:</span>
        <span class="value">${balance.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span>Equity:</span>
        <span class="value">${equity.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span>Unrealized P&L:</span>
        <span class="value" class:positive={equity >= balance} class:negative={equity < balance}>
          ${(equity - balance).toFixed(2)}
        </span>
      </div>
      <div class="info-row">
        <span>Pending Orders:</span>
        <span class="value">{pendingOrders.length}</span>
      </div>
      <div class="info-row">
        <span>Open Risk:</span>
        <span class="value">${openRisk.toFixed(2)} ({usedRisk.toFixed(1)}%)</span>
      </div>
      <div class="info-row">
        <span>Exposure:</span>
        <span class="value">{exposure.toFixed(2)} lots</span>
      </div>
      <div class="info-row">
        <span>Max DD (session):</span>
        <span class="value">${maxDrawdown.toFixed(2)}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .order-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-0);
    border-radius: var(--radius-md);
  }

  .panel-header {
    padding: 12px 14px 8px;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-hi);
  }

  .panel-body {
    flex: 1;
    overflow: auto;
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .price-display {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface-1);
  }

  .bid,
  .ask,
  .spread {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 9px 10px;
    background: rgba(20, 30, 45, 0.72);
    box-shadow: inset 1px 0 0 rgba(132, 164, 204, 0.18);
  }

  .bid {
    box-shadow: none;
  }

  .label {
    font-size: 10px;
    letter-spacing: 0.4px;
    color: var(--text-low);
    font-weight: 600;
  }

  .price {
    font-size: 14px;
    font-weight: 700;
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .buy-price {
    color: var(--success-color);
  }

  .sell-price {
    color: var(--danger-color);
  }

  .value {
    font-size: 12px;
    color: var(--text-hi);
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .form-group {
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 8px 9px;
    border-radius: 10px;
    background: var(--surface-1);
  }

  .form-group label {
    font-size: 10px;
    color: var(--text-low);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 7px 9px;
    background: rgba(15, 25, 38, 0.92);
    border: none;
    box-shadow: inset 0 0 0 1px var(--line-soft);
    border-radius: 8px;
    color: var(--text-hi);
    font-size: 12px;
  }

  .form-group input:focus,
  .form-group select:focus {
    box-shadow: inset 0 0 0 1px rgba(112, 171, 255, 0.75), var(--focus-ring);
    outline: none;
  }

  .form-error {
    color: var(--bear);
    font-size: 12px;
    padding: 8px 10px;
    border-radius: 9px;
    background: rgba(240, 91, 110, 0.12);
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 2px;
    position: sticky;
    bottom: 0;
    padding: 8px 0 0;
    background: linear-gradient(180deg, rgba(7, 12, 20, 0), rgba(7, 12, 20, 0.88) 24%, rgba(7, 12, 20, 0.95) 100%);
    z-index: 2;
  }

  .btn {
    padding: 11px 9px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 11px;
    transition: filter var(--motion-fast), transform var(--motion-fast);
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .btn:hover {
    filter: brightness(1.06);
  }

  .btn:active {
    transform: translateY(1px);
  }

  .btn-buy {
    background: var(--success-color);
    color: white;
  }

  .btn-sell {
    background: var(--danger-color);
    color: white;
  }

  .btn-amend {
    background: var(--accent);
    color: white;
    padding: 10px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
  }

  .pending-orders {
    padding: 10px;
    border-radius: 10px;
    background: var(--surface-1);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pending-orders h4 {
    margin: 0 0 2px 0;
    font-size: 10px;
    color: var(--text-mid);
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .pending-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    gap: 6px;
    align-items: center;
    font-size: 10px;
    color: var(--text-mid);
    padding: 7px 8px;
    border-radius: 8px;
    background: rgba(17, 29, 43, 0.84);
  }

  .pending-row.selected {
    background: rgba(76, 141, 255, 0.2);
  }

  .btn-mini {
    font-size: 10px;
    padding: 4px 8px;
    background: rgba(66, 101, 141, 0.34);
    color: var(--text-hi);
    border-radius: 999px;
    font-weight: 600;
  }

  .btn-mini.danger {
    color: var(--bear);
    background: rgba(240, 91, 110, 0.17);
  }

  .account-info {
    margin-top: 2px;
    padding: 10px;
    border-radius: 10px;
    background: var(--surface-1);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    gap: 8px;
    padding: 5px 0;
  }

  .info-row span:first-child {
    color: var(--text-low);
  }

  .info-row .positive {
    color: var(--bull);
  }

  .info-row .negative {
    color: var(--bear);
  }

  @media (max-width: 1199px) {
    .form-group {
      grid-template-columns: 1fr;
      gap: 5px;
    }
  }
</style>
