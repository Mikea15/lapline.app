// lib/today-ledger.ts
// How many of the most recent sessions Today's Activity Ledger lists -
// shared with the sidebar's Today badge (App.svelte) so the two can't
// disagree (the badge used to hardcode a stale 15 while the ledger showed 25).
export const TODAY_LEDGER_SIZE = 25;
