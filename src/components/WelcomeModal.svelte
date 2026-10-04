<!-- WelcomeModal.svelte - First-time-user welcome shown once, on a browser
     that has never imported anything and hasn't dismissed this before (see
     settingsStore.getHasSeenWelcome). Explains what the app is and the
     three things a new user actually needs to do, then either sends them
     straight into Import, loads the bundled sample sessions to look around
     with (lib/sample-data.ts), or dismisses to a brief highlight on the
     header's Sync button so they know where to come back to. -->
<script lang="ts">
  import { settingsStore } from '../lib/stores.svelte';
  import { setAnalyticsEnabled } from '../lib/analytics';

  interface Props {
    onImportNow: () => void;
    onExploreFirst: () => void;
    onTrySamples: () => void;
  }

  let { onImportNow, onExploreFirst, onTrySamples }: Props = $props();

  // The optional online extras, off by default. Each saves straight to the
  // same setting the Settings panel's Privacy section reads and writes.
  const EXTRAS = [
    {
      key: 'analytics_enabled',
      name: 'Usage statistics',
      desc: 'Anonymous screen views and feature use, sent to SimpleAnalytics. Never your activity data.',
      get: () => settingsStore.getAnalyticsEnabled()
    },
    {
      key: 'location_lookup_enabled',
      name: 'Place names',
      desc: "Looks up a name for where an activity started, using OpenStreetMap's Nominatim.",
      get: () => settingsStore.getLocationLookupEnabled()
    },
    {
      key: 'weather_lookup_enabled',
      name: 'Weather',
      desc: 'Shows the conditions for an activity, using Open-Meteo. Sends its date and start point.',
      get: () => settingsStore.getWeatherLookupEnabled()
    },
    {
      key: 'map_tiles_enabled',
      name: 'Map backgrounds',
      desc: 'Shows streets under a route, loading map images of that area from CARTO.',
      get: () => settingsStore.getMapTilesEnabled()
    }
  ] as const;

  async function setExtra(key: (typeof EXTRAS)[number]['key'], next: boolean) {
    if (key === 'analytics_enabled') setAnalyticsEnabled(next);
    await settingsStore.save({ [key]: String(next) });
  }
</script>

<div class="welcome-head">
  <div class="welcome-kicker">Welcome</div>
  <h2 class="welcome-title">Let's get your training in here</h2>
  <p class="welcome-lede">
    Lapline turns the workouts your watch, bike computer or phone app records into trends,
    personal records, heart-rate zones and detail for every session. No account, and your
    workouts stay on this device. A few optional extras go online only if you turn them on;
    About has the details.
  </p>
</div>

<div class="welcome-steps">
  <div class="welcome-step">
    <span class="welcome-step-num">1</span>
    <div>
      <div class="welcome-step-title">Import your first activity</div>
      <div class="welcome-step-body">
        Choose <strong>Sync</strong> (top right) and connect your watch or drop in a .fit file.
        Don't have one handy? It also has a short guide on getting one off your device.
      </div>
    </div>
  </div>
  <div class="welcome-step">
    <span class="welcome-step-num">2</span>
    <div>
      <div class="welcome-step-title">Explore Today, Trends, and Records</div>
      <div class="welcome-step-body">
        Once you've imported a few sessions, these fill in with your real training load,
        pace/HR trends, and lifetime bests.
      </div>
    </div>
  </div>
  <div class="welcome-step">
    <span class="welcome-step-num">3</span>
    <div>
      <div class="welcome-step-title">Come back any time</div>
      <div class="welcome-step-body">
        The <strong>About</strong> icon (the ⓘ) has this guide, plus the Privacy
        Policy and Terms if you want the detail on how your data is handled.
      </div>
    </div>
  </div>
</div>

<section class="welcome-extras" aria-labelledby="welcome-extras-title">
  <h3 id="welcome-extras-title" class="welcome-extras-title">Optional extras</h3>
  <p class="welcome-extras-note">
    These use outside services, so they're all off. Leave them as they are, or turn on any you
    want. You can change them later in Settings.
  </p>
  <ul class="welcome-extras-list">
    {#each EXTRAS as extra (extra.key)}
      {@const on = extra.get()}
      <li class="welcome-extra">
        <div class="welcome-extra-text">
          <div class="welcome-extra-name">{extra.name}</div>
          <div class="welcome-extra-desc">{extra.desc}</div>
        </div>
        <div class="segmented" role="group" aria-label={extra.name}>
          <button type="button" class:active={!on} aria-pressed={!on} onclick={() => setExtra(extra.key, false)}>Off</button>
          <button type="button" class:active={on} aria-pressed={on} onclick={() => setExtra(extra.key, true)}>On</button>
        </div>
      </li>
    {/each}
  </ul>
</section>

<div class="welcome-actions">
  <button type="button" class="btn btn-secondary" onclick={onExploreFirst}>I'll explore first</button>
  <button type="button" class="btn btn-secondary" onclick={onTrySamples}>Try it with sample data</button>
  <button type="button" class="btn btn-primary" onclick={onImportNow}>Import my first activity</button>
</div>

<style>
  .welcome-head {
    max-width: 688px;
  }
  .welcome-kicker {
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--accent-ink);
    margin-bottom: var(--space-3);
  }
  .welcome-title {
    margin: 0 0 var(--space-5);
    font-size: var(--fs-2xl);
  }
  .welcome-lede {
    margin: 0;
    color: var(--ink-secondary);
    font-size: var(--fs-md);
    line-height: 1.55;
  }

  .welcome-steps {
    margin-top: var(--space-9);
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
    max-width: 688px;
  }
  .welcome-step {
    display: flex;
    gap: var(--space-6);
    align-items: flex-start;
  }
  .welcome-step-num {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--line-panel);
    color: var(--ink-secondary);
    font-size: var(--fs-sm);
    font-weight: var(--fw-bold);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .welcome-step-title {
    font-weight: var(--fw-semibold);
    font-size: var(--fs-md);
    margin-bottom: var(--space-2);
  }
  .welcome-step-body {
    color: var(--ink-muted);
    font-size: var(--fs-md);
    line-height: 1.5;
  }

  .welcome-extras {
    margin-top: var(--space-9);
    max-width: 688px;
    padding-top: var(--space-7);
    border-top: 1px solid var(--line-panel);
  }
  .welcome-extras-title {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
  }
  .welcome-extras-note {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
  .welcome-extras-list {
    list-style: none;
    margin: var(--space-5) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .welcome-extra {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
  }
  .welcome-extra-name {
    font-size: var(--fs-md);
    font-weight: var(--fw-semibold);
  }
  .welcome-extra-desc {
    color: var(--ink-muted);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
  .welcome-extra .segmented {
    flex-shrink: 0;
  }

  .welcome-actions {
    margin-top: var(--space-9);
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-5);
  }
  /* Phone: full-width buttons, the main action on top. */
  @media (max-width: 720px) {
    .welcome-actions {
      flex-direction: column-reverse;
    }
    .welcome-actions .btn {
      width: 100%;
      min-height: 44px;
    }
  }
</style>
