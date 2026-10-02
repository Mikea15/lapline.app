// lib/theme.ts - light/dark theme for the app and the site pages around it.
// The choice lives in localStorage (not the settings database) so it can be
// applied before the first paint: scripts/landing/changelog-plugin.ts puts
// an inline copy of applyStoredTheme() in every page's <head>, and the app
// and site pages share one origin, so one choice covers both.
//
// 'auto' follows the system's light/dark setting. The default is dark, the
// look Lapline has always had.

export type ThemePref = 'dark' | 'light' | 'auto';
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'lapline-theme';
export const DEFAULT_THEME: ThemePref = 'dark';

/** The browser bar colour per theme: each theme's page background. */
export const THEME_COLOR: Record<Theme, string> = { dark: '#0a0c0f', light: '#f6f4f0' };

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'dark' || v === 'light' || v === 'auto';
}

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isThemePref(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'auto' ? systemTheme() : pref;
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Sets <html data-theme> and the browser bar colour. */
export function applyTheme(pref: ThemePref): Theme {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  window.dispatchEvent(new CustomEvent<Theme>('lapline-theme', { detail: theme }));
  return theme;
}

export function setThemePref(pref: ThemePref): Theme {
  try {
    if (pref === DEFAULT_THEME) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
  return applyTheme(pref);
}

/** Re-applies 'auto' when the system theme changes, and picks up a choice
 *  made in another tab. Call once per page. */
export function watchTheme(): void {
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (getThemePref() === 'auto') applyTheme('auto');
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) applyTheme(getThemePref());
  });
}

/** Inline <head> script: the same logic as applyTheme, before any CSS
 *  paints, so a light-theme page never flashes dark. Kept dependency-free. */
export const PREPAINT_THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');}catch(e){}if(p!=='light'&&p!=='auto')p='${DEFAULT_THEME}';var t=p==='auto'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'${THEME_COLOR.light}':'${THEME_COLOR.dark}');})();`;
