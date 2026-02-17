<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import type { JournalEntry } from '$shared/types';

  export let onSaveEntry: ((entry: JournalEntry, files: File[]) => void) | undefined;

  $: trades = $tradingStore.trades;
  $: entries = $tradingStore.journalEntries;
  $: sessionId = $tradingStore.sessionId;

  let selectedTradeId = '';
  let setupTags = '';
  let confidence = 3;
  let checklist = '';
  let notes = '';
  let reviewStatus: 'todo' | 'reviewed' = 'todo';
  let selectedFiles: File[] = [];

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    selectedFiles = target.files ? Array.from(target.files) : [];
  }

  function save() {
    if (!sessionId) return;
    const timestamp = Date.now();
    const entry: JournalEntry = {
      id: `journal_${sessionId}_${timestamp}`,
      sessionId,
      tradeId: selectedTradeId || undefined,
      timestamp,
      setupTags: setupTags.split(',').map((value) => value.trim()).filter(Boolean),
      confidence,
      checklist: checklist.split('\n').map((value) => value.trim()).filter(Boolean),
      notes,
      reviewStatus
    };
    onSaveEntry?.(entry, selectedFiles);
    setupTags = '';
    confidence = 3;
    checklist = '';
    notes = '';
    reviewStatus = 'todo';
    selectedFiles = [];
    selectedTradeId = '';
  }
</script>

<div class="journal-panel">
  <div class="header">
    <h3>Journal ({entries.length})</h3>
  </div>

  <div class="content">
    <div class="form-row">
      <label for="journal-trade">Trade</label>
      <select id="journal-trade" bind:value={selectedTradeId}>
        <option value="">General session note</option>
        {#each trades.slice().reverse() as trade}
          <option value={trade.id}>
            {trade.side.toUpperCase()} {trade.size} @ {trade.entryPrice.toFixed(2)}
          </option>
        {/each}
      </select>
    </div>

    <div class="form-row">
      <label for="journal-tags">Setup Tags</label>
      <input id="journal-tags" type="text" bind:value={setupTags} placeholder="breakout, ny-open" />
    </div>

    <div class="form-row">
      <label for="journal-confidence">Confidence</label>
      <input id="journal-confidence" type="number" min="1" max="5" bind:value={confidence} />
    </div>

    <div class="form-row">
      <label for="journal-checklist">Checklist (one rule per line)</label>
      <textarea id="journal-checklist" rows="3" bind:value={checklist}></textarea>
    </div>

    <div class="form-row">
      <label for="journal-notes">Notes</label>
      <textarea id="journal-notes" rows="3" bind:value={notes}></textarea>
    </div>

    <div class="form-row">
      <label for="journal-review">Review Status</label>
      <select id="journal-review" bind:value={reviewStatus}>
        <option value="todo">To Review</option>
        <option value="reviewed">Reviewed</option>
      </select>
    </div>

    <div class="form-row">
      <label for="journal-files">Screenshots</label>
      <input id="journal-files" type="file" accept="image/*" multiple on:change={handleFileChange} />
    </div>

    <button class="btn-save" on:click={save}>Save Journal Entry</button>

    <div class="entries">
      {#each entries.slice().reverse() as entry}
        <div class="entry">
          <div class="entry-top">
            <span>{new Date(entry.timestamp).toLocaleString()}</span>
            <span class="badge">{entry.reviewStatus}</span>
          </div>
          <p>{entry.notes}</p>
          {#if entry.setupTags.length > 0}
            <small>Tags: {entry.setupTags.join(', ')}</small>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .journal-panel {
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

  .content {
    flex: 1;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 11px;
    color: var(--text-secondary);
  }

  input,
  select,
  textarea {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 12px;
  }

  .btn-save {
    margin-top: 4px;
    padding: 8px;
    background: var(--accent-color);
    color: white;
    border-radius: 4px;
    font-size: 12px;
  }

  .entries {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .entry {
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 8px;
    font-size: 12px;
  }

  .entry-top {
    display: flex;
    justify-content: space-between;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .badge {
    text-transform: uppercase;
  }

  p {
    margin: 6px 0;
  }
</style>
