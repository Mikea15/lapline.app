// viewport.svelte.ts - the phone breakpoint as reactive state, for the few
// components whose phone layout is different markup rather than just
// different CSS (e.g. a table that becomes a stacked list). Must match the
// `max-width: 720px` media queries in styles/global.css.
import { MediaQuery } from 'svelte/reactivity';

export const PHONE_QUERY = '(max-width: 720px)';

export const phone = new MediaQuery(PHONE_QUERY, false);

// A touchscreen as the main pointer (phones, tablets) - for copy that talks
// about clicking or dropping files, neither of which fits a finger.
export const touch = new MediaQuery('(pointer: coarse)', false);
