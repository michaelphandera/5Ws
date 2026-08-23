<script setup>
// Shared bar chart with the house mark spec: thin bars, 4px rounded data-ends,
// recessive grid, tooltips on hover, no legend (identity lives on the axis labels).
import { computed, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const props = defineProps({
  labels: { type: Array, required: true },
  values: { type: Array, required: true },
  colors: { type: [Array, String], default: '#1d5fad' },
  horizontal: { type: Boolean, default: false },
  height: { type: Number, default: 220 },
  // Direct value labels at the data end of each bar (Malawi-style).
  showValues: { type: Boolean, default: false },
  // Full names for tooltips when axis labels are abbreviated codes.
  tooltipLabels: { type: Array, default: null },
  // Bars emit `select` with { index, label } on click (pointer cursor on hover).
  clickable: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);

const barRef = ref(null);

// Category index for a pointer position in the axis-label gutter (left of the
// plot for horizontal bars, below it for vertical), or null when outside it.
// Chart.js only dispatches onClick/onHover INSIDE the chart area, so gutter
// clicks are handled by native listeners on the wrapper (see template).
function axisLabelIndex(x, y, chart) {
  const area = chart?.chartArea;
  if (!area) return null;
  const scale = props.horizontal ? chart.scales.y : chart.scales.x;
  if (!scale) return null;
  const inGutter = props.horizontal
    ? x < area.left && y >= area.top && y <= area.bottom
    : y > area.bottom && x >= area.left && x <= area.right;
  if (!inGutter) return null;
  const index = Math.round(scale.getValueForPixel(props.horizontal ? y : x));
  return index >= 0 && index < props.labels.length ? index : null;
}

function gutterIndexFromEvent(e) {
  const chart = barRef.value?.chart;
  if (!chart) return null;
  const r = chart.canvas.getBoundingClientRect();
  return axisLabelIndex(e.clientX - r.x, e.clientY - r.y, chart);
}
function onGutterClick(e) {
  if (!props.clickable) return;
  const index = gutterIndexFromEvent(e);
  if (index != null) emit('select', { index, label: props.labels[index] });
}
function onGutterMove(e) {
  if (!props.clickable) return;
  const chart = barRef.value?.chart;
  if (!chart) return;
  // Inside the chart area Chart.js's own onHover owns the cursor.
  const r = chart.canvas.getBoundingClientRect();
  const x = e.clientX - r.x;
  const y = e.clientY - r.y;
  const a = chart.chartArea;
  if (a && x >= a.left && x <= a.right && y >= a.top && y <= a.bottom) return;
  chart.canvas.style.cursor = axisLabelIndex(x, y, chart) != null ? 'pointer' : 'default';
}

// Inline plugin: draws each bar's value just past its data end.
const valueLabels = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    if (!chart.options.plugins.valueLabels?.enabled) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    ctx.fillStyle = '#556070';
    ctx.font = '600 10.5px Inter, sans-serif';
    meta.data.forEach((bar, i) => {
      const v = values[i];
      if (v == null) return;
      if (chart.options.indexAxis === 'y') {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(v.toLocaleString(), bar.x + 5, bar.y);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(v.toLocaleString(), bar.x, bar.y - 4);
      }
    });
    ctx.restore();
  },
};

const data = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      backgroundColor: props.colors,
      borderRadius: 4,
      borderSkipped: false,
      maxBarThickness: 22,
      categoryPercentage: 0.7,
    },
  ],
}));

const options = computed(() => {
  const valueAxis = {
    grid: { color: '#eef0f3', drawTicks: false },
    border: { display: false },
    ticks: { color: '#8a93a2', font: { size: 11 }, precision: 0 },
    beginAtZero: true,
  };
  const categoryAxis = {
    grid: { display: false },
    border: { display: false },
    ticks: { color: '#556070', font: { size: 11.5 } },
  };
  return {
    indexAxis: props.horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    // Instant paint — dashboards shouldn't make readers wait on entry animations
    // (and throttled background tabs never finish them).
    animation: false,
    // Leave room for the end-of-bar labels.
    layout: props.showValues ? (props.horizontal ? { padding: { right: 26 } } : { padding: { top: 16 } }) : {},
    onClick: (evt, elements) => {
      if (!props.clickable || !elements.length) return;
      const index = elements[0].index;
      emit('select', { index, label: props.labels[index] });
    },
    onHover: (evt, elements) => {
      const el = evt.native?.target;
      if (el) el.style.cursor = props.clickable && elements.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      valueLabels: { enabled: props.showValues },
      tooltip: {
        backgroundColor: '#17263c',
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        padding: 8,
        displayColors: false,
        callbacks: props.tooltipLabels
          ? { title: (items) => props.tooltipLabels[items[0].dataIndex] ?? items[0].label }
          : {},
      },
    },
    scales: props.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
  };
});
</script>

<template>
  <div
    :style="{ height: height + 'px', position: 'relative' }"
    @click="onGutterClick"
    @mousemove="onGutterMove"
  >
    <Bar ref="barRef" :data="data" :options="options" :plugins="[valueLabels]" />
  </div>
</template>
