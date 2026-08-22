<script setup>
import CrudAdmin from '../../components/common/CrudAdmin.vue';

const columns = [
  { key: 'label', label: 'Category' },
  { key: 'key', label: 'Key' },
  { key: 'gender', label: 'Gender', render: (c) => c.gender || '—' },
  {
    key: 'ageMin',
    label: 'Age range',
    render: (c) =>
      c.ageMin == null && c.ageMax == null
        ? '—'
        : `${c.ageMin ?? 0}–${c.ageMax == null ? '+' : c.ageMax}`,
  },
  { key: 'crossCutting', label: 'Cross-cutting', render: (c) => (c.crossCutting ? 'Yes' : 'No') },
  { key: 'hxlAttribute', label: 'HXL' },
  { key: 'order', label: 'Order' },
];

const fields = [
  { key: 'label', label: 'Label (shown on forms and exports, e.g. "Girls (0–14)")', required: true },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: () => [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      { value: 'other', label: 'Other' },
    ],
  },
  { key: 'ageMin', label: 'Age from', type: 'number' },
  { key: 'ageMax', label: 'Age to (blank = open-ended, e.g. 60+)', type: 'number' },
  {
    key: 'crossCutting',
    label: 'Cross-cutting? (overlaps other categories, e.g. disability — excluded from totals sum)',
    type: 'select',
    options: () => [
      { value: false, label: 'No — part of the gender/age breakdown' },
      { value: true, label: 'Yes — cross-cutting (e.g. disability)' },
    ],
  },
  { key: 'hxlAttribute', label: 'HXL attribute (auto-derived if blank, e.g. +f+children)' },
  { key: 'order', label: 'Display order', type: 'number' },
];
</script>

<template>
  <CrudAdmin
    title="Disaggregations"
    subtitle="Demographic categories used to break down beneficiaries — labels, gender and age ranges are defined here, not hardcoded"
    resource="disaggregations"
    :columns="columns"
    :fields="fields"
  />
</template>
