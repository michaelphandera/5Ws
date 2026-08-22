<script setup>
import CrudAdmin from '../../components/common/CrudAdmin.vue';

const EVENT_TYPES = [
  'flood', 'cyclone', 'storm-surge', 'tsunami', 'earthquake', 'landslide',
  'drought', 'fire', 'epidemic', 'oil-spill', 'technological', 'other',
];
const label = (t) => t.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const columns = [
  { key: 'name', label: 'Event' },
  { key: 'type', label: 'Type', render: (e) => label(e.type || '') },
  { key: 'glideNumber', label: 'GLIDE No.' },
  { key: 'status', label: 'Status' },
  { key: 'startDate', label: 'Start', render: (e) => (e.startDate || '').slice(0, 10) },
  { key: 'endDate', label: 'End', render: (e) => (e.endDate || '').slice(0, 10) },
];
const fields = [
  { key: 'name', label: 'Event name', required: true },
  {
    key: 'type',
    label: 'Hazard type',
    type: 'select',
    required: true,
    options: () => EVENT_TYPES.map((t) => ({ value: t, label: label(t) })),
  },
  { key: 'glideNumber', label: 'GLIDE number (glidenumber.net, e.g. FL-2026-000123-SYC)' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    options: () => [
      { value: 'active', label: 'Active' },
      { value: 'closed', label: 'Closed' },
    ],
  },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'description', label: 'Description', type: 'textarea' },
];
</script>

<template>
  <CrudAdmin
    title="Disaster Events"
    subtitle="Emergency registry — link activities to an event to coordinate DRM response and recovery"
    resource="events"
    :columns="columns"
    :fields="fields"
  />
</template>
