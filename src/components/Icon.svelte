<!-- Icon.svelte - small shared line-icon set, no external dependency -->
<script lang="ts">
  interface Props {
    name:
      | 'overview'
      | 'entries'
      | 'activities'
      | 'calendar'
      | 'goals'
      | 'settings'
      | 'import'
      | 'info'
      | 'menu'
      | 'folder'
      | 'close'
      | 'edit'
      | 'trash'
      | 'plus'
      | 'inbox'
      | 'check'
      | 'chevron-right'
      | 'sport-running'
      | 'sport-cycling'
      | 'sport-swimming'
      | 'sport-walking'
      | 'sport-hiking'
      | 'sport-strength'
      | 'sport-cardio'
      | 'sport-climbing'
      | 'search'
      | 'undo'
      | 'trends'
      | 'records';
    size?: number;
  }

  let { name, size = 18 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'overview'}
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
    <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
  {:else if name === 'entries'}
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <line x1="8.5" y1="6" x2="20" y2="6" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <line x1="8.5" y1="12" x2="20" y2="12" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    <line x1="8.5" y1="18" x2="20" y2="18" />
  {:else if name === 'activities'}
    <polyline points="3,13 7.5,13 9.5,7 13,19 15.5,13 21,13" />
  {:else if name === 'calendar'}
    <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
    <line x1="7.5" y1="3.2" x2="7.5" y2="6.8" />
    <line x1="16.5" y1="3.2" x2="16.5" y2="6.8" />
  {:else if name === 'goals'}
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  {:else if name === 'settings'}
    <line x1="4" y1="6" x2="20" y2="6" />
    <circle cx="9" cy="6" r="2.1" fill="var(--surface)" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <circle cx="15" cy="12" r="2.1" fill="var(--surface)" />
    <line x1="4" y1="18" x2="20" y2="18" />
    <circle cx="10.5" cy="18" r="2.1" fill="var(--surface)" />
  {:else if name === 'import'}
    <path d="M12 4v11" />
    <path d="M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4.5 15.5V18a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="8.5" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
  {:else if name === 'menu'}
    <line x1="4" y1="6.5" x2="20" y2="6.5" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17.5" x2="20" y2="17.5" />
  {:else if name === 'folder'}
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l1.6 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
  {:else if name === 'check'}
    <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" />
  {:else if name === 'close'}
    <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
    <line x1="18.5" y1="5.5" x2="5.5" y2="18.5" />
  {:else if name === 'edit'}
    <path d="M4 20l0.9-4L16 4.9a1.7 1.7 0 0 1 2.4 0l0.7 0.7a1.7 1.7 0 0 1 0 2.4L8 19l-4 1Z" />
    <line x1="14.2" y1="6.7" x2="17.3" y2="9.8" />
  {:else if name === 'trash'}
    <line x1="4.5" y1="7" x2="19.5" y2="7" />
    <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
    <path d="M6.5 7l0.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  {:else if name === 'plus'}
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  {:else if name === 'inbox'}
    <path d="M4 12.5L6.5 5h11L20 12.5" />
    <path d="M4 12.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-5.5" />
    <path d="M4 12.5h5l1 2h4l1-2h5" />
  {:else if name === 'chevron-right'}
    <polyline points="9,5 16,12 9,19" />
  {:else if name === 'sport-running'}
    <circle cx="15.5" cy="4.8" r="1.7" fill="currentColor" stroke="none" />
    <path d="M13.5 8L9.5 11.5L13 14L10.5 19.5" />
    <path d="M13 14L17.5 16.5L19.5 14" />
    <path d="M11.5 9.5L7.5 8.5" />
    <path d="M13 11.5L17 10.5L19 6.5" />
  {:else if name === 'sport-cycling'}
    <circle cx="6" cy="17" r="3.3" />
    <circle cx="18" cy="17" r="3.3" />
    <path d="M6 17L10 8.5H13.5" />
    <path d="M10 8.5L14.5 17H18" />
    <path d="M13.5 8.5L15.5 5.5H18" />
  {:else if name === 'sport-swimming'}
    <circle cx="17.5" cy="5.5" r="1.7" fill="currentColor" stroke="none" />
    <path d="M9 9.5c2-1.2 4-1.2 6 0l2.5 2" />
    <path d="M3 15c1.4-1.4 2.8-1.4 4.2 0s2.8 1.4 4.2 0 2.8-1.4 4.2 0 2.8 1.4 4.2 0" />
    <path d="M3 19c1.4-1.4 2.8-1.4 4.2 0s2.8 1.4 4.2 0 2.8-1.4 4.2 0 2.8 1.4 4.2 0" />
  {:else if name === 'sport-walking'}
    <ellipse cx="9.5" cy="6.5" rx="2" ry="3" transform="rotate(-20 9.5 6.5)" />
    <ellipse cx="15" cy="16.5" rx="2" ry="3" transform="rotate(15 15 16.5)" />
  {:else if name === 'sport-hiking'}
    <circle cx="18.5" cy="5" r="1.6" />
    <path d="M2.5 19L8.5 7.5L11.5 13L13.5 9.5L19.5 19Z" />
  {:else if name === 'sport-strength'}
    <line x1="4.5" y1="12" x2="19.5" y2="12" />
    <rect x="1.5" y="9" width="3" height="6" rx="1" />
    <rect x="19.5" y="9" width="3" height="6" rx="1" />
    <rect x="4" y="10.3" width="2" height="3.4" rx="0.6" />
    <rect x="18" y="10.3" width="2" height="3.4" rx="0.6" />
  {:else if name === 'sport-cardio'}
    <path
      d="M12 19.5s-7.2-4.6-7.2-9.8c0-2.6 2-4.4 4.2-4.4 1.5 0 2.6 0.9 3 1.9 0.4-1 1.5-1.9 3-1.9 2.2 0 4.2 1.8 4.2 4.4 0 5.2-7.2 9.8-7.2 9.8Z"
    />
  {:else if name === 'sport-climbing'}
    <path d="M14.5 20L20.5 5.5" />
    <circle cx="18" cy="10" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15.7" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="7" cy="6.3" r="1.6" fill="currentColor" stroke="none" />
    <path d="M7 8.3L6 13L9.3 15.2" />
    <path d="M6 13L4.2 17.5" />
    <path d="M9.3 15.2L13.5 11" />
  {:else if name === 'search'}
    <circle cx="10.5" cy="10.5" r="6.5" />
    <line x1="15.3" y1="15.3" x2="20" y2="20" />
  {:else if name === 'trends'}
    <polyline points="3.5,17 9,11.5 13,14.5 20.5,6.5" />
    <polyline points="15.5,6.5 20.5,6.5 20.5,11.5" />
  {:else if name === 'records'}
    <path d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0Z" />
    <path d="M7.5 6.5H5a2.5 2.5 0 0 0 2.8 3.4" />
    <path d="M16.5 6.5H19a2.5 2.5 0 0 1-2.8 3.4" />
    <line x1="12" y1="14" x2="12" y2="17.5" />
    <line x1="8.5" y1="19.5" x2="15.5" y2="19.5" />
  {:else if name === 'undo'}
    <path d="M5 8.5h8.5a5.5 5.5 0 1 1 0 11H9" />
    <polyline points="8.5,4.5 5,8.5 8.5,12.5" />
  {/if}
</svg>
