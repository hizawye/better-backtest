<script lang="ts">
  import { useTradingStore } from '../stores/trading';
  import { positionManager } from '../engine/positions';
  import { closePosition } from '../engine/pnl';
  import { formatPnL, formatPips } from '../utils/forex';

  const store = useTradingStore();

  function handleClose(positionId: string) {
    const position = positionManager.get(positionId);
    if (!position || !$store.currentTick) return;

    const trade = closePosition(
      position,
      $store.currentTick.bid,
      $store.currentTick.ask,
      $store.currentTick.timestamp,
      $store.currentPair
    );

    positionManager.remove(positionId);
    store.removePosition(positionId);
    store.addTrade(trade);
    store.updateBalance(trade.realizedPnL);
  }
</script>

<div class="position-table">
  <div class="table-header">
    <h3>Open Positions ({$store.positions.length})</h3>
  </div>

  <div class="table-wrapper">
    {#if $store.positions.length === 0}
      <div class="empty-state">
        <p>No open positions</p>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Pips</th>
            <th>P&L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each $store.positions as position}
            {@const pips = position.currentPrice && position.entryPrice
              ? (position.side === 'buy'
                  ? (position.currentPrice - position.entryPrice)
                  : (position.entryPrice - position.currentPrice)) / 0.0001
              : 0}
            <tr>
              <td>
                <span class="side" class:buy={position.side === 'buy'} class:sell={position.side === 'sell'}>
                  {position.side.toUpperCase()}
                </span>
              </td>
              <td>{position.size}</td>
              <td>{position.entryPrice.toFixed(5)}</td>
              <td>{position.currentPrice?.toFixed(5) || '---'}</td>
              <td class:positive={pips > 0} class:negative={pips < 0}>
                {formatPips(pips)}
              </td>
              <td class:positive={(position.unrealizedPnL || 0) > 0} class:negative={(position.unrealizedPnL || 0) < 0}>
                {formatPnL(position.unrealizedPnL || 0)}
              </td>
              <td>
                <button class="btn-close" on:click={() => handleClose(position.id)}>
                  ✕
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .position-table {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .table-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .table-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .table-wrapper {
    flex: 1;
    overflow-y: auto;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    position: sticky;
    top: 0;
    background: var(--bg-secondary);
    z-index: 1;
  }

  th {
    padding: 10px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-color);
  }

  td {
    padding: 10px 12px;
    font-size: 12px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);
  }

  tbody tr:hover {
    background: var(--bg-primary);
  }

  .side {
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
  }

  .side.buy {
    background: rgba(8, 153, 129, 0.2);
    color: var(--success-color);
  }

  .side.sell {
    background: rgba(242, 54, 69, 0.2);
    color: var(--danger-color);
  }

  .positive {
    color: var(--success-color);
  }

  .negative {
    color: var(--danger-color);
  }

  .btn-close {
    padding: 4px 8px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 14px;
    border-radius: 3px;
    transition: all 0.2s;
  }

  .btn-close:hover {
    background: var(--danger-color);
    color: white;
  }
</style>
