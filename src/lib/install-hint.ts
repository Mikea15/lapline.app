// lib/install-hint.ts - whether to tell a Safari user to install Lapline.
// Safari deletes all of a website's stored data (IndexedDB included, so
// every imported activity) after 7 days without a visit, unless the site was
// added to the Home Screen (iOS/iPadOS) or the Dock (macOS). Installed, it's
// treated as an app and keeps its data.

export type InstallHint = 'ios' | 'mac' | null;

export interface InstallEnv {
  userAgent: string;
  /** Running as an installed app (display-mode: standalone, or iOS's navigator.standalone). */
  standalone: boolean;
  /** navigator.maxTouchPoints - iPadOS Safari reports a Mac user agent. */
  maxTouchPoints: number;
}

export function installHint({ userAgent: ua, standalone, maxTouchPoints }: InstallEnv): InstallHint {
  if (standalone) return null;
  // Real Safari only: every other browser on iOS also says "Safari" (and
  // "Mobile"), but adds its own token.
  const isSafari = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|EdgA?|OPR|OPiOS|Android|SamsungBrowser|DuckDuckGo|GSA)\//.test(ua);
  if (!isSafari) return null;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua)) return maxTouchPoints > 1 ? 'ios' : 'mac';
  return null;
}

export function currentInstallEnv(): InstallEnv {
  return {
    userAgent: navigator.userAgent,
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    maxTouchPoints: navigator.maxTouchPoints ?? 0
  };
}
