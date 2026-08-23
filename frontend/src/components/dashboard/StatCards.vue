<script setup>
import { computed } from 'vue';
import Icon from '../common/Icon.vue';

const props = defineProps({
  totals: { type: Object, required: true },
  unitLabel: { type: String, default: 'units' },
  // Tiles emit `select` with a key (organizations/projects/beneficiaries/coverage) on click.
  clickable: { type: Boolean, default: false },
});
const emit = defineEmits(['select']);
const n = (v) => (v ?? 0).toLocaleString();

const coverage = computed(() =>
  props.totals.unitsTotal ? Math.round((props.totals.unitsCovered / props.totals.unitsTotal) * 100) : 0
);

const tag = computed(() => (props.clickable ? 'button' : 'div'));
const click = (key) => props.clickable && emit('select', key);
</script>

<template>
  <div class="stat-row">
    <component :is="tag" :type="clickable ? 'button' : undefined" class="stat-tile" :class="{ 'tile-click': clickable }" style="--tile-accent: #1d5fad" @click="click('organizations')">
      <div class="tile-head">
        <span class="label">Organizations</span>
        <span class="tile-icon"><Icon name="building" :size="16" /></span>
      </div>
      <div class="value">{{ n(totals.organizations) }}</div>
      <div class="sub">implementing — Who</div>
    </component>
    <component :is="tag" :type="clickable ? 'button' : undefined" class="stat-tile" :class="{ 'tile-click': clickable }" style="--tile-accent: #0f766e" @click="click('projects')">
      <div class="tile-head">
        <span class="label">Projects</span>
        <span class="tile-icon"><Icon name="folder" :size="16" /></span>
      </div>
      <div class="value">{{ n(totals.projects) }}</div>
      <div class="sub">{{ n(totals.activities) }} activities filed</div>
    </component>
    <component :is="tag" :type="clickable ? 'button' : undefined" class="stat-tile" :class="{ 'tile-click': clickable }" style="--tile-accent: #7c3a92" @click="click('beneficiaries')">
      <div class="tile-head">
        <span class="label">Beneficiaries targeted</span>
        <span class="tile-icon"><Icon name="heart" :size="16" /></span>
      </div>
      <div class="value">{{ n(totals.beneficiariesTargeted) }}</div>
      <div class="sub">across filtered projects</div>
    </component>
    <component :is="tag" :type="clickable ? 'button' : undefined" class="stat-tile" :class="{ 'tile-click': clickable }" style="--tile-accent: #b3261e" @click="click('coverage')">
      <div class="tile-head">
        <span class="label">Geographic coverage</span>
        <span class="tile-icon"><Icon name="globe" :size="16" /></span>
      </div>
      <div class="value">{{ totals.unitsCovered }}<span style="font-size: 15px; color: var(--ink-3)">/{{ totals.unitsTotal }}</span></div>
      <div class="sub">{{ coverage }}% of {{ unitLabel.toLowerCase() }}s have projects</div>
    </component>
  </div>
</template>

<style scoped>
/* Tiles double as navigation when clickable — keep the tile look, add affordance. */
button.stat-tile { font: inherit; text-align: left; cursor: pointer; }
.tile-click:hover { box-shadow: 0 2px 10px rgba(23, 38, 60, 0.1); transform: translateY(-1px); }
.tile-click { transition: box-shadow 0.15s var(--ease, ease), transform 0.15s var(--ease, ease); }
</style>
