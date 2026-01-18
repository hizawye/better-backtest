<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import { formatPnL, formatPips } from '../utils/forex';

  $: trades = $tradingStore.trades;
  $: winningTrades = trades.filter(t => t.realizedPnL > 0);
  $: losingTrades = trades.filter(t => t.realizedPnL < 0);
  $: winRate = trades.length > 0
    ? ((winningTrades.length / trades.length) * 100).toFixed(1)
    : '0.0';
  $: totalPnL = trades.reduce((sum, t) => sum + t.realizedPnL, 0);
</script>

<div class="trade-history">
  <div class="table-header">
    <h3>Trade History ({trades.length})</h3>
    <div class="stats">
      <span class="stat">Win Rate: <strong>{winRate}%</strong></span>
      <span class="stat">Total P&L: <strong class:positive={totalPnL > 0} class:negative={totalPnL < 0}>{formatPnL(totalPnL)}</strong></span>
    </div>
  </div>

  <div class="table-wrapper">
    {#if trades.length === 0}
      <div class="empty-state">
        <p>No closed trades yet</p>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Pips</th>
            <th>P&L</th>
          </tr>
        </thead>
        <tbody>
          {#each trades.slice().reverse() as trade}
            <tr>
              <td>{new Date(trade.exitTime).toLocaleTimeString()}</td>
              <td>
                <span class="side" class:buy={trade.side === 'buy'} class:sell={trade.side === 'sell'}>
                  {trade.side.toUpperCase()}
                </span>
              </td>
              <td>{trade.size}</td>
              <td>{trade.entryPrice.toFixed(5)}</td>
              <td>{trade.exitPrice.toFixed(5)}</td>
              <td class:positive={trade.pips > 0} class:negative={trade.pips < 0}>
                {formatPips(trade.pips)}
              </td>
              <td class:positive={trade.realizedPnL > 0} class:negative={trade.realizedPnL < 0}>
                {formatPnL(trade.realizedPnL)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .trade-history {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .table-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .table-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stats {
    display: flex;
    gap: 20px;
  }

  .stat {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .stat strong {
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
</style>
