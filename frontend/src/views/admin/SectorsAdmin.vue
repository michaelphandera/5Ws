<script setup>
import CrudAdmin from '../../components/common/CrudAdmin.vue';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
  { key: 'color', label: 'Color' },
  { key: 'description', label: 'Description' },
];
const fields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'code', label: 'Code (short)', required: true },
  { key: 'color', label: 'Chart color', type: 'color' },
  { key: 'description', label: 'Description', type: 'textarea' },
];
</script>

<template>
  <CrudAdmin
    title="Sectors"
    subtitle="Clusters of work — the “What” dimension; colors are used across charts and the map"
    resource="sectors"
    :columns="columns"
    :fields="fields"
  />
</template>
