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
      <span class="stat">Win Rate <strong>{winRate}%</strong></span>
      <span class="stat">Total <strong class:positive={totalPnL > 0} class:negative={totalPnL < 0}>{formatPnL(totalPnL)}</strong></span>
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
    min-height: 0;
    background: var(--surface-0);
    border-radius: var(--radius-md);
  }

  .table-header {
    padding: 12px 14px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .table-header h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-hi);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .stats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .stat {
    font-size: 10px;
    color: var(--text-low);
    background: rgba(56, 87, 122, 0.34);
    border-radius: 999px;
    padding: 4px 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .stat strong {
    color: var(--text-hi);
    margin-left: 4px;
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .table-wrapper {
    flex: 1;
    overflow: auto;
    min-height: 0;
    padding: 0 10px 10px;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-low);
    font-size: 12px;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 6px;
  }

  thead {
    position: sticky;
    top: 0;
    background: linear-gradient(180deg, rgba(12, 20, 31, 0.95), rgba(12, 20, 31, 0.82));
    z-index: 1;
  }

  th {
    padding: 8px 10px;
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.45px;
    border: none;
  }

  td {
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-hi);
    border: none;
    background: var(--surface-1);
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  tbody tr:hover {
    filter: brightness(1.06);
  }

  th:first-child,
  td:first-child {
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
  }

  th:last-child,
  td:last-child {
    border-top-right-radius: 10px;
    border-bottom-right-radius: 10px;
  }

  .side {
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    font-family: inherit;
  }

  .side.buy {
    background: rgba(20, 184, 122, 0.14);
    color: var(--bull);
  }

  .side.sell {
    background: rgba(240, 91, 110, 0.14);
    color: var(--bear);
  }

  .positive {
    color: var(--bull);
  }

  .negative {
    color: var(--bear);
  }
</style>
