<script lang="ts">
  import type { SessionEvent } from '$shared/types';

  export let events: SessionEvent[] = [];
</script>

<div class="event-log">
  <div class="header">
    <h3>Event Log ({events.length})</h3>
  </div>
  <div class="body">
    {#if events.length === 0}
      <p class="empty">No events yet</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {#each events.slice().reverse() as event}
            <tr>
              <td>{event.sequence}</td>
              <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
              <td>{event.type}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .event-log {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #0f161f;
  }

  .header {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-subtle);
    background: #121b27;
  }

  .header h3 {
    margin: 0;
    font-size: 11px;
    color: var(--text-hi);
    letter-spacing: 0.45px;
    text-transform: uppercase;
  }

  .body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .empty {
    color: var(--text-low);
    padding: 20px;
    font-size: 11px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 8px 10px;
    font-size: 11px;
    text-align: left;
    border-bottom: 1px solid rgba(38, 49, 66, 0.62);
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    color: var(--text-hi);
  }

  th {
    color: var(--text-low);
    position: sticky;
    top: 0;
    background: #111923;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.45px;
    border-bottom-color: var(--border-subtle);
  }

  tbody tr:hover {
    background: rgba(76, 141, 255, 0.06);
  }
</style>
