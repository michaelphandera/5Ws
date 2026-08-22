<script setup>
// One "Export" button opening a small menu — replaces rows of per-format buttons.
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Icon from './Icon.vue';

defineProps({
  label: { type: String, default: 'Export' },
  items: { type: Array, required: true }, // [{ label, icon?, run }]
});

const open = ref(false);
const root = ref(null);

function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));

function pick(item) {
  open.value = false;
  item.run();
}
</script>

<template>
  <div ref="root" class="export-menu">
    <button class="btn" :aria-expanded="open" @click="open = !open">
      <Icon name="download" /> {{ label }} <span class="caret">▾</span>
    </button>
    <div v-if="open" class="menu">
      <button v-for="item in items" :key="item.label" type="button" class="menu-item" @click="pick(item)">
        <Icon :name="item.icon || 'download'" :size="13" /> {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.export-menu { position: relative; display: inline-block; }
.caret { font-size: 10px; color: var(--ink-3, #8b96a9); margin-left: -2px; }
.menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 60;
  min-width: 200px; padding: 4px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e4e7ec);
  border-radius: var(--radius-sm, 7px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(16, 29, 49, 0.14));
}
.menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 7px 10px; border: none; background: none; border-radius: 5px;
  font: inherit; font-size: 13px; font-weight: 500; color: var(--ink, #1c2534);
  cursor: pointer; text-align: left; white-space: nowrap;
}
.menu-item:hover { background: var(--gray-100, #eef0f3); }
.menu-item .icon { color: var(--ink-3, #8b96a9); flex-shrink: 0; }
</style>
