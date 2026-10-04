<!-- DbErrorScreen.svelte - shown instead of the app when the database can't
     be opened (main.ts), so a storage failure never looks like an empty
     account inviting a re-import or a reset. 'blocked' is the milder case:
     this tab's update is waiting for an older tab to close. -->
<script lang="ts">
  let { kind, errorName = '' }: { kind: 'failed' | 'blocked'; errorName?: string } = $props();
</script>

<main class="db-error">
  <div class="panel db-error-panel" role="alert">
    {#if kind === 'blocked'}
      <h1>Finishing an update</h1>
      <p>Lapline is open in another tab or window. Close it (or reload it) and this tab will carry on.</p>
    {:else}
      <h1>Couldn't open your data</h1>
      <p>Lapline couldn't open its storage in this browser. Nothing has been deleted. The usual causes:</p>
      <ul>
        <li>a private or incognito window, which can block storage</li>
        <li>the device or browser storage is full</li>
        <li>a newer version of Lapline is open in another tab</li>
      </ul>
      <button type="button" class="btn btn-primary" onclick={() => location.reload()}>Reload</button>
      {#if errorName}<p class="db-error-code mono">{errorName}</p>{/if}
    {/if}
  </div>
</main>

<style>
  .db-error {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--space-8);
    background: var(--bg-app);
  }
  .db-error-panel {
    max-width: 440px;
    color: var(--ink-2);
    font-size: var(--fs-md);
    line-height: 1.5;
  }
  h1 {
    margin: 0 0 var(--space-4);
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
    color: var(--ink-1);
  }
  p {
    margin: 0 0 var(--space-4);
  }
  ul {
    margin: 0 0 var(--space-6);
    padding-left: 1.2em;
  }
  .db-error-code {
    margin: var(--space-5) 0 0;
    font-size: var(--fs-xs);
    color: var(--ink-5);
  }
</style>
