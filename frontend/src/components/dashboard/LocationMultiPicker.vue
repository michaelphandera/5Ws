<script setup>
// Multi-select of locations as removable chips, grouped by admin level.
// Prop-driven (no lookups store) so the unauthenticated public page can feed it
// the option lists shipped with /api/public/summary.
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] }, // location ids
  locations: { type: Array, default: () => [] }, // [{_id, name, level}]
  levels: { type: Array, default: () => [] }, // [{level, name}]
  placeholder: { type: String, default: 'All areas' },
});
const emit = defineEmits(['update:modelValue']);

const selected = ref('');

const selectedSet = computed(() => new Set(props.modelValue.map(String)));

const byLevel = computed(() => {
  const groups = [];
  for (const lvl of props.levels) {
    const items = props.locations.filter(
      (l) => l.level === lvl.level && !selectedSet.value.has(String(l._id))
    );
    if (items.length) groups.push({ ...lvl, items });
  }
  return groups;
});

function add() {
  if (!selected.value) return;
  emit('update:modelValue', [...props.modelValue, selected.value]);
  selected.value = '';
}
function remove(id) {
  emit('update:modelValue', props.modelValue.filter((x) => String(x) !== String(id)));
}
function locLabel(id) {
  const l = props.locations.find((x) => String(x._id) === String(id));
  return l ? l.name : id;
}
</script>

<template>
  <div class="lmp">
    <select v-model="selected" @change="add">
      <option value="">{{ modelValue.length ? 'Add another area…' : placeholder }}</option>
      <optgroup v-for="g in byLevel" :key="g.level" :label="g.name">
        <option v-for="l in g.items" :key="l._id" :value="l._id">{{ l.name }}</option>
      </optgroup>
    </select>
    <div v-if="modelValue.length" class="lmp-chips">
      <span v-for="id in modelValue" :key="id" class="chip">
        {{ locLabel(id) }}
        <button type="button" @click="remove(id)" aria-label="Remove">×</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.lmp-chips { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
</style>
