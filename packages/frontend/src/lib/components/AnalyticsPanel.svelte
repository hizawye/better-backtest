<script lang="ts">
  import type { AnalyticsSnapshot } from '$shared/types';

  export let snapshot: AnalyticsSnapshot | null = null;
  export let onExportCsv: (() => void) | undefined;
  export let onExportJson: (() => void) | undefined;

  function toPoints(values: Array<{ value: number }>, width = 260, height = 80): string {
    if (values.length === 0) return '';
    const nums = values.map((item) => item.value);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;
    return values
      .map((item, i) => {
        const x = (i / Math.max(values.length - 1, 1)) * width;
        const y = height - ((item.value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }
</script>

<div class="analytics-panel">
  <div class="header">
    <h3>Analytics</h3>
    <div class="actions">
      <button on:click={onExportCsv}>Export CSV</button>
      <button on:click={onExportJson}>Export JSON</button>
    </div>
  </div>

  <div class="content">
    {#if !snapshot}
      <p class="empty">No analytics yet</p>
    {:else}
      <div class="grid">
        <div>Total Trades: {snapshot.totalTrades}</div>
        <div>Win Rate: {snapshot.winRate}%</div>
        <div>Total PnL: ${snapshot.totalPnL.toFixed(2)}</div>
        <div>Expectancy: ${snapshot.expectancy.toFixed(2)}</div>
        <div>Profit Factor: {snapshot.profitFactor.toFixed(2)}</div>
        <div>Max DD: ${snapshot.maxDrawdown.toFixed(2)}</div>
        <div>Avg Win: ${snapshot.averageWin.toFixed(2)}</div>
        <div>Avg Loss: ${snapshot.averageLoss.toFixed(2)}</div>
        <div>Best Streak: {snapshot.bestStreak}</div>
        <div>Worst Streak: {snapshot.worstStreak}</div>
        <div>Avg R: {snapshot.averageRMultiple.toFixed(2)}</div>
        <div>Median R: {snapshot.medianRMultiple.toFixed(2)}</div>
      </div>

      <div class="chart">
        <h4>Equity Curve</h4>
        <svg viewBox="0 0 260 80" preserveAspectRatio="none">
          <polyline points={toPoints(snapshot.equityCurve)} fill="none" stroke="#089981" stroke-width="2" />
        </svg>
      </div>

      <div class="chart">
        <h4>Drawdown Curve</h4>
        <svg viewBox="0 0 260 80" preserveAspectRatio="none">
          <polyline points={toPoints(snapshot.drawdownCurve)} fill="none" stroke="#f23645" stroke-width="2" />
        </svg>
      </div>

      <div class="histogram">
        <h4>R Distribution</h4>
        {#each snapshot.rDistribution as bucket}
          <div class="bar-row">
            <span>{bucket.bucket}</span>
            <div class="bar-wrap"><div class="bar" style={`width: ${bucket.count * 12}px`}></div></div>
            <span>{bucket.count}</span>
          </div>
        {/each}
      </div>

      <div class="setups">
        <h4>Setup Performance</h4>
        {#each Object.entries(snapshot.bySetupTag) as [tag, stats]}
          <div class="setup-row">
            <span>{tag}</span>
            <span>{stats.trades} trades</span>
            <span>${stats.pnl.toFixed(2)}</span>
            <span>{stats.winRate.toFixed(1)}%</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .analytics-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header h3 {
    margin: 0;
    font-size: 13px;
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .actions button {
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .content {
    padding: 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    font-size: 12px;
  }

  .chart h4,
  .histogram h4,
  .setups h4 {
    margin: 0 0 6px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  svg {
    width: 100%;
    height: 80px;
    background: var(--bg-tertiary);
    border-radius: 4px;
  }

  .bar-row,
  .setup-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 8px;
    align-items: center;
    font-size: 11px;
    margin-bottom: 4px;
  }

  .bar-wrap {
    width: 70px;
    height: 6px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--accent-color);
  }
</style>
