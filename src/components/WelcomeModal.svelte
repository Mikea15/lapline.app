<!-- WelcomeModal.svelte - First-time-user welcome shown once, on a browser
     that has never imported anything and hasn't dismissed this before (see
     settingsStore.getHasSeenWelcome). Explains what the app is and the
     three things a new user actually needs to do, then either sends them
     straight into Import, loads the bundled sample sessions to look around
     with (lib/sample-data.ts), or dismisses to a brief highlight on the
     Import icon so they know where to come back to. -->
<script lang="ts">
  interface Props {
    onImportNow: () => void;
    onExploreFirst: () => void;
    onTrySamples: () => void;
  }

  let { onImportNow, onExploreFirst, onTrySamples }: Props = $props();
</script>

<div class="welcome-head">
  <div class="welcome-kicker">Welcome</div>
  <h2 class="welcome-title">Let's get your training in here</h2>
  <p class="welcome-lede">
    Lapline turns the .fit or .gpx files your watch, bike computer, or app already
    record into trends, personal records, heart-rate zones, and per-sport detail. No account, and
    your data never leaves this browser - see the About page any time for the full
    story.
  </p>
</div>

<div class="welcome-steps">
  <div class="welcome-step">
    <span class="welcome-step-num">1</span>
    <div>
      <div class="welcome-step-title">Import your first activity</div>
      <div class="welcome-step-body">
        Choose <strong>Import</strong> (the download arrow) and drop in a .fit file. Don't have
        one handy? The Import screen also has a short guide on getting one off your
        device.
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
    color: var(--accent);
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
