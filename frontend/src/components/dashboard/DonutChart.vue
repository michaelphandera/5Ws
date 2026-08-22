<script setup>
// Malawi-style donut: big total in the hole, side legend with counts + shares.
// Colors come in with the items (status palette, gender colors, sector colors).
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';

ChartJS.register(ArcElement, Tooltip);

const props = defineProps({
  items: { type: Array, required: true }, // [{label, value, color}]
  centerLabel: { type: String, default: 'Total' },
  size: { type: Number, default: 170 },
});

const total = computed(() => props.items.reduce((s, i) => s + (i.value || 0), 0));
const rows = computed(() =>
  props.items.map((i) => ({
    ...i,
    pct: total.value ? Math.round(((i.value || 0) / total.value) * 100) : 0,
  }))
);

const data = computed(() => ({
  labels: props.items.map((i) => i.label),
  datasets: [
    {
      data: props.items.map((i) => i.value || 0),
      backgroundColor: props.items.map((i) => i.color),
      // 2px surface gap between slices.
      borderColor: '#ffffff',
      borderWidth: 2,
      hoverOffset: 4,
    },
  ],
}));

// Draws the headline total inside the hole.
const centerText = {
  id: 'centerText',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#17263c';
    ctx.font = '800 22px Inter, sans-serif';
    ctx.fillText(total.value.toLocaleString(), cx, cy + 2);
    ctx.fillStyle = '#8a93a2';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText(props.centerLabel.toUpperCase(), cx, cy + 17);
    ctx.restore();
  },
};

const options = {
  cutout: '70%',
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#17263c',
      titleFont: { size: 12 },
      bodyFont: { size: 12 },
      padding: 8,
      displayColors: false,
      callbacks: {
        label: (c) => `${c.label}: ${c.parsed.toLocaleString()}`,
      },
    },
  },
};
</script>

<template>
  <div class="donut-wrap">
    <div :style="{ width: size + 'px', height: size + 'px', position: 'relative', flexShrink: 0 }">
      <Doughnut :data="data" :options="options" :plugins="[centerText]" />
    </div>
    <div class="donut-legend">
      <div v-for="r in rows" :key="r.label" class="dl-row">
        <span class="dl-dot" :style="{ background: r.color }"></span>
        <span class="dl-label">{{ r.label }}</span>
        <span class="dl-value">{{ (r.value || 0).toLocaleString() }}</span>
        <span class="dl-pct">{{ r.pct }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.donut-wrap { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.donut-legend { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 7px; }
.dl-row {
  display: grid; grid-template-columns: 10px 1fr auto 40px;
  gap: 8px; align-items: center; font-size: 12.5px;
}
.dl-dot { width: 9px; height: 9px; border-radius: 50%; }
.dl-label { color: var(--ink-2, #4b5563); font-weight: 600; }
.dl-value { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink, #17263c); text-align: right; }
.dl-pct { color: var(--ink-3, #8a93a2); font-size: 11.5px; font-variant-numeric: tabular-nums; text-align: right; }
</style>
