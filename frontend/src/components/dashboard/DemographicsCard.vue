<script setup>
// "For Whom": targeted beneficiaries per disaggregation category, built from the
// admin-defined categories, with headline shares.
import { computed } from 'vue';

const props = defineProps({
  demographics: { type: Object, required: true }, // {categories, targeted}
  // Rows emit `select` with { key, label } on click; activeKey highlights the applied filter.
  clickable: { type: Boolean, default: false },
  activeKey: { type: String, default: '' },
});

const emit = defineEmits(['select']);

const GENDER_COLORS = { female: '#a23a82', male: '#1d5fad', other: '#0f766e', null: '#64748b' };

const rows = computed(() => {
  const d = props.demographics;
  return (d.categories || []).map((c) => ({
    ...c,
    targeted: (d.targeted || {})[c.key] || 0,
    color: GENDER_COLORS[c.gender] || GENDER_COLORS.null,
  }));
});

const maxVal = computed(() => Math.max(1, ...rows.value.map((r) => r.targeted)));

const anyData = computed(() => rows.value.some((r) => r.targeted));

const stats = computed(() => {
  const gendered = rows.value.filter((r) => !r.crossCutting && r.gender);
  const targetedGendered = gendered.reduce((s, r) => s + r.targeted, 0);
  const female = gendered.filter((r) => r.gender === 'female').reduce((s, r) => s + r.targeted, 0);
  const nonCross = rows.value.filter((r) => !r.crossCutting);
  const targetedAll = nonCross.reduce((s, r) => s + r.targeted, 0);
  const children = rows.value
    .filter((r) => !r.crossCutting && r.ageMax != null && r.ageMax <= 17)
    .reduce((s, r) => s + r.targeted, 0);
  return {
    pctFemale: targetedGendered ? Math.round((female / targetedGendered) * 100) : null,
    pctChildren: targetedAll ? Math.round((children / targetedAll) * 100) : null,
  };
});
</script>

<template>
  <div>
    <div v-if="!anyData" class="empty" style="padding: 28px 12px">
      No disaggregated data reported yet for the current filters.
    </div>
    <template v-else>
      <div class="demo-stats">
        <div v-if="stats.pctFemale != null"><b>{{ stats.pctFemale }}%</b> female</div>
        <div v-if="stats.pctChildren != null"><b>{{ stats.pctChildren }}%</b> children</div>
      </div>

      <component
        :is="clickable ? 'button' : 'div'"
        v-for="r in rows"
        :key="r.key"
        class="demo-row"
        :class="{ 'demo-click': clickable, 'demo-active': activeKey && activeKey === r.key }"
        :type="clickable ? 'button' : undefined"
        :title="clickable ? `Filter by ${r.label}` : undefined"
        @click="clickable && emit('select', { key: r.key, label: r.label })"
      >
        <div class="demo-label">
          <span class="gdot" :style="{ background: r.color }"></span>
          {{ r.label }}
          <span v-if="r.crossCutting" class="muted" style="font-size: 10.5px">(cross-cutting)</span>
        </div>
        <div class="demo-bar" :title="`Targeted ${r.targeted.toLocaleString()}`">
          <div class="fill" :style="{ width: (r.targeted / maxVal) * 100 + '%', background: r.color }"></div>
        </div>
        <div class="demo-nums">{{ r.targeted.toLocaleString() }}</div>
      </component>

      <div class="demo-legend muted">
        <span><span class="gdot" style="background: #a23a82"></span>Female</span>
        <span><span class="gdot" style="background: #1d5fad"></span>Male</span>
        <span><span class="gdot" style="background: #64748b"></span>Not gender-specific</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.demo-stats {
  display: flex; gap: 20px; flex-wrap: wrap;
  padding: 8px 0 14px; font-size: 13px; color: var(--ink-2);
}
.demo-stats b { font-size: 17px; color: var(--ink); font-variant-numeric: tabular-nums; }
.demo-row {
  display: grid; grid-template-columns: 168px 1fr 96px;
  gap: 10px; align-items: center; margin-bottom: 8px; font-size: 12.5px;
}
/* Rows double as filter toggles when the card is clickable. */
button.demo-row {
  background: none; border: none; font: inherit; text-align: inherit;
  cursor: pointer; width: 100%; padding: 2px 4px; margin: 0 -4px 6px;
  border-radius: 6px;
}
.demo-click:hover { background: var(--gray-100, #f1f4f8); }
.demo-active { background: rgba(29, 95, 173, 0.08); }
.demo-active .demo-label { color: var(--ink, #17263c); }
.demo-label { color: var(--ink-2); font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.demo-bar { position: relative; height: 14px; background: var(--gray-100); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.demo-bar .fill { position: absolute; top: 2px; left: 2px; height: 8px; border-radius: 3px; }
.demo-nums { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.demo-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; font-size: 11.5px; align-items: center; }
.demo-legend span { display: inline-flex; align-items: center; gap: 5px; }
</style>
