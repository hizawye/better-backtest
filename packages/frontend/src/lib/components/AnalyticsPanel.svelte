<script lang="ts">
  import type { AnalyticsSnapshot, CrossSessionAnalytics } from '$shared/types';

  export let snapshot: AnalyticsSnapshot | null = null;
  export let crossSession: CrossSessionAnalytics | null = null;
  export let onExportCsv: (() => void) | undefined;
  export let onExportJson: (() => void) | undefined;
  $: setupEntries = snapshot ? Object.entries(snapshot.bySetupTag) : [];

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
      {#if crossSession}
        <section class="section">
          <h4>Cross-Session</h4>
          <div class="stats-table mono">
            <div class="stat-row"><span>Sessions</span><strong>{crossSession.sessions}</strong></div>
            <div class="stat-row"><span>Trades</span><strong>{crossSession.trades}</strong></div>
            <div class="stat-row"><span>Total PnL</span><strong>${crossSession.totalPnL.toFixed(2)}</strong></div>
            <div class="stat-row"><span>Win Rate</span><strong>{crossSession.winRate.toFixed(1)}%</strong></div>
          </div>
        </section>
      {/if}

      <section class="section">
        <h4>Performance</h4>
        <div class="stats-table mono">
          <div class="stat-row"><span>Total Trades</span><strong>{snapshot.totalTrades}</strong></div>
          <div class="stat-row"><span>Win Rate</span><strong>{snapshot.winRate}%</strong></div>
          <div class="stat-row"><span>Total PnL</span><strong>${snapshot.totalPnL.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Expectancy</span><strong>${snapshot.expectancy.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Profit Factor</span><strong>{snapshot.profitFactor.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Max DD</span><strong>${snapshot.maxDrawdown.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Avg Win</span><strong>${snapshot.averageWin.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Avg Loss</span><strong>${snapshot.averageLoss.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Best Streak</span><strong>{snapshot.bestStreak}</strong></div>
          <div class="stat-row"><span>Worst Streak</span><strong>{snapshot.worstStreak}</strong></div>
          <div class="stat-row"><span>Avg R</span><strong>{snapshot.averageRMultiple.toFixed(2)}</strong></div>
          <div class="stat-row"><span>Median R</span><strong>{snapshot.medianRMultiple.toFixed(2)}</strong></div>
        </div>
      </section>

      <section class="section">
        <h4>Equity Curve</h4>
        <svg viewBox="0 0 260 80" preserveAspectRatio="none">
          <polyline points={toPoints(snapshot.equityCurve)} fill="none" stroke="#089981" stroke-width="2" />
        </svg>
      </section>

      <section class="section">
        <h4>Drawdown Curve</h4>
        <svg viewBox="0 0 260 80" preserveAspectRatio="none">
          <polyline points={toPoints(snapshot.drawdownCurve)} fill="none" stroke="#f23645" stroke-width="2" />
        </svg>
      </section>

      <section class="section">
        <h4>R Distribution</h4>
        <div class="histogram mono">
          {#each snapshot.rDistribution as bucket}
            <div class="bar-row">
              <span>{bucket.bucket}</span>
              <div class="bar-wrap"><div class="bar" style={`width: ${bucket.count * 12}px`}></div></div>
              <span>{bucket.count}</span>
            </div>
          {/each}
        </div>
      </section>

      {#if setupEntries.length > 0}
        <section class="section">
          <h4>Setup Performance</h4>
          <div class="setups mono">
            {#each setupEntries as [tag, stats]}
              <div class="setup-row">
                <span>{tag}</span>
                <span>{stats.trades} trades</span>
                <span>${stats.pnl.toFixed(2)}</span>
                <span>{stats.winRate.toFixed(1)}%</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>

<style>
  .analytics-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: transparent;
  }

  .header {
    padding: 10px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(20, 31, 46, 0.58);
  }

  .header h3 {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.45px;
    text-transform: uppercase;
    color: var(--text-hi);
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .actions button {
    font-size: 11px;
    padding: 6px 9px 7px;
    background: rgba(43, 65, 91, 0.42);
    color: var(--text-mid);
    border: 0;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .actions button:hover {
    color: var(--text-hi);
    background: rgba(57, 87, 120, 0.5);
  }

  .content {
    padding: 10px 12px;
    overflow: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty {
    color: var(--text-low);
    font-size: 11px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid rgba(81, 111, 147, 0.22);
    padding-top: 8px;
  }

  .section h4 {
    margin: 0;
    font-size: 10px;
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .stats-table {
    background: rgba(17, 27, 40, 0.58);
    border-radius: 10px;
    padding: 3px 8px;
  }

  .stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    border-top: 1px solid rgba(74, 101, 133, 0.24);
    font-size: 11px;
  }

  .stat-row:first-child {
    border-top: none;
  }

  .stat-row span {
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.35px;
  }

  .stat-row strong {
    color: var(--text-hi);
    font-size: 11px;
    font-weight: 600;
  }

  svg {
    width: 100%;
    height: 80px;
    background: rgba(14, 23, 34, 0.72);
    border-radius: 10px;
  }

  .histogram,
  .setups {
    background: rgba(17, 27, 40, 0.58);
    border-radius: 10px;
    padding: 4px 0;
  }

  .bar-row,
  .setup-row {
    display: grid;
    gap: 8px;
    align-items: center;
    font-size: 10px;
    color: var(--text-mid);
    padding: 4px 0;
    border-top: 1px solid rgba(74, 101, 133, 0.22);
  }

  .bar-row {
    grid-template-columns: 44px minmax(0, 1fr) 32px;
  }

  .setup-row {
    grid-template-columns: minmax(0, 1fr) auto auto auto;
  }

  .bar-row:first-child,
  .setup-row:first-child {
    border-top: none;
  }

  .bar-wrap {
    height: 6px;
    background: #0f1721;
    overflow: hidden;
    border-radius: 999px;
  }

  .bar {
    height: 100%;
    background: linear-gradient(90deg, #3a7fff 0%, #6ba5ff 100%);
  }

  .setups .setup-row span:first-child {
    color: var(--text-hi);
  }

  .section:first-child {
    border-top: none;
    padding-top: 0;
  }

  .section:first-child .stats-table,
  .section:first-child .histogram,
  .section:first-child .setups {
    margin-top: 0;
  }

  .section:last-child {
    padding-bottom: 2px;
  }

  .header h3,
  .section h4,
  .stat-row span {
    white-space: nowrap;
  }

  .stat-row span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat-row strong {
    white-space: nowrap;
  }

  .section h4 {
    line-height: 1.2;
  }

  .bar-row span,
  .setup-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section .stats-table {
    margin-top: 2px;
  }

  .section .histogram,
  .section .setups {
    margin-top: 2px;
  }

  .section .histogram {
    padding-top: 0;
    padding-bottom: 0;
  }

  .section .setups {
    padding-top: 0;
    padding-bottom: 0;
  }

  .section .histogram .bar-row:last-child,
  .section .setups .setup-row:last-child {
    padding-bottom: 2px;
  }

  .section .histogram .bar-row:first-child,
  .section .setups .setup-row:first-child {
    padding-top: 2px;
  }

  .section .stats-table .stat-row:last-child {
    padding-bottom: 4px;
  }

  .section .stats-table .stat-row:first-child {
    padding-top: 4px;
  }

  .header h3 {
    color: var(--text-hi);
  }

  .section h4,
  .stat-row span {
    color: var(--text-low);
  }

  .stat-row strong,
  .setup-row span,
  .bar-row span {
    color: var(--text-hi);
  }

  .bar-row span:first-child,
  .setup-row span:nth-child(2),
  .setup-row span:nth-child(4) {
    color: var(--text-mid);
  }

  .setup-row span:nth-child(3) {
    color: var(--text-hi);
  }

  .section .setups .setup-row span:first-child {
    color: var(--text-hi);
  }

  .section .setups .setup-row span:nth-child(2),
  .section .setups .setup-row span:nth-child(4) {
    color: var(--text-low);
  }
</style>
