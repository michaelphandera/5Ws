<script setup>
import { computed } from 'vue';
import Icon from '../common/Icon.vue';

const props = defineProps({
  totals: { type: Object, required: true },
  unitLabel: { type: String, default: 'units' },
});
const n = (v) => (v ?? 0).toLocaleString();

const coverage = computed(() =>
  props.totals.unitsTotal ? Math.round((props.totals.unitsCovered / props.totals.unitsTotal) * 100) : 0
);
</script>

<template>
  <div class="stat-row">
    <div class="stat-tile" style="--tile-accent: #1d5fad">
      <div class="tile-head">
        <span class="label">Organizations</span>
        <span class="tile-icon"><Icon name="building" :size="16" /></span>
      </div>
      <div class="value">{{ n(totals.organizations) }}</div>
      <div class="sub">implementing — Who</div>
    </div>
    <div class="stat-tile" style="--tile-accent: #0f766e">
      <div class="tile-head">
        <span class="label">Projects</span>
        <span class="tile-icon"><Icon name="folder" :size="16" /></span>
      </div>
      <div class="value">{{ n(totals.projects) }}</div>
      <div class="sub">{{ n(totals.activities) }} activities filed</div>
    </div>
    <div class="stat-tile" style="--tile-accent: #7c3a92">
      <div class="tile-head">
        <span class="label">Beneficiaries targeted</span>
        <span class="tile-icon"><Icon name="heart" :size="16" /></span>
      </div>
      <div class="value">{{ n(totals.beneficiariesTargeted) }}</div>
      <div class="sub">across filtered projects</div>
    </div>
    <div class="stat-tile" style="--tile-accent: #b3261e">
      <div class="tile-head">
        <span class="label">Geographic coverage</span>
        <span class="tile-icon"><Icon name="globe" :size="16" /></span>
      </div>
      <div class="value">{{ totals.unitsCovered }}<span style="font-size: 15px; color: var(--ink-3)">/{{ totals.unitsTotal }}</span></div>
      <div class="sub">{{ coverage }}% of {{ unitLabel.toLowerCase() }}s have projects</div>
    </div>
  </div>
</template>
