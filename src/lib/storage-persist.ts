// storage-persist.ts - asks the browser to mark this site's storage as
// persistent, so Chromium-based browsers won't
// silently evict IndexedDB - where all of this app's real training history
// lives - under disk pressure. Doesn't protect against the user clearing
// site data themselves; that's what a real export/backup is for.

export type PersistResult = 'unsupported' | 'already-persisted' | 'granted' | 'denied';

// Takes the StorageManager as a parameter (defaulting to the real one) so
// tests can drive every branch without a browser.
export async function requestPersistentStorage(storage: StorageManager | undefined = globalThis.navigator?.storage): Promise<PersistResult> {
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    // Checked first so a returning visit doesn't re-request a grant it
    // already holds (Firefox can show a permission prompt per request).
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'already-persisted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
