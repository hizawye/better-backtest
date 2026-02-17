<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import { createPendingOrder, executeMarketOrder } from '../engine/execution';
  import { getExposure, getOpenRisk, calculateRiskBasedSize, validateStopTargets } from '../engine/risk';
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
  let sizingMode: 'fixed' | 'risk_percent' = 'fixed';
  let riskPercent = 1;
  let orderType: 'market' | 'limit' | 'stop' = 'market';
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

  function calculateRiskAmount(entryPrice: number, side: 'buy' | 'sell'): number | undefined {
    if (!stopLoss || stopLoss <= 0) return undefined;
    const riskDistance = side === 'buy' ? entryPrice - stopLoss : stopLoss - entryPrice;
    if (riskDistance <= 0) return undefined;
    const pointValue = isIndex ? 1 : 10;
    return riskDistance * lotSize * pointValue;
  }

  function resolveSizeAndRisk(entryPrice: number, side: 'buy' | 'sell'): { size: number; riskAmount?: number } {
    if (sizingMode === 'fixed') {
      return { size: lotSize, riskAmount: calculateRiskAmount(entryPrice, side) };
    }

    if (!stopLoss || stopLoss <= 0) {
      formError = 'Risk-% mode requires stop loss.';
      return { size: 0 };
    }

    const resolved = calculateRiskBasedSize(equity, riskPercent, entryPrice, stopLoss, currentPair);
    return { size: resolved.size, riskAmount: resolved.riskAmount };
  }

  function resolveEntryPrice(side: 'buy' | 'sell'): number {
    if (!currentTick) return 0;
    if (orderType === 'limit') return limitPrice;
    if (orderType === 'stop') return stopPrice;
    return side === 'buy' ? currentTick.ask : currentTick.bid;
  }

  function validateOrder(
    side: 'buy' | 'sell',
    size: number,
    entryPrice: number,
    riskAmount?: number
  ): string | null {
    if (!currentTick) return 'No market tick available.';
    if (!Number.isFinite(size) || size <= 0) return 'Order size must be greater than zero.';
    if (size > MAX_POSITION_SIZE) return `Max position size is ${MAX_POSITION_SIZE} lots.`;

    if (orderType === 'limit' && limitPrice <= 0) return 'Limit price is required for limit order.';
    if (orderType === 'stop' && stopPrice <= 0) return 'Stop trigger price is required for stop order.';
    if (orderType === 'limit' && side === 'buy' && limitPrice >= currentTick.ask) {
      return 'Buy limit must be below current ask.';
    }
    if (orderType === 'limit' && side === 'sell' && limitPrice <= currentTick.bid) {
      return 'Sell limit must be above current bid.';
    }
    if (orderType === 'stop' && side === 'buy' && stopPrice <= currentTick.ask) {
      return 'Buy stop must be above current ask.';
    }
    if (orderType === 'stop' && side === 'sell' && stopPrice >= currentTick.bid) {
      return 'Sell stop must be below current bid.';
    }

    const stopErr = validateStopTargets({
      side,
      entryPrice,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      takeProfit: takeProfit > 0 ? takeProfit : undefined
    });
    if (stopErr) return stopErr;

    if (sizingMode === 'risk_percent') {
      const selectedRisk = (equity * riskPercent) / 100;
      if (selectedRisk > equity) return 'Insufficient equity for selected risk.';
    }

    if (typeof riskAmount === 'number' && openRisk + riskAmount > equity) {
      return 'Open risk plus trade risk exceeds available equity.';
    }

    return null;
  }

  function applyRrPreset(side: 'buy' | 'sell') {
    if (!selectedRrPreset || !stopLoss || !currentTick) return;
    const entry = resolveEntryPrice(side);
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
    const entryPrice = resolveEntryPrice('buy');
    const { size, riskAmount } = resolveSizeAndRisk(entryPrice, 'buy');
    const error = validateOrder('buy', size, entryPrice, riskAmount);
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
    const entryPrice = resolveEntryPrice('sell');
    const { size, riskAmount } = resolveSizeAndRisk(entryPrice, 'sell');
    const error = validateOrder('sell', size, entryPrice, riskAmount);
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
    overflow-y: auto;
  }

  .panel-header {
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .panel-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .price-display {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 4px;
  }

  .bid, .ask, .spread {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .price {
    font-size: 18px;
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }

  .buy-price {
    color: var(--success-color);
  }

  .sell-price {
    color: var(--danger-color);
  }

  .value {
    font-size: 13px;
    color: var(--text-primary);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .form-group input,
  .form-group select {
    padding: 8px 10px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 13px;
  }

  .form-group input:focus,
  .form-group select:focus {
    border-color: var(--accent-color);
  }

  .form-error {
    color: var(--danger-color);
    font-size: 12px;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }

  .btn {
    padding: 12px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 13px;
    transition: opacity 0.2s;
  }

  .btn:hover {
    opacity: 0.85;
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
    background: var(--accent-color);
    color: white;
  }

  .pending-orders {
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-secondary);
  }

  .pending-orders h4 {
    margin: 0 0 6px 0;
    font-size: 12px;
    color: var(--text-primary);
  }

  .pending-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: var(--text-secondary);
    padding: 4px;
    border-radius: 4px;
  }

  .pending-row.selected {
    background: rgba(41, 98, 255, 0.2);
  }

  .btn-mini {
    font-size: 10px;
    padding: 4px 6px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-radius: 4px;
  }

  .btn-mini.danger {
    color: var(--danger-color);
  }

  .account-info {
    margin-top: 8px;
    padding: 12px;
    background: var(--bg-secondary);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .info-row span:first-child {
    color: var(--text-secondary);
  }

  .info-row .positive {
    color: var(--success-color);
  }

  .info-row .negative {
    color: var(--danger-color);
  }
</style>
