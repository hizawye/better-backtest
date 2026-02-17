<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import { getExposure, getOpenRisk } from '../engine/risk';

  $: balance = $tradingStore.balance;
  $: equity = $tradingStore.equity;
  $: pair = $tradingStore.currentPair;
  $: maxDrawdown = $tradingStore.maxDrawdown;
  $: positions = $tradingStore.positions;
  $: openRisk = getOpenRisk(positions, pair);
  $: exposure = getExposure(positions);
  $: usedRisk = equity > 0 ? (openRisk / equity) * 100 : 0;
</script>

<div class="metrics-panel">
  <h3>Account Metrics</h3>
  <div class="metrics-table mono">
    <div class="metric-row">
      <span>Balance</span>
      <strong>${balance.toFixed(2)}</strong>
    </div>
    <div class="metric-row">
      <span>Equity</span>
      <strong>${equity.toFixed(2)}</strong>
    </div>
    <div class="metric-row">
      <span>Open Risk</span>
      <strong>${openRisk.toFixed(2)}</strong>
    </div>
    <div class="metric-row" class:warn={usedRisk > 2} class:danger={usedRisk > 5}>
      <span>Used Risk</span>
      <strong>{usedRisk.toFixed(1)}%</strong>
    </div>
    <div class="metric-row">
      <span>Exposure</span>
      <strong>{exposure.toFixed(2)} lots</strong>
    </div>
    <div class="metric-row" class:warn={maxDrawdown > 0}>
      <span>Max DD</span>
      <strong>${maxDrawdown.toFixed(2)}</strong>
    </div>
  </div>
</div>

<style>
  .metrics-panel {
    margin-top: 0;
    border-top: 1px solid var(--border-subtle);
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h3 {
    margin: 0;
    font-size: 10px;
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .metrics-table {
    border-top: 1px solid rgba(51, 65, 85, 0.45);
    border-bottom: 1px solid rgba(51, 65, 85, 0.45);
  }

  .metric-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    border-top: 1px solid rgba(51, 65, 85, 0.35);
  }

  .metric-row:first-child {
    border-top: none;
  }

  .metric-row span {
    font-size: 10px;
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .metric-row strong {
    font-size: 11px;
    color: var(--text-hi);
    font-weight: 600;
  }

  .metric-row.warn strong {
    color: var(--warn);
  }

  .metric-row.danger strong {
    color: var(--bear);
  }
</style>
