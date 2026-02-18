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

  .content {
    flex: 1;
    overflow: auto;
    min-height: 0;
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-radius: 10px;
    background: var(--surface-1);
    padding: 9px;
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
    background: rgba(15, 25, 38, 0.92);
    border: none;
    box-shadow: inset 0 0 0 1px var(--line-soft);
    color: var(--text-hi);
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 12px;
  }

  input:focus,
  select:focus,
  textarea:focus {
    box-shadow: inset 0 0 0 1px rgba(112, 171, 255, 0.75), var(--focus-ring);
    outline: none;
  }

  .btn-save {
    margin-top: 2px;
    padding: 11px 12px;
    background: linear-gradient(140deg, rgba(67, 126, 199, 0.95), rgba(94, 154, 224, 0.95));
    color: #edf5ff;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    transition: filter var(--motion-fast), transform var(--motion-fast);
  }

  .btn-save:hover {
    filter: brightness(1.04);
  }

  .btn-save:active {
    transform: translateY(1px);
  }

  .entries {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .entry {
    border-radius: 10px;
    padding: 10px;
    font-size: 12px;
    background: var(--surface-1);
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
    background: rgba(66, 101, 141, 0.34);
    border-radius: 999px;
    padding: 3px 8px;
    color: var(--text-mid);
  }

  .entry p {
    margin: 7px 0 0;
    color: var(--text-mid);
    line-height: 1.45;
  }

  .entry small {
    display: block;
    margin-top: 8px;
    color: var(--text-low);
  }
</style>
