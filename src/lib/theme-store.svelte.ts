// lib/theme-store.svelte.ts - the app's reactive view of lib/theme.ts, so
// Settings > Theme and the header's sun/moon button stay in step.
import { untrack } from 'svelte';
import { getThemePref, setThemePref, resolveTheme, watchTheme, applyTheme, DEFAULT_THEME, type ThemePref, type Theme } from './theme';

let _pref = $state<ThemePref>(getThemePref());
// Initial value only - read once, untracked on purpose.
let _theme = $state<Theme>(resolveTheme(untrack(() => _pref)));
let initialised = false;

export const themeStore = {
  get pref(): ThemePref {
    return _pref;
  },
  /** The theme actually showing ('auto' resolved). */
  get theme(): Theme {
    return _theme;
  },
  set(pref: ThemePref) {
    _pref = pref;
    _theme = setThemePref(pref);
  },
  /** The header button: flips whatever is showing, as an explicit choice. */
  toggle() {
    this.set(_theme === 'dark' ? 'light' : 'dark');
  },
  reset() {
    this.set(DEFAULT_THEME);
  },
  /** Call once at startup: applies the saved choice and follows system and
   *  other-tab changes. */
  init() {
    // Once per page: HMR or a remount must not stack duplicate listeners.
    if (initialised) return;
    initialised = true;
    _theme = applyTheme(_pref);
    watchTheme();
    window.addEventListener('lapline-theme', (e) => {
      _pref = getThemePref();
      _theme = (e as CustomEvent<Theme>).detail;
    });
  }
};
