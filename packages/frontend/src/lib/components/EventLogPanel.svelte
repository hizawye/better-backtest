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
  }

  .header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .header h3 {
    margin: 0;
    font-size: 13px;
    color: var(--text-primary);
  }

  .body {
    flex: 1;
    overflow: auto;
  }

  .empty {
    color: var(--text-secondary);
    padding: 20px;
    font-size: 12px;
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
    border-bottom: 1px solid var(--border-color);
  }

  th {
    color: var(--text-secondary);
    position: sticky;
    top: 0;
    background: var(--bg-secondary);
  }
</style>
