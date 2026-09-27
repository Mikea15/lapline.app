<!-- ReleaseNotesPanel.svelte - changelog, opened from About. Read-only,
     sourced from lib/release-notes.ts (the single hand-maintained list). -->
<script lang="ts">
  import { RELEASE_NOTES } from '../lib/release-notes';
</script>

<div class="release-notes-list">
  {#each RELEASE_NOTES as release (release.version)}
    <div class="card release-note-card">
      <div class="release-note-head">
        <span class="release-note-version mono">v{release.version}</span>
        <span class="release-note-date mono">{release.date}</span>
      </div>
      <ul class="release-note-changes">
        {#each release.changes as change}
          <li>{change}</li>
        {/each}
      </ul>
    </div>
  {/each}
</div>

<style>
  .release-notes-list {
    max-width: 688px;
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
  }
  .release-note-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .release-note-version {
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
    color: var(--ink-1);
  }
  .release-note-date {
    font-size: var(--fs-base);
    color: var(--ink-muted);
  }
  .release-note-changes {
    margin: 0;
    padding-left: var(--space-8);
    color: var(--ink-secondary);
    font-size: var(--fs-md);
    line-height: 1.55;
  }
  .release-note-changes li + li {
    margin-top: var(--space-3);
  }
</style>
