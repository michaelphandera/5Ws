<script setup>
// Inline SVG icon set (Lucide outlines, 24-unit grid, stroke-based).
const PATHS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  folder: 'M4 4h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  building: 'M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M3 21h18M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2',
  tag: 'M12 2H4a2 2 0 0 0-2 2v8l10 10 10-10L12 2zM7.5 7.5h.01',
  pin: 'M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  shapes: 'M8.3 10 12 3l3.7 7H8.3zM17.5 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 14h7v7H3z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M15.5 3.13a4 4 0 0 1 0 7.75',
  userCog: 'M10 15H7a4 4 0 0 0-4 4v2M10.5 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM10.5 7a4 4 0 1 0 -8 0 4 4 0 0 0 8 0zM17.5 17.5m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M17.5 12.5v2M17.5 20.5v2M21.8 15l-1.7 1M15.1 19l-1.7 1M13.4 15l1.7 1M20.1 19l1.7 1',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  edit: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5L22 3z',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  chart: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18',
  heart: 'M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7 7-7z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
};
defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
});
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name] || ''" />
  </svg>
</template>
