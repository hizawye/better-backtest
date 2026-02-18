<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import { positionManager } from '../engine/positions';
  import { closePosition, partiallyClosePosition } from '../engine/pnl';
  import { formatPnL, formatPips } from '../utils/forex';
  import type { SessionEvent } from '$shared/types';

  $: positions = $tradingStore.positions;
  $: currentTick = $tradingStore.currentTick;
  $: currentPair = $tradingStore.currentPair;
  $: isIndex = currentPair.includes('NAS') || currentPair.includes('US500');
  let partialClosePercent = 50;

  export let onSessionEvent: ((type: SessionEvent['type'], payload?: Record<string, unknown>) => void) | undefined;

  function handleClose(positionId: string) {
    const position = positionManager.get(positionId);
    if (!position || !currentTick) return;

    const trade = closePosition(
      position,
      currentTick.bid,
      currentTick.ask,
      currentTick.timestamp,
      {
        pair: currentPair,
        commissionPerLot: $tradingStore.commissionPerLot,
        slippage: $tradingStore.slippage,
        closeReason: 'manual'
      }
    );

    positionManager.remove(positionId);
    tradingStore.removePosition(positionId);
    tradingStore.addTrade(trade);
    tradingStore.updateBalance(trade.realizedPnL);
    onSessionEvent?.('position_closed', { positionId, tradeId: trade.id, reason: 'manual' });
  }

  function handlePartialClose(positionId: string) {
    const position = positionManager.get(positionId);
    if (!position || !currentTick) return;

    const ratio = Math.min(1, Math.max(0.01, partialClosePercent / 100));
    const result = partiallyClosePosition(
      position,
      currentTick.bid,
      currentTick.ask,
      currentTick.timestamp,
      ratio,
      {
        pair: currentPair,
        commissionPerLot: $tradingStore.commissionPerLot,
        slippage: $tradingStore.slippage
      }
    );

    tradingStore.addTrade(result.trade);
    tradingStore.updateBalance(result.trade.realizedPnL);
    onSessionEvent?.('position_partially_closed', {
      positionId,
      tradeId: result.trade.id,
      ratio
    });

    if (!result.remainingPosition) {
      positionManager.remove(positionId);
      tradingStore.removePosition(positionId);
      return;
    }

    positionManager.update(positionId, result.remainingPosition);
    tradingStore.setPositions(positionManager.getAll());
  }

  function handleCloseAll() {
    if (!currentTick) return;
    for (const position of [...positions]) {
      const trade = closePosition(
        position,
        currentTick.bid,
        currentTick.ask,
        currentTick.timestamp,
        {
          pair: currentPair,
          commissionPerLot: $tradingStore.commissionPerLot,
          slippage: $tradingStore.slippage,
          closeReason: 'close_all'
        }
      );
      positionManager.remove(position.id);
      tradingStore.removePosition(position.id);
      tradingStore.addTrade(trade);
      tradingStore.updateBalance(trade.realizedPnL);
      onSessionEvent?.('position_closed', { positionId: position.id, tradeId: trade.id, reason: 'close_all' });
    }
  }

  function moveToBreakEven(positionId: string) {
    const position = positionManager.get(positionId);
    if (!position) return;

    positionManager.update(positionId, { stopLoss: position.entryPrice });
    tradingStore.setPositions(positionManager.getAll());
    onSessionEvent?.('order_amended', { positionId, stopLoss: position.entryPrice, helper: 'break_even' });
  }
</script>

<div class="position-table">
  <div class="table-header">
    <h3>Open Positions ({positions.length})</h3>
    <div class="header-actions">
      <input type="number" min="1" max="100" step="1" bind:value={partialClosePercent} />
      <button class="btn-small" on:click={handleCloseAll} disabled={positions.length === 0}>
        Close All
      </button>
    </div>
  </div>

  <div class="table-wrapper">
    {#if positions.length === 0}
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
          {#each positions as position}
            {@const pips = position.currentPrice && position.entryPrice
              ? (position.side === 'buy'
                  ? (position.currentPrice - position.entryPrice)
                  : (position.entryPrice - position.currentPrice)) / (isIndex ? 1 : 0.0001)
              : 0}
            <tr>
              <td>
                <span class="side" class:buy={position.side === 'buy'} class:sell={position.side === 'sell'}>
                  {position.side.toUpperCase()}
                </span>
              </td>
              <td>{position.size}</td>
              <td>{position.entryPrice.toFixed(isIndex ? 2 : 5)}</td>
              <td>{position.currentPrice?.toFixed(isIndex ? 2 : 5) || '---'}</td>
              <td class:positive={pips > 0} class:negative={pips < 0}>
                {formatPips(pips)}
              </td>
              <td class:positive={(position.unrealizedPnL || 0) > 0} class:negative={(position.unrealizedPnL || 0) < 0}>
                {formatPnL(position.unrealizedPnL || 0)}
              </td>
              <td>
                <button class="btn-mini" on:click={() => moveToBreakEven(position.id)} title="Move stop to break-even">
                  BE
                </button>
                <button class="btn-mini" on:click={() => handlePartialClose(position.id)} title="Partial close">
                  {partialClosePercent}%
                </button>
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
  }

  .table-header h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-hi);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .header-actions input {
    width: 68px;
    padding: 6px 8px;
    background: rgba(20, 31, 45, 0.92);
    border: none;
    box-shadow: inset 0 0 0 1px var(--line-soft);
    border-radius: 8px;
    color: var(--text-hi);
    font-size: 12px;
  }

  .btn-small {
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(67, 107, 149, 0.34);
    color: var(--text-hi);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    transition: filter var(--motion-fast);
  }

  .btn-small:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .btn-small:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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

  td:last-child {
    white-space: nowrap;
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

  .btn-close {
    padding: 4px 7px;
    background: transparent;
    color: var(--text-low);
    font-size: 12px;
    border-radius: 5px;
    transition: background var(--motion-fast), color var(--motion-fast);
  }

  .btn-close:hover {
    background: rgba(240, 91, 110, 0.15);
    color: var(--bear);
  }

  .btn-mini {
    margin-right: 6px;
    padding: 4px 8px;
    background: rgba(66, 101, 141, 0.3);
    color: var(--text-mid);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
  }

  .btn-mini:hover {
    color: var(--text-hi);
    background: rgba(81, 126, 175, 0.46);
  }
</style>
