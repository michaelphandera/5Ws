<script setup>
import CrudAdmin from '../../components/common/CrudAdmin.vue';

// Must match backend/src/models/InformComponent.js INFORM_DIMENSIONS.
const DIMENSIONS = ['Hazards & Exposure', 'Vulnerability', 'Lack of Coping Capacity'];

const columns = [
  { key: 'dimension', label: 'Dimension' },
  { key: 'category', label: 'Category' },
  { key: 'name', label: 'Component' },
];
const fields = [
  {
    key: 'dimension',
    label: 'INFORM dimension',
    type: 'select',
    required: true,
    options: () => DIMENSIONS.map((d) => ({ value: d, label: d })),
  },
  { key: 'category', label: 'Category (e.g. Natural, Infrastructure)', required: true },
  { key: 'name', label: 'Component (e.g. Flood)', required: true },
  { key: 'order', label: 'Sort order', type: 'number' },
];
</script>

<template>
  <CrudAdmin
    title="INFORM Components"
    subtitle="INFORM risk-model taxonomy — activities tag the component whose risk they reduce (dimension > category > component)"
    resource="inform-components"
    :columns="columns"
    :fields="fields"
  />
</template>
