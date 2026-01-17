<script lang="ts">
  import { useTradingStore } from '../stores/trading';
  import { executeMarketOrder } from '../engine/execution';
  import { positionManager } from '../engine/positions';
  import { PAIR_SPREADS } from '$shared/types';

  let store = useTradingStore();

  let lotSize = 0.1;
  let orderType: 'market' | 'limit' | 'stop' = 'market';
  let limitPrice = 0;
  let stopPrice = 0;

  function handleBuy() {
    if (!$store.currentTick) return;

    if (orderType === 'market') {
      const position = executeMarketOrder(
        'buy',
        lotSize,
        $store.currentTick.bid,
        $store.currentTick.ask,
        $store.currentTick.timestamp
      );
      positionManager.add(position);
      store.addPosition(position);
    }
  }

  function handleSell() {
    if (!$store.currentTick) return;

    if (orderType === 'market') {
      const position = executeMarketOrder(
        'sell',
        lotSize,
        $store.currentTick.bid,
        $store.currentTick.ask,
        $store.currentTick.timestamp
      );
      positionManager.add(position);
      store.addPosition(position);
    }
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
        <span class="price sell-price">{$store.currentTick?.bid.toFixed(5) || '---'}</span>
      </div>
      <div class="spread">
        <span class="label">SPREAD</span>
        <span class="value">{(PAIR_SPREADS[$store.currentPair] * 10000).toFixed(1)} pips</span>
      </div>
      <div class="ask">
        <span class="label">ASK</span>
        <span class="price buy-price">{$store.currentTick?.ask.toFixed(5) || '---'}</span>
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

    <div class="action-buttons">
      <button class="btn btn-buy" on:click={handleBuy}>
        BUY (B)
      </button>
      <button class="btn btn-sell" on:click={handleSell}>
        SELL (S)
      </button>
    </div>

    <div class="account-info">
      <div class="info-row">
        <span>Balance:</span>
        <span class="value">${$store.balance.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span>Equity:</span>
        <span class="value">${$store.equity.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span>Unrealized P&L:</span>
        <span class="value" class:positive={$store.equity >= $store.balance} class:negative={$store.equity < $store.balance}>
          ${($store.equity - $store.balance).toFixed(2)}
        </span>
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
