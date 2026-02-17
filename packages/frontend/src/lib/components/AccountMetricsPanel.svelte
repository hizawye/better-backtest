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
  <div class="row">
    <span>Balance</span>
    <strong>${balance.toFixed(2)}</strong>
  </div>
  <div class="row">
    <span>Equity</span>
    <strong>${equity.toFixed(2)}</strong>
  </div>
  <div class="row">
    <span>Open Risk</span>
    <strong>${openRisk.toFixed(2)}</strong>
  </div>
  <div class="row">
    <span>Used Risk</span>
    <strong>{usedRisk.toFixed(1)}%</strong>
  </div>
  <div class="row">
    <span>Exposure</span>
    <strong>{exposure.toFixed(2)} lots</strong>
  </div>
  <div class="row">
    <span>Max DD</span>
    <strong>${maxDrawdown.toFixed(2)}</strong>
  </div>
</div>

<style>
  .metrics-panel {
    margin-top: 8px;
    border-top: 1px solid var(--border-color);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h3 {
    margin: 0 0 4px 0;
    font-size: 13px;
    color: var(--text-primary);
  }

  .row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-secondary);
  }

  strong {
    color: var(--text-primary);
  }
</style>
