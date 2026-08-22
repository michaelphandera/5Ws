<script setup>
import CrudAdmin from '../../components/common/CrudAdmin.vue';
import { useLookupsStore } from '../../stores/lookups';

const lookups = useLookupsStore();
const columns = [
  { key: 'name', label: 'Name' },
  { key: 'sector', label: 'Sector (optional)' },
];
const fields = [
  { key: 'name', label: 'Name', required: true },
  {
    key: 'sector',
    label: 'Sector (optional)',
    type: 'select',
    options: () => lookups.sectors.map((s) => ({ value: s._id, label: s.name })),
  },
];
</script>

<template>
  <CrudAdmin
    title="Activity Types"
    subtitle="The kinds of work organizations report — training, campaigns, service delivery…"
    resource="activity-types"
    :columns="columns"
    :fields="fields"
  />
</template>
