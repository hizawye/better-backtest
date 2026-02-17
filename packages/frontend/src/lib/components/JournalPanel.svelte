<script lang="ts">
  import { tradingStore } from '../stores/trading';
  import type { JournalEntry } from '$shared/types';

  type JournalPrefill = {
    id: string;
    tradeId?: string;
    setupTags?: string[];
    confidence?: number;
    checklist?: string | string[];
    notes?: string;
    reviewStatus?: 'todo' | 'reviewed';
  };

  export let onSaveEntry: ((entry: JournalEntry, files: File[]) => void) | undefined;
  export let prefill: JournalPrefill | null = null;

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
  let lastPrefillId = '';

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

  $: if (prefill && prefill.id !== lastPrefillId) {
    selectedTradeId = prefill.tradeId ?? '';
    setupTags = prefill.setupTags ? prefill.setupTags.join(', ') : '';
    confidence = prefill.confidence ?? 3;
    if (Array.isArray(prefill.checklist)) {
      checklist = prefill.checklist.join('\n');
    } else {
      checklist = prefill.checklist ?? '';
    }
    notes = prefill.notes ?? '';
    reviewStatus = prefill.reviewStatus ?? 'todo';
    lastPrefillId = prefill.id;
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

  .content {
    flex: 1;
    overflow: auto;
    min-height: 0;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: #111923;
    padding: 8px;
  }

  label {
    font-size: 10px;
    color: var(--text-low);
    text-transform: uppercase;
    letter-spacing: 0.45px;
    font-weight: 600;
  }

  input,
  select,
  textarea {
    background: #0f1721;
    border: 1px solid var(--border-subtle);
    color: var(--text-hi);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 11px;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: rgba(76, 141, 255, 0.7);
    outline: 2px solid rgba(76, 141, 255, 0.25);
    outline-offset: 1px;
  }

  .btn-save {
    margin-top: 4px;
    padding: 10px;
    background: rgba(76, 141, 255, 0.22);
    border: 1px solid rgba(76, 141, 255, 0.62);
    color: #d9e7ff;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .entries {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .entry {
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 8px;
    font-size: 11px;
    background: #111923;
  }

  .entry-top {
    display: flex;
    justify-content: space-between;
    color: var(--text-low);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .badge {
    text-transform: uppercase;
    border: 1px solid rgba(71, 85, 105, 0.5);
    background: #1b2736;
    border-radius: 999px;
    padding: 2px 7px;
    color: var(--text-mid);
  }

  p {
    margin: 6px 0;
    color: var(--text-hi);
  }

  small {
    color: var(--text-mid);
  }
</style>
