// Shared keyboard/focus behaviour for modal dialogs, used as a Svelte action
// (`use:dialogFocus`) on each `role="dialog"` element:
//   - focus moves into the dialog when it opens (unless a child already took
//     it, e.g. Settings' search field) - first focusable, else the dialog;
//   - Tab / Shift+Tab wrap inside the dialog;
//   - on close, focus returns to the element that opened it.
// Escape is handled centrally by App.svelte's global keydown handler.

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Index in the focusable list that Tab should land on to keep focus inside a
 * dialog, or null to let the browser move focus normally. `activeIndex` is the
 * focused element's index among `count` focusables (-1 when focus is outside
 * that list, e.g. on the dialog itself). A returned -1 means "keep focus on
 * the dialog" (nothing focusable inside).
 */
export function trapTabTarget(count: number, activeIndex: number, shift: boolean): number | null {
  if (count === 0) return -1;
  if (activeIndex === -1) return shift ? count - 1 : 0;
  if (shift && activeIndex === 0) return count - 1;
  if (!shift && activeIndex === count - 1) return 0;
  return null;
}

function focusables(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.getClientRects().length > 0);
}

// Opener handed from a dialog that just closed to one opening in the same
// tick (About -> Terms), since the clicked link no longer exists by then.
let handoff: HTMLElement | null = null;

// Last element focused outside any dialog. A child's own autofocus effect
// (Settings' search field) can run before this action, so activeElement alone
// may already be inside the dialog by the time we look.
let lastOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && !t.closest('[role="dialog"]')) lastOutside = t;
  });
}

export function dialogFocus(node: HTMLElement) {
  const active = document.activeElement;
  const current = active instanceof HTMLElement && active !== document.body && !node.contains(active) ? active : null;
  let opener: HTMLElement | null = current ?? (lastOutside?.isConnected ? lastOutside : handoff);
  handoff = null;

  if (!node.contains(document.activeElement)) (focusables(node)[0] ?? node).focus();

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const list = focusables(node);
    const target = trapTabTarget(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (target === null) return;
    e.preventDefault();
    (list[target] ?? node).focus();
  }
  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      if (opener?.isConnected) opener.focus();
      handoff = opener;
      setTimeout(() => (handoff = null), 0);
      opener = null;
    },
  };
}
