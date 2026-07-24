<script setup>
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 16 } })
const ICONS = {
  back: '<path d="M15 6l-6 6 6 6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  code: '<path d="M8 7l-4.5 5L8 17"/><path d="M16 7l4.5 5L16 17"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13.5V18a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 18V9a1.5 1.5 0 011.5-1.5H11"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.8"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.8"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.8"/><path d="M14 14h2.5v2.5H14zM18 14h2.5v2.5H18zM14 18h2.5v2.5H14zM18 18h2.5v2.5H18z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 6.5l.45 1.05L13.5 8l-1.05.45L12 9.5l-.45-1.05L10.5 8l1.05-.45z" fill="currentColor" stroke="none"/>',
  warn: '<path d="M10.3 4.2L2.5 17.5a1.8 1.8 0 001.5 2.7h16a1.8 1.8 0 001.5-2.7L13.7 4.2a1.9 1.9 0 00-3.4 0z"/><path d="M12 9.5v4"/><circle cx="12" cy="16.5" r=".9" fill="currentColor" stroke="none"/>',
  safe: '<path d="M12 21.5s7.5-3.7 7.5-9.5V5.5L12 2.7 4.5 5.5V12c0 5.8 7.5 9.5 7.5 9.5z"/><path d="M12 7.5l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="currentColor" stroke="none"/>',
  refresh: '<path d="M20.5 5v5h-5"/><path d="M3.5 12a8.5 8.5 0 0114.5-6l2.5 4"/><path d="M3.5 19v-5h5"/><path d="M20.5 12A8.5 8.5 0 016 18l-2.5-4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  group: '<circle cx="9" cy="7.5" r="3"/><circle cx="17" cy="8.5" r="2.2"/><path d="M2.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"/><path d="M17.5 14.2c2.3.3 4 2 4 4.3"/>',
  robot: '<path d="M12 2.5v2.5"/><path d="M12 2.5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor" stroke="none"/><rect x="4" y="7" width="16" height="12" rx="4"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><path d="M9.5 15.5c.7.7 1.6 1 2.5 1s1.8-.3 2.5-1"/>',
}
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[name] || ''" />
</template>
