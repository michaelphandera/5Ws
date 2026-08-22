<script setup>
import CrudAdmin from '../../components/common/CrudAdmin.vue';

// Human-readable summary of a group's demographic bounds, e.g. "female · 18+", "15–35", "any".
function appliesTo(g) {
  const parts = [];
  if (g.gender) parts.push(g.gender);
  if (g.ageMin != null && g.ageMax != null) parts.push(`${g.ageMin}–${g.ageMax}`);
  else if (g.ageMin != null) parts.push(`${g.ageMin}+`);
  else if (g.ageMax != null) parts.push(`0–${g.ageMax}`);
  return parts.join(' · ') || 'any';
}

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'appliesTo', label: 'Applies to', render: appliesTo },
];
const fields = [
  { key: 'name', label: 'Name', required: true },
  {
    key: 'gender',
    label: 'Gender (blank = any)',
    type: 'select',
    options: () => [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
    ],
  },
  { key: 'ageMin', label: 'Age from (blank = any)', type: 'number' },
  { key: 'ageMax', label: 'Age to (blank = any)', type: 'number' },
];
</script>

<template>
  <CrudAdmin
    title="Beneficiary Groups"
    subtitle="Target populations — the “for Whom” dimension; optional gender/age bounds constrain the disaggregation grid in the activity form"
    resource="beneficiary-groups"
    :columns="columns"
    :fields="fields"
  />
</template>
