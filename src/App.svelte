<!-- App.svelte - Root shell: fixed sidebar (a bottom tab bar on phones) +
     sticky header + one of the dashboard screens. Settings/Import are modals opened from the header,
     not screens of their own (see design_handoff_sports_dashboard/README.md). -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { themeStore } from './lib/theme-store.svelte';
  import { dialogFocus } from './lib/dialog-focus';
  import { logoTickSvg, initLogoLaps, WORDMARK_HTML } from './lib/logo';
  import Icon from './components/Icon.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import ImportPanel from './components/ImportPanel.svelte';
  import AboutPanel from './components/AboutPanel.svelte';
  import TermsPanel from './components/TermsPanel.svelte';
  import PrivacyPanel from './components/PrivacyPanel.svelte';
  import WelcomeModal from './components/WelcomeModal.svelte';
  import ReleaseNotesPanel from './components/ReleaseNotesPanel.svelte';
  import TodayScreen from './components/screens/TodayScreen.svelte';
  import ActivityScreen from './components/screens/ActivityScreen.svelte';
  import CalendarScreen from './components/screens/CalendarScreen.svelte';
  import TrendsScreen from './components/screens/TrendsScreen.svelte';
  import RecordsScreen from './components/screens/RecordsScreen.svelte';
  import RangeFilter from './components/RangeFilter.svelte';
  import { activitiesStore, fitFilesStore, importStore } from './lib/stores.svelte';
  import { formatSport } from './lib/sport-color';
  import { formatDateRangeShort, formatRelativeTime, todayStr, addDays, daysBetween } from './lib/date-utils';
  import { settingsStore } from './lib/stores.svelte';
  import { TODAY_LEDGER_SIZE } from './lib/today-ledger';
  import { rangePresetLabel, type RangePreset } from './lib/range-preset';
  import type { Screen } from './lib/types';
  import { setAnalyticsEnabled, trackPageview, trackEvent } from './lib/analytics';
  import { fetchSampleFiles, countSampleActivities, removeSampleData } from './lib/sample-data';
  import { installHint, currentInstallEnv } from './lib/install-hint';
  import { dbStatus } from './lib/db-status.svelte';

  // 'all' has no fixed day count - it resolves against historyMinDate below,
  // so it's excluded from PRESET_DAYS and handled as its own case wherever
  // the range is resolved. 'custom' extends the shared RangePreset type with
  // this page's own drag-a-slider mode, which isn't a "preset" a Settings
  // default could meaningfully point at.
  type Preset = RangePreset | 'custom';
  const PRESET_DAYS: Record<Exclude<RangePreset, 'all'>, number> = { '7d': 7, '4w': 28, '12w': 84, '1y': 365 };

  const RANGE_SUBLINE: Record<RangePreset, string> = {
    '7d': 'Last 7 days',
    '4w': 'Last 4 weeks',
    '12w': 'Last 12 weeks',
    '1y': 'Last year',
    all: 'All time'
  };

  function presetLabel(p: Preset): string {
    return p === 'custom' ? 'Custom' : rangePresetLabel(p);
  }

  let initialized = $state(false);
  let screen = $state<Screen>('today');
  let activeActivityId = $state<number | null>(null);
  let showSettings = $state(false);
  let showImport = $state(false);
  let showAbout = $state(false);
  let showTerms = $state(false);
  let showPrivacy = $state(false);
  let showReleaseNotes = $state(false);
  // Shown once, on a browser that has never imported anything and hasn't
  // dismissed this before - checked at mount time only (not reactively),
  // so it never reappears mid-session just because the user deletes their
  // only activity.
  let showWelcome = $state(activitiesStore.all.length === 0 && !settingsStore.getHasSeenWelcome());
  let highlightImport = $state(false);

  function dismissWelcome() {
    showWelcome = false;
    settingsStore.save({ has_seen_welcome: 'true' });
  }

  function welcomeImportNow() {
    dismissWelcome();
    showImport = true;
  }

  // Closing the modal after a finished import (done/error) clears its
  // result/file-list state, so reopening later starts from the empty
  // drop-zone instead of showing a stale summary from the last time it was
  // open - left alone while an import is still 'processing' so closing
  // mid-import doesn't discard visible progress of work still running in
  // the background.
  function closeImport() {
    showImport = false;
    if (importStore.state.status !== 'processing') importStore.reset();
  }

  // Loads the bundled, anonymised sample sessions through the normal
  // importer (the Import dialog opens to show its progress). The banner
  // below the header then offers to remove them again.
  let sampleError = $state<string | null>(null);
  async function welcomeTrySamples() {
    dismissWelcome();
    showImport = true;
    trackEvent('sample_data_loaded');
    try {
      sampleError = null;
      await importStore.importFiles(await fetchSampleFiles());
      // The finished import is the point; once it's had a moment to be seen,
      // close the dialog and land on Today with the page heading focused.
      if (importStore.state.status === 'done' && showImport) {
        setTimeout(() => {
          if (!showImport || importStore.state.status !== 'done') return;
          closeImport();
          navigate('today');
          tick().then(() => titleEl?.focus());
        }, 1000);
      }
    } catch (e) {
      console.error(e);
      sampleError = "Couldn't load the sample data. Check your connection, then try again.";
      showImport = false;
    }
  }

  // Activities that came from the sample files - re-counted whenever the
  // activity list changes, so the banner appears after loading them and
  // disappears once they're removed.
  let sampleCount = $state(0);
  $effect(() => {
    activitiesStore.all;
    countSampleActivities().then((n) => (sampleCount = n));
  });
  let removingSamples = $state(false);
  async function removeSamples() {
    removingSamples = true;
    try {
      await removeSampleData();
      await Promise.all([activitiesStore.load(), fitFilesStore.load()]);
      importStore.reset();
      trackEvent('sample_data_removed');
    } finally {
      removingSamples = false;
    }
  }

  // Safari deletes a site's data after 7 days without a visit unless it's
  // installed - worth saying once there's imported data to lose.
  const installHintKind = installHint(currentInstallEnv());
  let installHintDismissed = $state(settingsStore.getInstallHintDismissed());
  let showInstallHint = $derived(installHintKind !== null && !installHintDismissed && activitiesStore.all.length > 0);
  function dismissInstallHint() {
    installHintDismissed = true;
    settingsStore.save({ install_hint_dismissed: 'true' });
  }

  function welcomeExploreFirst() {
    dismissWelcome();
    highlightImport = true;
    setTimeout(() => (highlightImport = false), 4000);
  }

  // Manual replay from About - unlike the automatic first-boot trigger,
  // this isn't gated on having zero activities.
  function replayWelcome() {
    showAbout = false;
    showWelcome = true;
  }

  let activities = $derived(activitiesStore.all);

  const TABS = [
    { screen: 'today', label: 'Today', icon: 'overview' },
    { screen: 'activity', label: 'Activities', icon: 'activities' },
    { screen: 'calendar', label: 'Calendar', icon: 'calendar' },
    { screen: 'trends', label: 'Trends', icon: 'trends' },
    { screen: 'records', label: 'Records', icon: 'records' }
  ] as const;

  // Bounds for the custom-range slider (and the 'all' preset): every
  // activity ever imported, so both can always reach the full history.
  let historyMinDate = $derived.by(() => {
    if (activities.length === 0) return todayStr();
    return activities.reduce((min, a) => (a.date < min ? a.date : min), activities[0]!.date);
  });
  let historyMaxDate = $derived(todayStr());

  // Trends' date range, picked in its filter bar (RangeFilter): a
  // quick preset (rolling N days ending today, or the full imported history
  // for 'all'), or a custom [start, end] the user drags into place - fully arbitrary, not pinned to today. `preset` alone
  // drives the resolved window except while 'custom' is active, when the
  // dragged customStart/customEnd take over.
  let preset = $state<Preset>(settingsStore.getDefaultRangePreset());
  let customStart = $state(todayStr());
  let customEnd = $state(todayStr());

  let rangeEnd = $derived(preset === 'custom' ? customEnd : todayStr());
  let rangeStart = $derived(
    preset === 'custom' ? customStart : preset === 'all' ? historyMinDate : addDays(rangeEnd, -(PRESET_DAYS[preset] - 1))
  );
  let rangeLabel = $derived(preset === 'custom' ? formatDateRangeShort(rangeStart, rangeEnd) : presetLabel(preset));

  // Today has no range picker (it moved into the Trends filter
  // bars), so its cards follow Settings > default range instead.
  let todayPreset = $derived(settingsStore.getDefaultRangePreset());
  let todayRangeDays = $derived(
    todayPreset === 'all' ? daysBetween(historyMinDate, todayStr()) + 1 : PRESET_DAYS[todayPreset]
  );

  // Screen changes and activity selection push real browser-history entries
  // (as a #hash, so a static host never needs to route it) so the browser's
  // own Back/Forward buttons step back through pages visited inside the app
  // instead of leaving it on the first Back press.
  function hashFor(s: Screen, activityId: number | null): string {
    return s === 'activity' && activityId !== null ? `#/activity/${activityId}` : `#/${s}`;
  }

  // What analytics is told about a screen: its name only. An open activity
  // is reported as /activity/detail, never its local id.
  function pageviewPath(s: Screen, activityId: number | null): string {
    return s === 'activity' && activityId !== null ? '/activity/detail' : `/${s}`;
  }

  function applyHash(hash: string) {
    const match = /^#\/activity\/(\d+)$/.exec(hash);
    if (match) {
      screen = 'activity';
      activeActivityId = Number(match[1]);
      return;
    }
    const s = hash.replace(/^#\//, '') as Screen;
    screen = s === 'activity' || s === 'calendar' || s === 'trends' || s === 'records' || s === 'today' ? s : 'today';
    // Any hash that isn't a specific activity's own route means no activity
    // is open - without this, navigating Back from a detail view to the
    // bare Activities list left activeActivityId pointing at the old
    // activity, so the URL changed but the same detail kept rendering.
    activeActivityId = null;
  }

  // Ticks once a minute purely so the "synced Xm/h/d ago" label keeps
  // advancing while the app is left open, without re-fetching anything.
  let nowTick = $state(Date.now());

  // The real rendered header height, exposed as --header-height so
  // ActivityScreen's sticky Atlas hero (design_handoff_atlas/README.md
  // section 2) can offset itself correctly - measured with a ResizeObserver
  // rather than assumed, since the brief itself flags a hardcoded guess
  // (51px assumed vs 76.5px actual) as a real layout bug it already hit.
  let headerEl = $state<HTMLElement | null>(null);
  let titleEl = $state<HTMLElement | null>(null);

  // Settings > Display > Text size: every --fs-* token in styles/tokens.css
  // is a calc() on this, so setting it on <html> rescales the whole app.
  $effect(() => {
    document.documentElement.style.setProperty('--text-scale', String(settingsStore.getTextScale()));
  });

  $effect(() => {
    if (!headerEl) return;
    const el = headerEl;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-height', `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  onMount(() => {
    themeStore.init();
    initLogoLaps();
    setAnalyticsEnabled(settingsStore.getAnalyticsEnabled());
    // The landing page's "Try it with sample data" opens /app/?sample=1.
    // Loads the samples into an empty browser; with data already here the
    // flag is just dropped. Either way it's removed from the address, so a
    // reload or a bookmark doesn't load them again.
    const params = new URLSearchParams(location.search);
    if (params.get('sample') === '1') {
      params.delete('sample');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
      if (activitiesStore.all.length === 0) welcomeTrySamples();
    }
    if (location.hash) {
      applyHash(location.hash);
    }
    history.replaceState(null, '', hashFor(screen, activeActivityId));
    trackPageview(pageviewPath(screen, activeActivityId));
    const onPopState = () => {
      applyHash(location.hash);
      trackPageview(pageviewPath(screen, activeActivityId));
    };
    window.addEventListener('popstate', onPopState);
    const tickTimer = setInterval(() => (nowTick = Date.now()), 60_000);
    initialized = true;
    return () => {
      window.removeEventListener('popstate', onPopState);
      clearInterval(tickTimer);
    };
  });

  function pushHash(next: string) {
    if (location.hash !== next) history.pushState(null, '', next);
  }

  function navigate(next: Screen) {
    // Sidebar nav into Activity always lands on the full activities list,
    // not whichever activity happened to be open last.
    if (next === 'activity') activeActivityId = null;
    screen = next;
    pushHash(hashFor(next, activeActivityId));
    trackPageview(pageviewPath(next, activeActivityId));
    // A different screen starts at its top, not wherever the last one was
    // scrolled to (on a phone that's usually far down a long page).
    window.scrollTo(0, 0);
  }

  function openActivity(id: number) {
    activeActivityId = id;
    screen = 'activity';
    pushHash(hashFor('activity', id));
    trackPageview(pageviewPath('activity', id));
  }

  // Shared by every tool button (Settings/Import/About - in the sidebar
  // footer on desktop, the header on a phone) so every tool open is tracked
  // from one place rather than per-button.
  function openTool(open: () => void, tool: string) {
    open();
    trackEvent('tool_opened', { tool });
  }

  // Cmd/Ctrl+K opens Settings with its search field focused, from anywhere
  // in the app (design_handoff_settings/README.md section 2) - SettingsPanel
  // itself autofocuses that field whenever it mounts.
  function handleGlobalKeydown(e: KeyboardEvent) {
    // Escape closes the top-most open dialog. Settings handles its own Escape
    // (nested confirms, clearing the search first), and a control that used
    // Escape itself (sliders, inputs) has already called preventDefault.
    if (e.key === 'Escape' && !e.defaultPrevented && !showSettings) {
      if (showReleaseNotes) showReleaseNotes = false;
      else if (showPrivacy) showPrivacy = false;
      else if (showTerms) showTerms = false;
      else if (showAbout) showAbout = false;
      else if (showImport) closeImport();
      else return;
      e.preventDefault();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openTool(() => (showSettings = true), 'settings');
    }
  }

  function backToActivityList() {
    activeActivityId = null;
    pushHash(hashFor('activity', null));
  }


  // Real time since the last successful .fit import, not a fixed string -
  // `nowTick` is read here purely so this recomputes as time passes.
  let syncedLabel = $derived.by(() => {
    nowTick;
    const last = fitFilesStore.lastImportedAt;
    return last ? `Last import ${formatRelativeTime(last)}` : 'no imports yet';
  });

  let activeActivity = $derived(activeActivityId !== null ? (activities.find((a) => a.id === activeActivityId) ?? null) : null);
  // Total imported activities - what the Activities screen lists. (It used
  // to show the latest activity's distance with the unit stripped, which
  // read as an unexplained "3.95".)
  let activityBadge = $derived(activities.length);

  // Sessions listed in Today's Activity Ledger.
  let ledgerCount = $derived(Math.min(TODAY_LEDGER_SIZE, activities.length));

  // Real count of sessions recorded in the current calendar month, for the
  // sidebar's Calendar badge - not tied to whatever month the Calendar
  // screen itself happens to be navigated to.
  let calendarMonthBadge = $derived.by(() => {
    const ym = todayStr().slice(0, 7);
    return activities.filter((a) => a.date.startsWith(ym)).length;
  });

  // How many records (Records screen rows) actually have a best value yet -
  // '—' while they're still being computed.
  let recordsBadge = $state<number | null>(null);
  $effect(() => {
    const promise = activitiesStore.allRecords();
    recordsBadge = null;
    promise.then((records) => {
      if (promise === activitiesStore.allRecords()) recordsBadge = records.filter((r) => r.bestValue !== null).length;
    });
  });

  function screenTitle(s: Screen): string {
    // "[Sport] Detail" rather than repeating the sport name plain - the
    // activity screen's own content (ActivityScreen.svelte) already shows
    // the full sport/date/time as its own eyebrow+title, so this header
    // only needs to say which screen this is, not restate the specifics.
    if (s === 'activity') return activeActivity ? `${formatSport(activeActivity.sport)} Detail` : 'Activities';
    return { today: 'Today', calendar: 'Calendar', trends: 'Trends', records: 'Records' }[s] ?? '';
  }

  function screenSub(s: Screen): string {
    if (s === 'today') return new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    if (s === 'activity') {
      if (!activeActivity) return `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`;
      // No subline once an activity is open - the content's own eyebrow
      // right below already carries the sport/date/time/distance, so
      // there's nothing left to say here that wouldn't just repeat it.
      return '';
    }
    // The Calendar screen carries its own month/legend header inside its
    // panel (design_handoff_calendar/README.md section 3's panel header) -
    // nothing left for the shared header subline to add.
    if (s === 'calendar') return '';
    if (s === 'trends') {
      const rangeText = preset === 'custom' ? rangeLabel : RANGE_SUBLINE[preset];
      const n = activities.filter((a) => a.date >= rangeStart && a.date <= rangeEnd).length;
      return `${rangeText} · ${n} ${n === 1 ? 'activity' : 'activities'}`;
    }
    return 'Lifetime bests and progression, all sports';
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#snippet rangeFilter()}
  <RangeFilter
    bind:preset
    bind:customStart
    bind:customEnd
    {rangeStart}
    {rangeEnd}
    historyMin={historyMinDate}
    historyMax={historyMaxDate}
  />
{/snippet}

{#snippet toolButtons()}
  <button class="icon-btn" onclick={() => openTool(() => (showSettings = true), 'settings')} title="Settings" aria-label="Settings">
    <Icon name="settings" />
  </button>
  <button class="icon-btn" onclick={() => openTool(() => (showAbout = true), 'about')} title="About" aria-label="About">
    <Icon name="info" />
  </button>
{/snippet}

<div class="shell">
  <aside class="sidebar">
    <div class="wordmark">
      <!-- Logo A, "the track": a running-track oval with a teal start/finish
           line, which runs one lap on load (lib/logo.ts). -->
      <svg class="wordmark-mark" width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="8" y="18" width="48" height="28" rx="14" fill="none" stroke="var(--ink-1)" stroke-width="6" />
        {@html logoTickSvg()}
      </svg>
      <span>{@html WORDMARK_HTML}</span>
    </div>
    <div class="sidebar-sublabel">Training Analysis</div>

    <nav class="sidebar-nav">
      <button class="sidebar-nav-item" class:active={screen === 'today'} onclick={() => navigate('today')}>
        <span class="sidebar-nav-marker"></span>
        <span class="sidebar-nav-label">Today</span>
        <span class="sidebar-nav-badge mono">{ledgerCount}</span>
      </button>
      <button class="sidebar-nav-item" class:active={screen === 'activity'} onclick={() => navigate('activity')}>
        <span class="sidebar-nav-marker"></span>
        <span class="sidebar-nav-label">Activities</span>
        <span class="sidebar-nav-badge mono">{activityBadge}</span>
      </button>
      <button class="sidebar-nav-item" class:active={screen === 'calendar'} onclick={() => navigate('calendar')}>
        <span class="sidebar-nav-marker"></span>
        <span class="sidebar-nav-label">Calendar</span>
        <span class="sidebar-nav-badge mono">{calendarMonthBadge}</span>
      </button>
      <button class="sidebar-nav-item" class:active={screen === 'trends'} onclick={() => navigate('trends')}>
        <span class="sidebar-nav-marker"></span>
        <span class="sidebar-nav-label">Trends</span>
        <span class="sidebar-nav-badge mono">{presetLabel(preset)}</span>
      </button>
      <button class="sidebar-nav-item" class:active={screen === 'records'} onclick={() => navigate('records')}>
        <span class="sidebar-nav-marker"></span>
        <span class="sidebar-nav-label">Records</span>
        <span class="sidebar-nav-badge mono">{recordsBadge ?? '—'}</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-tools">
        {@render toolButtons()}
      </div>
    </div>
  </aside>

  <div class="main">
    <header class="header" bind:this={headerEl}>
      <div class="header-left">
        <div>
          <h1 class="header-title" tabindex="-1" bind:this={titleEl}>{screenTitle(screen)}</h1>
          {#if screenSub(screen)}<div class="header-subline">{screenSub(screen)}</div>{/if}
        </div>
      </div>
      <!-- Phone only: the sidebar (and its tool buttons) is hidden there. -->
      <div class="header-tools">
        {@render toolButtons()}
      </div>
      <div class="header-right">
        <span class="synced-label">{syncedLabel}</span>
        <button
          type="button"
          class="icon-btn theme-btn"
          onclick={() => themeStore.toggle()}
          title={themeStore.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={themeStore.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Icon name={themeStore.theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm sync-btn"
          class:spotlight={highlightImport}
          onclick={() => openTool(() => (showImport = true), 'import')}
          title="Sync from your watch, or import .fit/.gpx files"
        >
          <Icon name="import" />
          Sync
        </button>
      </div>
    </header>

    {#if dbStatus.closedByOtherTab}
      <div class="notice-banner" role="alert">
        <span>Lapline was updated in another tab. Reload this tab to carry on.</span>
        <button type="button" class="btn btn-primary" onclick={() => location.reload()}>Reload</button>
      </div>
    {/if}

    {#if sampleCount > 0 || sampleError}
      <div class="notice-banner" role="status">
        {#if sampleError}
          <span>{sampleError}</span>
        {:else}
          <span>You're looking at <strong>sample data</strong>: {sampleCount} anonymised {sampleCount === 1 ? 'activity' : 'activities'}. It's removed when you import your own workouts.</span>
          <button type="button" class="btn btn-secondary" onclick={removeSamples} disabled={removingSamples}>
            {removingSamples ? 'Removing…' : 'Remove sample data'}
          </button>
        {/if}
      </div>
    {/if}

    {#if showInstallHint}
      <div class="notice-banner" role="note">
        <span>
          Safari deletes a website's saved data after 7 days without a visit. To keep your activities,
          {#if installHintKind === 'ios'}
            add Lapline to your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          {:else}
            add Lapline to your Dock: <strong>File → Add to Dock</strong>.
          {/if}
        </span>
        <button type="button" class="icon-btn" onclick={dismissInstallHint} aria-label="Dismiss"><Icon name="close" size={14} /></button>
      </div>
    {/if}

    {#if !initialized}
      <div class="screen"><div class="panel empty-state">Loading your training…</div></div>
    {:else if screen === 'today'}
      <TodayScreen rangeDays={todayRangeDays} rangeLabel={presetLabel(todayPreset)} onSelectActivity={openActivity} />
    {:else if screen === 'activity'}
      <ActivityScreen activityId={activeActivityId} onSelectActivity={openActivity} onBack={backToActivityList} />
    {:else if screen === 'calendar'}
      <CalendarScreen onSelectActivity={openActivity} />
    {:else if screen === 'trends'}
      <TrendsScreen startDate={rangeStart} endDate={rangeEnd} {rangeLabel} {rangeFilter} />
    {:else if screen === 'records'}
      <RecordsScreen onSelectActivity={openActivity} />
    {/if}
  </div>

  <!-- Phone only: replaces the sidebar with a bottom tab bar, one tap to
       any screen and always showing where you are. -->
  <nav class="tabbar" aria-label="Screens">
    {#each TABS as t (t.screen)}
      <button class="tabbar-item" class:active={screen === t.screen} aria-current={screen === t.screen ? 'page' : undefined} onclick={() => navigate(t.screen)}>
        <Icon name={t.icon} size={22} />
        <span>{t.label}</span>
      </button>
    {/each}
  </nav>
</div>

{#if showSettings}
  <div class="modal-overlay" onclick={() => (showSettings = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal settings-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <SettingsPanel onClose={() => (showSettings = false)} />
    </div>
  </div>
{/if}

{#if showImport}
  <div class="modal-overlay" onclick={closeImport} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <div class="flex justify-between items-center mb-4">
        <span class="kicker">Import</span>
        <button class="icon-btn" onclick={closeImport} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>
      <ImportPanel />
    </div>
  </div>
{/if}

{#if showAbout}
  <div class="modal-overlay" onclick={() => (showAbout = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <div class="flex justify-between items-center mb-4">
        <span class="kicker">About</span>
        <button class="icon-btn" onclick={() => (showAbout = false)} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>
      <AboutPanel
        onOpenTerms={() => {
          showAbout = false;
          showTerms = true;
        }}
        onOpenPrivacy={() => {
          showAbout = false;
          showPrivacy = true;
        }}
        onReplayTutorial={replayWelcome}
        onOpenReleaseNotes={() => {
          showAbout = false;
          showReleaseNotes = true;
        }}
      />
    </div>
  </div>
{/if}

{#if showTerms}
  <div class="modal-overlay" onclick={() => (showTerms = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <div class="flex justify-between items-center mb-4">
        <span class="kicker">Terms & Conditions</span>
        <button class="icon-btn" onclick={() => (showTerms = false)} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>
      <TermsPanel />
    </div>
  </div>
{/if}

{#if showPrivacy}
  <div class="modal-overlay" onclick={() => (showPrivacy = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <div class="flex justify-between items-center mb-4">
        <span class="kicker">Privacy Policy</span>
        <button class="icon-btn" onclick={() => (showPrivacy = false)} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>
      <PrivacyPanel />
    </div>
  </div>
{/if}

{#if showReleaseNotes}
  <div class="modal-overlay" onclick={() => (showReleaseNotes = false)} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <div class="flex justify-between items-center mb-4">
        <span class="kicker">Release Notes</span>
        <button class="icon-btn" onclick={() => (showReleaseNotes = false)} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>
      <ReleaseNotesPanel />
    </div>
  </div>
{/if}

{#if showWelcome}
  <div class="modal-overlay" role="presentation">
    <div class="modal" style="max-width: 744px;" role="dialog" aria-modal="true" tabindex="-1" use:dialogFocus>
      <WelcomeModal onImportNow={welcomeImportNow} onExploreFirst={welcomeExploreFirst} onTrySamples={welcomeTrySamples} />
    </div>
  </div>
{/if}
