/// <reference types="vite/client" />
/// <reference types="svelte" />

interface ImportMetaEnv {
  // Domain registered with the analytics provider - see src/lib/analytics.ts.
  readonly VITE_ANALYTICS_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.svelte' {
  import type { SvelteComponent } from 'svelte';
  const component: new (options: { target: HTMLElement; props?: Record<string, any> }) => SvelteComponent;
  export default component;
}
