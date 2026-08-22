<script setup>
// Multi-select of organizations as removable chips. With donorsFirst, donors are
// grouped at the top of the dropdown (used for funding sources).
import { ref, computed } from 'vue';
import { useLookupsStore } from '../../stores/lookups';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  donorsFirst: { type: Boolean, default: false },
  exclude: { type: Array, default: () => [] }, // org ids to hide (e.g. the lead org)
  placeholder: { type: String, default: 'Select organization…' },
});
const emit = defineEmits(['update:modelValue']);

const lookups = useLookupsStore();
const selected = ref('');

const available = computed(() =>
  lookups.organizations.filter(
    (o) => o.active !== false && !props.modelValue.includes(o._id) && !props.exclude.includes(o._id)
  )
);
const donors = computed(() => available.value.filter((o) => o.type === 'donor'));
const others = computed(() =>
  props.donorsFirst ? available.value.filter((o) => o.type !== 'donor') : available.value
);

function add() {
  if (!selected.value) return;
  emit('update:modelValue', [...props.modelValue, selected.value]);
  selected.value = '';
}
function remove(id) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== id));
}
function orgLabel(id) {
  const o = lookups.organizations.find((x) => x._id === id);
  return o ? o.acronym || o.name : id;
}
</script>

<template>
  <div>
    <div style="display: flex; gap: 8px">
      <select v-model="selected" @change="add">
        <option value="">{{ placeholder }}</option>
        <template v-if="donorsFirst && donors.length">
          <optgroup label="Donors">
            <option v-for="o in donors" :key="o._id" :value="o._id">{{ o.name }}</option>
          </optgroup>
          <optgroup label="Other organizations">
            <option v-for="o in others" :key="o._id" :value="o._id">{{ o.name }}</option>
          </optgroup>
        </template>
        <template v-else>
          <option v-for="o in others" :key="o._id" :value="o._id">{{ o.name }}</option>
        </template>
      </select>
    </div>
    <div v-if="modelValue.length" style="margin-top: 6px">
      <span v-for="id in modelValue" :key="id" class="chip">
        {{ orgLabel(id) }}
        <button type="button" @click="remove(id)" aria-label="Remove">×</button>
      </span>
    </div>
  </div>
</template>
