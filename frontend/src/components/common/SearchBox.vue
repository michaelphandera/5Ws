<script setup>
import Icon from './Icon.vue';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Search…' },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="search-box">
    <Icon name="search" :size="14" />
    <input
      :value="modelValue"
      :placeholder="placeholder"
      type="search"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  </div>
</template>

<style scoped>
.search-box {
  display: flex; align-items: center; gap: 7px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  box-shadow: var(--shadow-sm);
}
.search-box .icon { color: var(--ink-3); flex-shrink: 0; }
.search-box input { border: none; box-shadow: none; padding: 8px 0; width: 170px; }
.search-box input:focus { box-shadow: none; }
.search-box:focus-within { border-color: var(--blue-600); box-shadow: 0 0 0 3px rgba(29, 95, 173, 0.14); }
</style>
