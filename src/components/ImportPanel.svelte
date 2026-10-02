<!-- ImportPanel.svelte - .fit/.gpx drag-and-drop import, plus an optional
     "sync from a connected device folder" shortcut for browsers that support
     it (see deviceSyncStore in lib/stores.svelte.ts). -->
<script lang="ts">
  import { touch } from '../lib/viewport.svelte';
  import { importStore, deviceSyncStore, backupStore } from '../lib/stores.svelte';
  import { formatRelativeTime } from '../lib/date-utils';
  import Icon from './Icon.svelte';
  import { IMPORT_GUIDES, stepParts } from '../lib/import-guides';

  let dragActive = $state(false);

  // Which device's export steps the "how to get files" guide shows.
  let guideId = $state(IMPORT_GUIDES[0]!.id);
  let guide = $derived(IMPORT_GUIDES.find((g) => g.id === guideId));
  let fileInput: HTMLInputElement | null = null;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    const files = Array.from(e.dataTransfer?.files || []);
    await processFiles(files);
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    processFiles(files);
    if (input) input.value = '';
  }

  // A .zip dropped here is either a Lapline backup, which is restored - the
  // path a returning user takes on a new browser or domain - or a zip of
  // workout files (e.g. Garmin's "Export Original"), whose .fit/.gpx files
  // are imported. Both go through the same import, so the progress below
  // covers them.
  let backupError = $state('');

  async function processFiles(files: File[]) {
    backupError = '';
    const backups = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
    const importable = files.filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.fit') || name.endsWith('.gpx');
    });
    if (importable.length === 0 && backups.length === 0) {
      alert('None of these can be imported. Choose .fit or .gpx workout files, or a .zip of them or a Lapline backup.');
      return;
    }
    for (const zip of backups) {
      try {
        await backupStore.restore(zip);
      } catch (e) {
        backupError = `${zip.name}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (importable.length > 0) await importStore.importFiles(importable);
  }

  let files = $derived(importStore.state.files);
  let total = $derived(files.length);
  let processedCount = $derived(files.filter((f) => f.status === 'done' || f.status === 'error').length);
  let remainingCount = $derived(total - processedCount);
  let currentFile = $derived(files.find((f) => f.status === 'processing'));
  let progressPercent = $derived(total > 0 ? (processedCount / total) * 100 : 0);
</script>

{#if deviceSyncStore.supported}
  <div class="card" style="max-width: 590px;">
    <div class="flex justify-between items-center">
      <span class="section-title">Sync from your watch</span>
      {#if deviceSyncStore.connected}
        <button class="btn btn-secondary btn-sm" onclick={() => deviceSyncStore.disconnect()}>Disconnect</button>
      {/if}
    </div>
    <p style="margin: var(--space-3) 0 var(--space-7); color: var(--ink-muted); font-size: var(--fs-md);">
      Grant access to the folder your watch exposes over USB (e.g. Garmin's <code>GARMIN/Activity</code>) once, then
      re-sync it any time without picking files by hand. Chrome/Edge only.
    </p>

    {#if !deviceSyncStore.connected}
      <button class="btn btn-primary" onclick={() => deviceSyncStore.connect()}>
        <Icon name="folder" size={16} /> Connect device folder
      </button>
    {:else}
      <div class="flex justify-between items-center">
        <span style="font-size: var(--fs-md); color: var(--ink-muted); display: flex; align-items: center; gap: var(--space-3);" title={deviceSyncStore.name ?? ''}>
          <Icon name="folder" size={14} />
          {deviceSyncStore.name}
          · {deviceSyncStore.lastSyncedAt ? `synced ${formatRelativeTime(deviceSyncStore.lastSyncedAt)}` : 'never synced'}
        </span>
        <button class="btn btn-secondary btn-sm" onclick={() => deviceSyncStore.sync()} disabled={deviceSyncStore.syncing}>
          {deviceSyncStore.syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {#if deviceSyncStore.lastFoundCount !== null}
        <p style="margin: var(--space-5) 0 0; font-size: var(--fs-base); color: var(--ink-muted);">
          {deviceSyncStore.lastFoundCount === 0
            ? 'Up to date — no new files found.'
            : `Found ${deviceSyncStore.lastFoundCount} new ${deviceSyncStore.lastFoundCount === 1 ? 'file' : 'files'}.`}
        </p>
      {/if}
    {/if}

    {#if deviceSyncStore.error}
      <p style="margin: var(--space-5) 0 0; font-size: var(--fs-base); color: var(--critical);">{deviceSyncStore.error}</p>
    {/if}
  </div>
{/if}

<div class="card {deviceSyncStore.supported ? 'mt-4' : ''}" style="max-width: 590px;">
  <span class="section-title">Import activities</span>

  <!-- Drag handlers are mouse-only convenience; the label below already gives
       full keyboard/click access to the same file picker. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dropzone mt-4"
    class:active={dragActive}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <input
      type="file"
      accept=".fit,.gpx,.zip"
      multiple
      bind:this={fileInput}
      onchange={handleFileSelect}
      class="sr-only"
      id="fit-import"
    />
    <label for="fit-import" style="cursor: pointer; display: block;">
      <div style="color: var(--ink-muted); margin-bottom: var(--space-6); display: flex; justify-content: center;">
        <Icon name="import" size={32} />
      </div>
      <p style="margin: 0 0 var(--space-2); font-size: var(--fs-lg); font-weight: var(--fw-semibold);">{touch.current ? 'Tap to choose .fit or .gpx files' : 'Drop .fit or .gpx files here or click to browse'}</p>
      <p style="margin: 0 0 var(--space-2); font-size: var(--fs-base); color: var(--ink-muted);">Moving from another browser? {touch.current ? 'Choose' : 'Drop'} your Lapline backup .zip here.</p>
      {#if backupError}<p style="margin: 0; font-size: var(--fs-base); color: var(--critical);">{backupError}</p>{/if}
      <p style="margin: 0; font-size: var(--fs-md); color: var(--ink-muted);">Pick several at once · .fit from most watches and bike computers, .gpx from other GPS apps</p>
    </label>
  </div>

  <details class="import-guide mt-4">
    <summary>Don't have .fit or .gpx files yet? How to get them from your device</summary>
    <div class="segmented sport-filter import-guide-devices" role="group" aria-label="Device">
      {#each IMPORT_GUIDES as g (g.id)}
        <button type="button" class:active={guideId === g.id} aria-pressed={guideId === g.id} onclick={() => (guideId = g.id)}>{g.name}</button>
      {/each}
    </div>
    {#if guide}
      <ol class="import-guide-list">
        {#each guide.steps as step, i (i)}
          <li>{#each stepParts(step) as part, j (j)}{#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}</li>
        {/each}
      </ol>
      {#if guide.note}
        <p class="import-guide-note">{#each stepParts(guide.note) as part, j (j)}{#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}</p>
      {/if}
    {/if}
    <p class="import-guide-note">Lapline reads .fit and .gpx files. Menu names can differ between app versions.</p>
  </details>

  {#if importStore.state.status === 'processing'}
    <div class="mt-4 card">
      <div class="flex justify-between items-center" style="font-size: var(--fs-md);">
        <span style="font-weight: var(--fw-semibold);" title={currentFile?.name}>
          {currentFile ? `Importing ${currentFile.name}…` : 'Preparing…'}
        </span>
        <span style="color: var(--ink-muted); font-variant-numeric: tabular-nums;">
          {processedCount} imported · {remainingCount} remaining
        </span>
      </div>
      <div class="meter-track mt-4" style="--meter-fill: var(--accent);">
        <div class="meter-fill" style="width: {progressPercent}%;"></div>
      </div>
    </div>
  {/if}

  {#if importStore.state.status === 'processing' || importStore.state.status === 'done'}
    <div class="mt-4 card" style="padding: var(--space-4) 0;">
      <div class="import-file-list">
        {#each importStore.state.files as f (f.name)}
          <div class="import-file-row" class:error={f.status === 'error'}>
            <span class="import-file-status">
              {#if f.status === 'pending'}
                <span class="status-dot"></span>
              {:else if f.status === 'processing'}
                <span class="spinner"></span>
              {:else if f.status === 'done'}
                <span style="color: var(--good-text);"><Icon name="check" size={16} /></span>
              {:else}
                <span style="color: var(--critical);"><Icon name="close" size={16} /></span>
              {/if}
            </span>
            <span class="import-file-name" title={f.name}>{f.name}</span>
            <span class="import-file-message" style="color: {f.status === 'error' ? 'var(--critical)' : 'var(--ink-muted)'};">
              {f.message ?? ''}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if importStore.state.status === 'done'}
    <div class="mt-4 card" style="border-color: color-mix(in srgb, {importStore.state.result?.errors.length ? 'var(--critical)' : 'var(--good)'} 35%, transparent);">
      <h4 style="margin: 0 0 var(--space-7); color: {importStore.state.result?.errors.length ? 'var(--critical)' : 'var(--good-text)'};">
        Import {importStore.state.result?.errors.length ? 'finished with errors' : 'complete'}
      </h4>
      <div class="grid grid-3" style="text-align: center;">
        <div>
          <div style="font-size: var(--fs-xl); font-weight: var(--fw-bold);">{importStore.state.result?.files}</div>
          <div class="stat-label" style="margin-top: var(--space-1);">Imported</div>
        </div>
        <div>
          <div style="font-size: var(--fs-xl); font-weight: var(--fw-bold);">{importStore.state.result?.imported}</div>
          <div class="stat-label" style="margin-top: var(--space-1);">Activities</div>
        </div>
        <div>
          <div style="font-size: var(--fs-xl); font-weight: var(--fw-bold); color: {importStore.state.result?.errors.length ? 'var(--critical)' : 'inherit'};">{importStore.state.result?.errors.length || 0}</div>
          <div class="stat-label" style="margin-top: var(--space-1);">Errors</div>
        </div>
      </div>
      {#if importStore.state.result?.errors.length}
        <p style="margin: var(--space-6) 0 0; font-size: var(--fs-md); color: var(--ink-muted);">Files marked ✕ weren't imported. The reason is next to each one.</p>
      {/if}

      <button class="btn btn-secondary mt-4" onclick={() => importStore.reset()}>Import more</button>
    </div>
  {/if}

  {#if importStore.state.status === 'error'}
    <div class="mt-4 card" style="border-color: color-mix(in srgb, var(--critical) 35%, transparent);">
      <h4 style="margin: 0 0 var(--space-6); color: var(--critical);">Import failed</h4>
      <p style="color: var(--critical); margin: 0;">{importStore.state.error}</p>
      <button class="btn btn-secondary mt-4" onclick={() => importStore.reset()}>Try again</button>
    </div>
  {/if}
</div>
