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
    background: var(--surface-0);
    border-radius: var(--radius-md);
  }

  .header {
    padding: 12px 14px 8px;
  }

  .header h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-hi);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .body {
    flex: 1;
    overflow: auto;
    min-height: 0;
    padding: 0 10px 12px;
  }

  .empty {
    color: var(--text-low);
    padding: 24px 10px;
    font-size: 12px;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 6px;
  }

  th,
  td {
    padding: 8px 10px;
    font-size: 12px;
    text-align: left;
    border: none;
    background: var(--surface-1);
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--text-hi);
  }

  th {
    color: var(--text-low);
    position: sticky;
    top: 0;
    background: linear-gradient(180deg, rgba(13, 21, 31, 0.96), rgba(13, 21, 31, 0.86));
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.45px;
    z-index: 1;
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

  tbody tr:hover {
    filter: brightness(1.06);
  }
</style>
