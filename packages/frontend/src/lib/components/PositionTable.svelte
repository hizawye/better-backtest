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

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .header-actions input {
    width: 64px;
    padding: 4px 6px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 11px;
  }

  .btn-small {
    padding: 5px 8px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    font-size: 11px;
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

  .btn-mini {
    margin-right: 6px;
    padding: 4px 7px;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border-radius: 4px;
    font-size: 11px;
  }

  .btn-mini:hover {
    background: var(--accent-color);
    color: white;
  }
</style>
