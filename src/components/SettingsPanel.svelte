<!-- SettingsPanel.svelte - search-first settings dialog, per
     design_handoff_settings/README.md's shell (search + category chips +
     per-row dirty-state anatomy), scoped to this app's own real settings
     only - the design's 31-setting schema is UI/interaction inspiration,
     not a list of settings to build (see bug-list.md's resolved item for
     the product decision). Stored FIT files and Reset all data are
     management actions, not preference rows, so they sit below the
     searchable list rather than inside it - there's no sensible "default"
     for either. -->
<script lang="ts">
  import { settingsStore, resetAllStores, fitFilesStore, activitiesStore, backupStore, TEXT_SIZE_OPTIONS, type TextSize, type BackupRestoreResult } from '../lib/stores.svelte';
  import { RANGE_PRESET_OPTIONS, rangePresetLabel, type RangePreset } from '../lib/range-preset';
  import { setAnalyticsEnabled } from '../lib/analytics';
  import type { Sex } from '../lib/today-kpis';
  import Icon from './Icon.svelte';
  import { themeStore } from '../lib/theme-store.svelte';
  import type { ThemePref } from '../lib/theme';
  import { mapTilesAvailable } from '../lib/map-tiles';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  const THEME_OPTIONS: [ThemePref, string][] = [
    ['dark', 'Dark'],
    ['light', 'Light'],
    ['auto', 'Auto']
  ];

  let unlinkedActivityCount = $derived(activitiesStore.all.filter((a) => a.sourceFileId === undefined).length);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ----- Backup: export / restore (lib/backup.ts) -----
  let backupMessage = $state<{ tone: 'good' | 'error' | 'muted'; text: string } | null>(null);
  let restoreResult = $state<BackupRestoreResult | null>(null);
  let restoreInput = $state<HTMLInputElement | null>(null);

  async function handleExport() {
    backupMessage = null;
    restoreResult = null;
    try {
      const out = await backupStore.exportAll();
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const skipped = out.unlinkedActivityCount > 0
        ? ` ${out.unlinkedActivityCount} older ${out.unlinkedActivityCount === 1 ? 'activity has' : 'activities have'} no stored file and ${out.unlinkedActivityCount === 1 ? "isn't" : "aren't"} included; re-import ${out.unlinkedActivityCount === 1 ? 'it' : 'them'} to fix that.`
        : '';
      backupMessage = { tone: out.unlinkedActivityCount > 0 ? 'muted' : 'good', text: `Saved ${out.filename}: ${out.fileCount} ${out.fileCount === 1 ? 'file' : 'files'} plus your settings.${skipped}` };
    } catch (e) {
      console.error(e);
      backupMessage = { tone: 'error', text: 'Export failed. Check your browser has free storage space, then try again.' };
    }
  }

  async function handleRestorePick(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    backupMessage = null;
    restoreResult = null;
    try {
      restoreResult = await backupStore.restore(file);
    } catch (err) {
      backupMessage = { tone: 'error', text: err instanceof Error ? err.message : String(err) };
    }
  }

  function handleReparse() {
    fitFilesStore.reparseAll();
  }

  // ----- Setting values -----

  let unitSystem = $state<'metric' | 'imperial'>('metric');
  async function setUnitSystem(system: 'metric' | 'imperial') {
    unitSystem = system;
    await settingsStore.save({ unit_system: system });
  }

  let defaultRangePreset = $state<RangePreset>('1y');
  async function setDefaultRangePreset(preset: RangePreset) {
    defaultRangePreset = preset;
    await settingsStore.save({ default_range_preset: preset });
  }

  let textSize = $state<TextSize>('default');
  async function setTextSize(size: TextSize) {
    textSize = size;
    await settingsStore.save({ text_size: size === 'default' ? '' : size });
  }

  let analyticsEnabled = $state(false);
  async function setAnalyticsPref(next: boolean) {
    analyticsEnabled = next;
    setAnalyticsEnabled(next);
    await settingsStore.save({ analytics_enabled: String(next) });
  }

  let mapTilesEnabled = $state(false);
  async function setMapTilesPref(next: boolean) {
    mapTilesEnabled = next;
    await settingsStore.save({ map_tiles_enabled: String(next) });
  }

  let locationLookupEnabled = $state(false);
  async function setLocationLookupPref(next: boolean) {
    locationLookupEnabled = next;
    await settingsStore.save({ location_lookup_enabled: String(next) });
  }

  let weatherLookupEnabled = $state(false);
  async function setWeatherLookupPref(next: boolean) {
    weatherLookupEnabled = next;
    await settingsStore.save({ weather_lookup_enabled: String(next) });
  }

  // Birth year and sex only pick the age/sex row of Today's VO2max rating
  // bands. Committed value (used for display/defaults) plus the live field
  // text, which can hold an invalid draft - saves happen on blur.
  let birthYear = $state('');
  let birthYearInput = $state<string | number>('');
  let birthYearError = $state('');
  const THIS_YEAR = new Date().getFullYear();

  async function commitBirthYear() {
    const raw = String(birthYearInput ?? '').trim();
    if (raw === '') {
      birthYearError = '';
      birthYear = '';
      await settingsStore.save({ birth_year: '' });
      return;
    }
    const v = parseInt(raw, 10);
    if (isNaN(v) || v < THIS_YEAR - 100 || v > THIS_YEAR - 10) {
      birthYearError = `Enter a year between ${THIS_YEAR - 100} and ${THIS_YEAR - 10}, or leave blank.`;
      return;
    }
    birthYearError = '';
    birthYear = String(v);
    birthYearInput = String(v);
    await settingsStore.save({ birth_year: String(v) });
  }

  let sex = $state<Sex | null>(null);
  async function setSex(next: Sex | null) {
    sex = next;
    await settingsStore.save({ sex: next ?? '' });
  }

  function handleNumberKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  $effect(() => {
    birthYear = settingsStore.all.birth_year || '';
    birthYearInput = birthYear;
    sex = settingsStore.getSex();
    unitSystem = settingsStore.getUnitSystem();
    defaultRangePreset = settingsStore.getDefaultRangePreset();
    textSize = settingsStore.getTextSize();
    analyticsEnabled = settingsStore.getAnalyticsEnabled();
    locationLookupEnabled = settingsStore.getLocationLookupEnabled();
    mapTilesEnabled = settingsStore.getMapTilesEnabled();
    weatherLookupEnabled = settingsStore.getWeatherLookupEnabled();
  });

  // ----- Searchable row schema -----

  type SectionId = 'display' | 'privacy' | 'training';
  const SECTIONS: { id: SectionId; label: string }[] = [
    { id: 'display', label: 'Units & display' },
    { id: 'privacy', label: 'Privacy & third parties' },
    { id: 'training', label: 'Training' }
  ];

  type RowId = 'units' | 'theme' | 'defaultRange' | 'textSize' | 'analytics' | 'locationLookup' | 'mapTiles' | 'weatherLookup' | 'birthYear' | 'sex';
  interface Row {
    id: RowId;
    section: SectionId;
    name: string;
    desc: string;
    valueLabel: string;
    defaultLabel: string;
    isDefault: boolean;
  }

  let allRows = $derived.by((): Row[] => [
    {
      id: 'units',
      section: 'display',
      name: 'Measurement units',
      desc: "Distance, pace, speed, elevation and temperature across the whole app.",
      valueLabel: unitSystem === 'metric' ? 'Metric' : 'Imperial',
      defaultLabel: 'Metric',
      isDefault: unitSystem === 'metric'
    },
    {
      id: 'theme',
      section: 'display',
      name: 'Theme',
      desc: "Dark, light, or Auto to match your device. The sun/moon button next to Sync switches it too.",
      valueLabel: THEME_OPTIONS.find(([t]) => t === themeStore.pref)![1],
      defaultLabel: 'Dark',
      isDefault: themeStore.pref === 'dark'
    },
    {
      id: 'defaultRange',
      section: 'display',
      name: 'Default time range',
      desc: "The range Today always shows, and the one Trends opens to.",
      valueLabel: rangePresetLabel(defaultRangePreset),
      defaultLabel: rangePresetLabel('1y'),
      isDefault: defaultRangePreset === '1y'
    },
    {
      id: 'textSize',
      section: 'display',
      name: 'Text size',
      desc: 'Scales every label, number and chart axis across the app together.',
      valueLabel: TEXT_SIZE_OPTIONS.find(([s]) => s === textSize)![1],
      defaultLabel: 'M',
      isDefault: textSize === 'default'
    },
    {
      id: 'analytics',
      section: 'privacy',
      name: 'Analytics',
      desc: 'Off unless you turn it on. Sends anonymous screen views and feature usage to SimpleAnalytics to help improve the app - never your activity data.',
      valueLabel: analyticsEnabled ? 'On' : 'Off',
      defaultLabel: 'Off',
      isDefault: !analyticsEnabled
    },
    {
      id: 'locationLookup',
      section: 'privacy',
      name: 'Location lookup',
      desc: "Sends an activity's GPS start coordinate to OpenStreetMap's Nominatim to show a real place name.",
      valueLabel: locationLookupEnabled ? 'On' : 'Off',
      defaultLabel: 'Off',
      isDefault: !locationLookupEnabled
    },
    {
      id: 'mapTiles',
      section: 'privacy',
      name: 'Map backgrounds',
      desc: "Shows streets under an activity's route. Loads map images of that area from CARTO (map data from OpenStreetMap).",
      valueLabel: mapTilesEnabled ? 'On' : 'Off',
      defaultLabel: 'Off',
      isDefault: !mapTilesEnabled
    },
    {
      id: 'weatherLookup',
      section: 'privacy',
      name: 'Weather lookup',
      desc: "Sends an activity's date and GPS start coordinate to Open-Meteo for a weather condition word.",
      valueLabel: weatherLookupEnabled ? 'On' : 'Off',
      defaultLabel: 'Off',
      isDefault: !weatherLookupEnabled
    },
    {
      id: 'birthYear',
      section: 'training',
      name: 'Birth year',
      desc: "With sex below, picks the age group Today's VO₂ max rating (poor to superior) is judged against. Stays on this device.",
      valueLabel: birthYear || 'Not set',
      defaultLabel: 'Not set',
      isDefault: birthYear === ''
    },
    {
      id: 'sex',
      section: 'training',
      name: 'Sex',
      desc: "With birth year above, picks the norms Today's VO₂ max rating is judged against. Stays on this device.",
      valueLabel: sex === 'female' ? 'Female' : sex === 'male' ? 'Male' : 'Not set',
      defaultLabel: 'Not set',
      isDefault: sex === null
    }
  ]);
  // Map backgrounds only exist when the build has a tile key.
  let rows = $derived(allRows.filter((r) => r.id !== 'mapTiles' || mapTilesAvailable));

  let query = $state('');
  let category = $state<'all' | SectionId>('all');

  // Match rule: case-insensitive substring over name + description + current
  // value + key, deliberately including the value - typing "on" or "metric"
  // finds settings currently set that way (design_handoff_settings §2).
  function matchesQuery(row: Row, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return `${row.name} ${row.desc} ${row.valueLabel} ${row.id}`.toLowerCase().includes(needle);
  }

  let queryMatchedRows = $derived(rows.filter((r) => matchesQuery(r, query)));
  let visibleRows = $derived(category === 'all' ? queryMatchedRows : queryMatchedRows.filter((r) => r.section === category));
  let resultLabel = $derived(query ? `${queryMatchedRows.length} of ${rows.length}` : `${rows.length} settings`);
  let dirtyCount = $derived(rows.filter((r) => !r.isDefault).length);

  function chipCount(id: SectionId): number {
    return queryMatchedRows.filter((r) => r.section === id).length;
  }

  async function resetRow(id: RowId) {
    switch (id) {
      case 'units':
        await setUnitSystem('metric');
        break;
      case 'defaultRange':
        await setDefaultRangePreset('1y');
        break;
      case 'theme':
        themeStore.reset();
        break;
      case 'textSize':
        await setTextSize('default');
        break;
      case 'analytics':
        await setAnalyticsPref(false);
        break;
      case 'locationLookup':
        await setLocationLookupPref(false);
        break;
      case 'mapTiles':
        await setMapTilesPref(false);
        break;
      case 'weatherLookup':
        await setWeatherLookupPref(false);
        break;
      case 'birthYear':
        birthYearInput = '';
        birthYearError = '';
        await commitBirthYear();
        break;
      case 'sex':
        await setSex(null);
        break;
    }
  }

  // ----- Reset all settings (distinct from "Reset all data" below - this
  // only restores the preferences above to their defaults, nothing is
  // deleted) -----

  let showResetSettingsConfirm = $state(false);

  async function confirmResetSettings() {
    for (const row of rows) {
      if (!row.isDefault) await resetRow(row.id);
    }
    showResetSettingsConfirm = false;
  }

  // ----- Reset all data (destructive, unchanged) -----

  let showResetConfirm = $state(false);
  let resetConfirmText = $state('');
  let resetting = $state(false);
  let resetDone = $state(false);

  let resetConfirmInputEl = $state<HTMLInputElement | null>(null);

  function openResetConfirm() {
    resetConfirmText = '';
    showResetConfirm = true;
  }

  $effect(() => {
    if (showResetConfirm) resetConfirmInputEl?.focus();
  });

  function cancelReset() {
    showResetConfirm = false;
    resetConfirmText = '';
  }

  async function confirmReset() {
    resetting = true;
    try {
      await resetAllStores();
      themeStore.reset();
      showResetConfirm = false;
      resetDone = true;
      setTimeout(() => (resetDone = false), 3000);
    } finally {
      resetting = false;
    }
  }

  // ----- Search field autofocus + keyboard behaviour -----

  let searchInputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    searchInputEl?.focus();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (showResetConfirm) return cancelReset();
    if (showResetSettingsConfirm) return (showResetSettingsConfirm = false);
    if (query) return (query = '');
    onClose?.();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="settings-header">
  <div class="settings-header-top">
    <span class="kicker">Settings</span>
    {#if dirtyCount > 0}<span class="settings-changed-count">{dirtyCount} changed</span>{/if}
    <div class="settings-header-actions">
      <!-- btn-ghost: same chrome as the .icon-btn beside it, so the two header
           actions read as one pair. -->
      <button class="btn btn-ghost btn-sm" onclick={() => (showResetSettingsConfirm = true)} disabled={dirtyCount === 0}>Reset settings</button>
      <button class="icon-btn" onclick={() => onClose?.()} aria-label="Close"><Icon name="close" size={14} /></button>
    </div>
  </div>
  <div class="settings-search">
    <Icon name="search" size={13} />
    <input bind:this={searchInputEl} bind:value={query} type="text" placeholder="Search settings" aria-label="Search settings" />
    <span class="settings-result-count mono">{resultLabel}</span>
    <button class="settings-clear" onclick={() => (query = '')} disabled={!query}>Clear</button>
  </div>
  <div class="settings-chips">
    <button class:active={category === 'all'} onclick={() => (category = 'all')}>All <span class="mono">{queryMatchedRows.length}</span></button>
    {#each SECTIONS as s (s.id)}
      <button class:active={category === s.id} onclick={() => (category = s.id)}>{s.label} <span class="mono">{chipCount(s.id)}</span></button>
    {/each}
  </div>
</div>

<div class="settings-body">
  {#if visibleRows.length === 0}
    <div class="settings-empty">
      <p>No match for "{query}".</p>
      <p style="color: var(--ink-muted); font-size: var(--fs-base);">Search matches setting names, descriptions and current values.</p>
      <button class="btn btn-secondary btn-sm mt-4" onclick={() => (query = '')}>Clear search</button>
    </div>
  {:else}
    {#each SECTIONS as s (s.id)}
      {@const sectionRows = visibleRows.filter((r) => r.section === s.id)}
      {#if sectionRows.length > 0}
        <div class="settings-section">
          <span class="settings-section-label">{s.label}</span>
          {#each sectionRows as row (row.id)}
            <div class="settings-row" class:dirty={!row.isDefault}>
              <div class="settings-row-flag"></div>
              <div class="settings-row-text">
                <div class="settings-row-name">
                  {row.name}
                  {#if !row.isDefault}<span class="settings-row-badge">changed</span>{/if}
                </div>
                <div class="settings-row-desc">{row.desc}</div>
                {#if !row.isDefault}<div class="settings-row-default mono">default {row.defaultLabel}</div>{/if}
              </div>
              <div class="settings-row-control">
                {#if row.id === 'units'}
                  <div class="segmented">
                    <button class:active={unitSystem === 'metric'} onclick={() => setUnitSystem('metric')}>Metric</button>
                    <button class:active={unitSystem === 'imperial'} onclick={() => setUnitSystem('imperial')}>Imperial</button>
                  </div>
                {:else if row.id === 'defaultRange'}
                  <div class="segmented">
                    {#each RANGE_PRESET_OPTIONS as p (p)}
                      <button class:active={defaultRangePreset === p} onclick={() => setDefaultRangePreset(p)}>{rangePresetLabel(p)}</button>
                    {/each}
                  </div>
                {:else if row.id === 'theme'}
                  <div class="segmented">
                    {#each THEME_OPTIONS as [t, label] (t)}
                      <button class:active={themeStore.pref === t} onclick={() => themeStore.set(t)}>{label}</button>
                    {/each}
                  </div>
                {:else if row.id === 'textSize'}
                  <div class="segmented">
                    {#each TEXT_SIZE_OPTIONS as [s, label] (s)}
                      <button class:active={textSize === s} onclick={() => setTextSize(s)}>{label}</button>
                    {/each}
                  </div>
                {:else if row.id === 'analytics'}
                  <div class="segmented">
                    <button class:active={!analyticsEnabled} onclick={() => setAnalyticsPref(false)}>Off</button>
                    <button class:active={analyticsEnabled} onclick={() => setAnalyticsPref(true)}>On</button>
                  </div>
                {:else if row.id === 'locationLookup'}
                  <div class="segmented">
                    <button class:active={!locationLookupEnabled} onclick={() => setLocationLookupPref(false)}>Off</button>
                    <button class:active={locationLookupEnabled} onclick={() => setLocationLookupPref(true)}>On</button>
                  </div>
                {:else if row.id === 'mapTiles'}
                  <div class="segmented">
                    <button class:active={!mapTilesEnabled} onclick={() => setMapTilesPref(false)}>Off</button>
                    <button class:active={mapTilesEnabled} onclick={() => setMapTilesPref(true)}>On</button>
                  </div>
                {:else if row.id === 'weatherLookup'}
                  <div class="segmented">
                    <button class:active={!weatherLookupEnabled} onclick={() => setWeatherLookupPref(false)}>Off</button>
                    <button class:active={weatherLookupEnabled} onclick={() => setWeatherLookupPref(true)}>On</button>
                  </div>
                {:else if row.id === 'birthYear'}
                  <div class="settings-number">
                    <input
                      type="number"
                      min={THIS_YEAR - 100}
                      max={THIS_YEAR - 10}
                      bind:value={birthYearInput}
                      onblur={commitBirthYear}
                      onkeydown={handleNumberKeydown}
                      placeholder="—"
                      aria-label="Birth year"
                      aria-invalid={birthYearError ? 'true' : undefined}
                    />
                  </div>
                {:else if row.id === 'sex'}
                  <div class="segmented">
                    <button class:active={sex === null} onclick={() => setSex(null)}>Not set</button>
                    <button class:active={sex === 'female'} onclick={() => setSex('female')}>Female</button>
                    <button class:active={sex === 'male'} onclick={() => setSex('male')}>Male</button>
                  </div>
                {/if}
              </div>
              <button class="settings-row-reset" style="opacity: {row.isDefault ? 0.18 : 1};" onclick={() => resetRow(row.id)} aria-label="Reset {row.name} to default" title="Reset to default">
                <Icon name="undo" size={13} />
              </button>
            </div>
            {#if row.id === 'birthYear' && birthYearError}
              <p class="settings-row-error">{birthYearError}</p>
            {/if}
          {/each}
        </div>
      {/if}
    {/each}
  {/if}

  <div class="settings-section">
    <span class="settings-section-label">Data management</span>

    <div class="card mt-4">
      <span class="section-title">Backup</span>
      <p style="margin: var(--space-3) 0 var(--space-7); color: var(--ink-secondary); font-size: var(--fs-md);">
        Your data lives only in this browser. Export saves every imported file and your settings to one .zip on your
        computer. Restore it here, or in any other browser, to get everything back.
      </p>
      <div class="flex items-center" style="gap: var(--space-4); flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" onclick={handleExport} disabled={backupStore.busy !== 'idle' || fitFilesStore.count === 0}>
          {backupStore.busy === 'exporting' ? 'Exporting…' : 'Export all data'}
        </button>
        <button class="btn btn-secondary btn-sm" onclick={() => restoreInput?.click()} disabled={backupStore.busy !== 'idle'}>
          {backupStore.busy === 'restoring' ? 'Restoring…' : 'Restore from backup'}
        </button>
        <input type="file" accept=".zip,application/zip" class="sr-only" bind:this={restoreInput} onchange={handleRestorePick} id="backup-restore-input" aria-label="Choose a Lapline backup .zip" />
      </div>
      {#if backupMessage}
        <p style="margin: var(--space-5) 0 0; font-size: var(--fs-md); color: {backupMessage.tone === 'error' ? 'var(--critical)' : backupMessage.tone === 'good' ? 'var(--good-text)' : 'var(--ink-muted)'};">{backupMessage.text}</p>
      {/if}
      {#if restoreResult}
        <p style="margin: var(--space-5) 0 0; font-size: var(--fs-md); color: {restoreResult.errors.length || restoreResult.missing.length ? 'var(--caution)' : 'var(--good-text)'};">
          Restored {restoreResult.activitiesImported} {restoreResult.activitiesImported === 1 ? 'activity' : 'activities'} from
          {restoreResult.filesInBackup} {restoreResult.filesInBackup === 1 ? 'file' : 'files'}{restoreResult.settingsRestored ? `, plus ${restoreResult.settingsRestored} ${restoreResult.settingsRestored === 1 ? 'setting' : 'settings'}` : ''}.
          {#if restoreResult.missing.length}{restoreResult.missing.length} {restoreResult.missing.length === 1 ? 'file was' : 'files were'} missing from the backup.{/if}
        </p>
        {#each restoreResult.errors as err}
          <p style="margin: var(--space-2) 0 0; font-size: var(--fs-base); color: var(--critical);">{err}</p>
        {/each}
      {/if}
    </div>

    <div class="card mt-4">
      <span class="section-title">Stored activity files</span>
      <p style="margin: var(--space-3) 0 var(--space-7); color: var(--ink-secondary); font-size: var(--fs-md);">
        Lapline keeps a copy of every file you import. When we improve how files are read, apply the fix to your
        whole history here. No need to import anything again.
      </p>
      <div class="flex justify-between items-center" style="font-size: var(--fs-md); color: var(--ink-muted);">
        <span>{fitFilesStore.count} {fitFilesStore.count === 1 ? 'file' : 'files'} stored · {formatBytes(fitFilesStore.totalBytes)}</span>
        <button class="btn btn-secondary btn-sm" onclick={handleReparse} disabled={fitFilesStore.reparsing || fitFilesStore.count === 0}>
          {fitFilesStore.reparsing ? `Re-reading ${fitFilesStore.reparseProgress?.done ?? 0}/${fitFilesStore.reparseProgress?.total ?? fitFilesStore.count}…` : 'Re-read all files'}
        </button>
      </div>
      {#if unlinkedActivityCount > 0}
        <p style="margin: var(--space-5) 0 0; font-size: var(--fs-base); color: var(--ink-muted);">
          {unlinkedActivityCount} {unlinkedActivityCount === 1 ? 'activity was' : 'activities were'} imported before this
          feature existed and {unlinkedActivityCount === 1 ? "isn't" : "aren't"} covered — import
          {unlinkedActivityCount === 1 ? 'it' : 'them'} once to enable this for {unlinkedActivityCount === 1 ? 'it' : 'them'}.
        </p>
      {/if}
      {#if fitFilesStore.reparseResult}
        <p style="margin: var(--space-5) 0 0; font-size: var(--fs-md); color: {fitFilesStore.reparseResult.errors.length ? 'var(--critical)' : 'var(--good-text)'};">
          Re-read {fitFilesStore.reparseResult.filesReparsed} {fitFilesStore.reparseResult.filesReparsed === 1 ? 'file' : 'files'},
          updated {fitFilesStore.reparseResult.activitiesUpdated} {fitFilesStore.reparseResult.activitiesUpdated === 1 ? 'activity' : 'activities'}{fitFilesStore.reparseResult.errors.length ? ` · ${fitFilesStore.reparseResult.errors.length} failed` : ''}.
        </p>
        {#each fitFilesStore.reparseResult.errors as err}
          <p style="margin: var(--space-2) 0 0; font-size: var(--fs-base); color: var(--critical);">{err}</p>
        {/each}
      {/if}
    </div>

    <div class="card mt-4" style="border-color: color-mix(in srgb, var(--critical) 30%, transparent);">
      <span class="section-title" style="color: var(--critical);">Danger zone</span>
      <p style="margin: var(--space-3) 0 var(--space-7); color: var(--ink-secondary); font-size: var(--fs-md);">
        Permanently delete every activity, imported file and setting in this browser. There's no undo, so export a backup first if you might want them back.
      </p>
      <div class="flex justify-between items-center">
        <span style="font-size: var(--fs-md); color: var(--good-text); font-weight: var(--fw-semibold); visibility: {resetDone ? 'visible' : 'hidden'};">Data cleared</span>
        <button class="btn btn-danger btn-sm" onclick={openResetConfirm}>
          <Icon name="trash" size={14} /> Reset all data
        </button>
      </div>
    </div>
  </div>
</div>

<div class="settings-footer">
  <span class="mono" style="font-size: var(--fs-xs); color: var(--ink-muted);">Changes save instantly.</span>
</div>

{#if showResetSettingsConfirm}
  <div class="modal-overlay" onclick={() => (showResetSettingsConfirm = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" style="max-width: 420px;" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reset-settings-title" tabindex="-1">
      <h3 id="reset-settings-title" style="margin: 0 0 var(--space-4);">Reset settings?</h3>
      <p style="margin: 0 0 var(--space-7); color: var(--ink-secondary); font-size: var(--fs-lg);">
        This restores the {dirtyCount} changed {dirtyCount === 1 ? 'setting' : 'settings'} above to their defaults. Your
        activities and files stay.
      </p>
      <div class="flex justify-between mt-4">
        <button type="button" class="btn btn-secondary" onclick={() => (showResetSettingsConfirm = false)}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={confirmResetSettings}>Reset settings</button>
      </div>
    </div>
  </div>
{/if}

{#if showResetConfirm}
  <div class="modal-overlay" onclick={cancelReset} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" style="max-width: 504px;" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reset-title" tabindex="-1">
      <h3 id="reset-title" style="margin: 0 0 var(--space-4); color: var(--critical);">Reset all data?</h3>
      <p style="margin: 0 0 var(--space-7); color: var(--ink-secondary); font-size: var(--fs-lg);">
        This permanently deletes every activity, imported file and setting in this browser. There's no undo, so export a backup first if you might want them back.
      </p>
      <label for="reset-confirm-input">Type <strong>RESET</strong> to confirm</label>
      <input
        id="reset-confirm-input"
        type="text"
        bind:value={resetConfirmText}
        bind:this={resetConfirmInputEl}
        autocomplete="off"
        placeholder="RESET"
        onkeydown={(e) => e.key === 'Enter' && resetConfirmText === 'RESET' && !resetting && confirmReset()}
      />
      <div class="flex justify-between mt-4">
        <button type="button" class="btn btn-secondary" onclick={cancelReset}>Cancel</button>
        <button
          type="button"
          class="btn btn-danger"
          disabled={resetConfirmText !== 'RESET' || resetting}
          style={resetConfirmText !== 'RESET' ? 'opacity: 0.5; cursor: not-allowed;' : ''}
          onclick={confirmReset}
        >
          {resetting ? 'Resetting…' : 'Delete everything'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-header {
    flex: none;
    padding: var(--space-7) var(--space-8) 0;
    border-bottom: 1px solid var(--line-panel);
  }
  .settings-header-top {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    margin-bottom: var(--space-6);
  }
  .settings-changed-count {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--accent);
  }
  .settings-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-left: auto;
  }
  .settings-search {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 36px;
    padding: 0 var(--space-5);
    background: var(--bg-well);
    border: 1px solid var(--line-panel);
    border-radius: var(--radius);
    color: var(--ink-5);
  }
  .settings-search:focus-within {
    border-color: var(--accent);
  }
  .settings-search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    font-size: var(--fs-md);
    color: var(--ink-1);
  }
  .settings-search input:focus {
    outline: none;
    box-shadow: none;
  }
  .settings-result-count {
    font-size: var(--fs-xs);
    color: var(--ink-6);
    white-space: nowrap;
  }
  .settings-clear {
    font-size: var(--fs-xs);
    color: var(--ink-4);
    white-space: nowrap;
  }
  .settings-clear:disabled {
    color: var(--ink-7);
    cursor: default;
  }
  .settings-chips {
    display: flex;
    gap: var(--space-3);
    overflow-x: auto;
    padding: var(--space-5) 0 var(--space-6);
  }
  .settings-chips button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
    padding: var(--space-3) var(--space-5);
    border-radius: 12px;
    border: 1px solid var(--line-panel);
    font-size: var(--fs-sm);
    color: var(--ink-3);
    background: transparent;
  }
  .settings-chips button .mono {
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .settings-chips button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .settings-chips button.active .mono {
    color: color-mix(in srgb, var(--on-accent) 60%, transparent);
  }

  .settings-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-2) var(--space-8) var(--space-8);
  }
  .settings-empty {
    text-align: center;
    padding: var(--space-10) var(--space-6);
    color: var(--ink-3);
  }

  .settings-section {
    margin-top: var(--space-7);
  }
  .settings-section-label {
    display: block;
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-5);
    margin-bottom: var(--space-2);
  }

  .settings-row {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-3) var(--space-6) var(--space-5);
    border-bottom: 1px solid var(--line-row);
    flex-wrap: wrap;
    position: relative;
  }
  .settings-row:hover {
    background: var(--bg-row-hover);
  }
  .settings-row.dirty {
    background: color-mix(in srgb, var(--bg-panel) 60%, var(--accent) 6%);
  }
  .settings-row-flag {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
  }
  .settings-row.dirty .settings-row-flag {
    background: var(--accent);
  }
  .settings-row-text {
    flex: 1 1 260px;
    min-width: 160px;
  }
  .settings-row-name {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--fs-base);
    color: var(--ink-1);
    font-weight: var(--fw-medium);
  }
  .settings-row-badge {
    font-family: var(--font-mono);
    font-weight: var(--fw-semibold);
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--accent);
  }
  .settings-row-desc {
    margin-top: var(--space-2);
    font-size: var(--fs-base);
    color: var(--ink-4);
    max-width: 58ch;
  }
  .settings-row-default {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--ink-6);
  }
  .settings-row-control {
    flex: none;
    margin-left: auto;
  }
  .settings-row-reset {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: var(--ink-4);
    border-radius: 50%;
  }
  .settings-row-reset:hover {
    background: var(--bg-well);
    color: var(--ink-2);
  }
  .settings-row-error {
    margin: -6px 0 var(--space-3) var(--space-5);
    font-size: var(--fs-sm);
    color: var(--critical);
  }
  .settings-number {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .settings-number input {
    width: 70px;
    height: 28px;
    text-align: center;
  }

  .settings-footer {
    flex: none;
    padding: var(--space-5) var(--space-8);
    border-top: 1px solid var(--line-panel);
    text-align: center;
  }

  /* Phone: the dialog is a full-screen sheet (global.css), so the header
     and footer pad themselves clear of the notch and home indicator, and
     the side padding drops to the rest of the app's phone gutter. */
  @media (max-width: 720px) {
    .settings-header {
      padding: calc(var(--space-7) + env(safe-area-inset-top)) calc(var(--space-7) + env(safe-area-inset-right)) 0
        calc(var(--space-7) + env(safe-area-inset-left));
    }
    .settings-body {
      padding: var(--space-2) calc(var(--space-7) + env(safe-area-inset-right)) var(--space-8)
        calc(var(--space-7) + env(safe-area-inset-left));
    }
    .settings-footer {
      padding-bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
    }
    .settings-search input {
      font-size: 16px;
    }
  }
</style>
