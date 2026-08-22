<script setup>
// Shared bar chart with the house mark spec: thin bars, 4px rounded data-ends,
// recessive grid, tooltips on hover, no legend (identity lives on the axis labels).
import { computed } from 'vue';
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
});

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
  <div :style="{ height: height + 'px', position: 'relative' }">
    <Bar :data="data" :options="options" :plugins="[valueLabels]" />
  </div>
</template>
