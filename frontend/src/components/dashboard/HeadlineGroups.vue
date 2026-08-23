<script setup>
// Headline "for Whom" tiles: Men / Women / Children / Elderly / Special Needs.
// Derived from the admin-defined category metadata (gender + age bands +
// crossCutting), not hardcoded keys, so renamed or added categories keep working.
import { computed } from 'vue';

const props = defineProps({
  demographics: { type: Object, default: null }, // { categories: [...], targeted: {key: n} }
});

const groups = computed(() => {
  const d = props.demographics || {};
  const t = d.targeted || {};
  const cats = d.categories || [];
  const sum = (pred) => cats.filter(pred).reduce((s, c) => s + (t[c.key] || 0), 0);
  const nc = (c) => !c.crossCutting;
  const isChild = (c) => c.ageMax != null && c.ageMax <= 17;
  const isElderly = (c) => c.ageMin != null && c.ageMin >= 60;
  // The cross-cutting tile is labeled by its own category ("Special Needs").
  const crossLabel = cats.find((c) => c.crossCutting)?.label || 'Special Needs';
  return [
    { label: 'Men', value: sum((c) => nc(c) && c.gender === 'male' && !isChild(c) && !isElderly(c)) },
    { label: 'Women', value: sum((c) => nc(c) && c.gender === 'female' && !isChild(c) && !isElderly(c)) },
    { label: 'Children', value: sum((c) => nc(c) && isChild(c)) },
    { label: 'Elderly', value: sum((c) => nc(c) && isElderly(c)) },
    { label: crossLabel, value: sum((c) => c.crossCutting) },
  ];
});
</script>

<template>
  <div class="hg-row">
    <div v-for="g in groups" :key="g.label" class="hg-tile">
      <div class="hg-value">{{ (g.value || 0).toLocaleString() }}</div>
      <div class="hg-label">{{ g.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.hg-row {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  margin-bottom: 12px;
}
@media (max-width: 700px) { .hg-row { grid-template-columns: repeat(3, 1fr); } }
.hg-tile {
  background: var(--gray-100, #f1f4f8);
  border: 1px solid var(--border, #e3e8ef);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}
.hg-value { font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; color: var(--ink, #17263c); }
.hg-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-3, #6b7280); margin-top: 2px; }
</style>
