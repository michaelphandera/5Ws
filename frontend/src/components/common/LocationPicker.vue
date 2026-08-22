<script setup>
// Cascading location picker (level names come from AdminLevelConfig — never hardcoded).
// Multi-select: picking at any level adds that unit as a chip.
import { ref, computed } from 'vue';
import { useLookupsStore } from '../../stores/lookups';

const props = defineProps({
  modelValue: { type: Array, default: () => [] }, // array of location ids
  multiple: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue']);

const lookups = useLookupsStore();
const selectedByLevel = ref({ 1: '', 2: '', 3: '' });

const levels = computed(() => lookups.adminLevelConfig.levels || []);

function optionsForLevel(level) {
  const parentId = level === 1 ? null : selectedByLevel.value[level - 1] || null;
  return lookups.locations.filter(
    (l) => l.level === level && l.active !== false && (level === 1 || l.parent === parentId)
  );
}

function onLevelChange(level) {
  for (const lv of levels.value.map((l) => l.level)) {
    if (lv > level) selectedByLevel.value[lv] = '';
  }
}

const deepestSelected = computed(() => {
  const lvls = levels.value.map((l) => l.level).sort((a, b) => b - a);
  for (const lv of lvls) if (selectedByLevel.value[lv]) return selectedByLevel.value[lv];
  return '';
});

function add() {
  const id = deepestSelected.value;
  if (!id) return;
  if (props.modelValue.includes(id)) return;
  emit('update:modelValue', props.multiple ? [...props.modelValue, id] : [id]);
}

function remove(id) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== id));
}

function locationLabel(id) {
  const loc = lookups.locationById[id];
  if (!loc) return id;
  if (loc.parent) {
    const parent = lookups.locationById[loc.parent];
    return parent ? `${parent.name} / ${loc.name}` : loc.name;
  }
  return loc.name;
}
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 8px">
      <label v-for="lv in levels" :key="lv.level" class="field">
        <span>{{ lv.name }}</span>
        <select v-model="selectedByLevel[lv.level]" @change="onLevelChange(lv.level)">
          <option value="">—</option>
          <option v-for="o in optionsForLevel(lv.level)" :key="o._id" :value="o._id">{{ o.name }}</option>
        </select>
      </label>
      <button type="button" class="btn" :disabled="!deepestSelected" @click="add">Add</button>
    </div>
    <div v-if="modelValue.length">
      <span v-for="id in modelValue" :key="id" class="chip">
        {{ locationLabel(id) }}
        <button type="button" @click="remove(id)" aria-label="Remove">×</button>
      </span>
    </div>
    <p v-else class="muted" style="font-size: 12.5px">No locations selected yet.</p>
  </div>
</template>
