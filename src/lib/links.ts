// lib/links.ts - outside links that don't exist yet at launch. Leave a value
// empty and every place that uses it hides its link, so nothing points at a
// page that isn't there; fill it in and they all appear (the app's About,
// and the site footer via scripts/landing/changelog-plugin.ts).

/** Where feedback and questions go. */
export const CONTACT_EMAIL = 'hello@lapline.app';

/** Lapline on X. */
export const X_URL = 'https://x.com/laplineapp';

/** Buy Me a Coffee page, e.g. 'https://buymeacoffee.com/lapline'. */
export const DONATE_URL = 'https://buymeacoffee.com/mikea15';
