<!-- AboutPanel.svelte - "What is this app" explainer opened from the sidebar.
     Read-only: no settings live here, just the pitch and the data-ownership
     story (everything stays local, nothing is uploaded, delete/export live
     in Settings). Links out to the Terms and Privacy panels rather than
     duplicating their content here. -->
<script lang="ts">
  import { CURRENT_VERSION } from '../lib/release-notes';
  import { CONTACT_EMAIL, DONATE_URL } from '../lib/links';

  interface Props {
    onOpenTerms: () => void;
    onOpenPrivacy: () => void;
    onReplayTutorial: () => void;
    onOpenReleaseNotes: () => void;
  }

  let { onOpenTerms, onOpenPrivacy, onReplayTutorial, onOpenReleaseNotes }: Props = $props();
</script>

<div class="card" style="max-width: 640px;">
  <div class="flex justify-between items-start">
    <span class="section-title">What this is</span>
    <button type="button" class="btn btn-secondary btn-sm mono" onclick={onOpenReleaseNotes} title="View release notes">v{CURRENT_VERSION}</button>
  </div>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Lapline turns the <strong>.fit</strong> files your watch or bike computer already
    record into a real training picture - trends, personal records, heart-rate zones,
    and per-sport detail - without an account, a subscription, or a company on the other
    end of an upload.
  </p>
  <div class="mt-4">
    <button type="button" class="btn btn-secondary btn-sm" onclick={onReplayTutorial}>Replay the welcome tutorial</button>
  </div>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Your data stays yours</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Every activity you import is parsed and stored entirely in this browser's own local
    database (IndexedDB) on this device. There's no Lapline server to send it to: your
    activity files never leave your device, and once loaded the app works the same with
    your network disconnected.
  </p>
  <p style="margin: var(--space-5) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    That also means your data doesn't follow you to another browser or computer on its
    own. Clearing this browser's site data, or using a different browser or device,
    starts from empty - use <strong>Settings → Backup → Export all data</strong> to take
    everything with you as one file, and restore it there.
  </p>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">You're in control</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    The raw bytes of every file you import are kept alongside the parsed data, so a
    future fix to how this app reads that data can be re-applied to your whole history
    without re-uploading anything. And when you want it gone, it's gone: <strong>Settings
    → Danger zone → Reset all data</strong> permanently deletes every entry, activity,
    goal, setting, and stored file from this browser - there's no copy anywhere else to
    ask us to delete, because we never had one.
  </p>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Estimates, not medical advice</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    VO₂ max, training effect and recovery time are <strong>estimates</strong>, worked out from
    your recordings or by your device's own algorithms, and they're marked "est." where they
    appear. Training load and its status come from standard formulas applied to your heart
    rate and duration. All of these are training guidance, not
    medical advice: they can be wrong, and they can't diagnose or treat anything. If you have a
    health condition, talk to a doctor before starting or changing your training, and stop if
    you feel unwell.
  </p>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Analytics</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Anonymous usage analytics (screens opened, features used, device type) are
    <strong>off unless you turn them on</strong> in <strong>Settings → Analytics</strong>. When on,
    they go to SimpleAnalytics - never your activity data, and no cookies or personal
    identification. See the Privacy Policy below for the full detail.
  </p>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Location lookup</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Turn on <strong>Settings → Location lookup</strong> and this app will send an activity's GPS
    start coordinate (only, never the full route) to OpenStreetMap's Nominatim to show a real place
    name instead of just the sport. Like analytics, this is <strong>off by default</strong> - it
    only sends anything once you turn it on. See the Privacy Policy below for the full detail.
  </p>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Weather lookup</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Turn on <strong>Settings → Weather lookup</strong> and this app will send an activity's date
    and GPS start coordinate to Open-Meteo's free historical weather archive to show a
    real weather condition (e.g. "Clear", "Rain") next to its temperature. Like Location lookup,
    this is <strong>off by default</strong> since it sends real location data. See the Privacy
    Policy below for the full detail.
  </p>
</div>

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Feedback</span>
  <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
    Found a bug, a file that won't import, or something you'd like to see?
    <a href="mailto:{CONTACT_EMAIL}?subject=Lapline%20feedback">Send feedback</a> to {CONTACT_EMAIL}.
  </p>
</div>

{#if DONATE_URL}
  <div class="card mt-4" style="max-width: 640px;">
    <span class="section-title">Support Lapline</span>
    <p style="margin: var(--space-3) 0 0; color: var(--ink-secondary); font-size: var(--fs-md);">
      Lapline is free and open source. If it's useful to you, you can
      <a href={DONATE_URL} target="_blank" rel="noopener">buy me a coffee</a>.
    </p>
  </div>
{/if}

<div class="card mt-4" style="max-width: 640px;">
  <span class="section-title">Legal</span>
  <p style="margin: var(--space-3) 0 var(--space-6); color: var(--ink-secondary); font-size: var(--fs-md);">
    The full detail behind the summary above.
  </p>
  <div class="flex gap-2">
    <button type="button" class="btn btn-secondary btn-sm" onclick={onOpenPrivacy}>Privacy Policy</button>
    <button type="button" class="btn btn-secondary btn-sm" onclick={onOpenTerms}>Terms & Conditions</button>
  </div>
</div>
