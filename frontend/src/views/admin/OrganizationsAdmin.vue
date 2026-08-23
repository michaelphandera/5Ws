<script setup>
import { ref } from 'vue';
import CrudAdmin from '../../components/common/CrudAdmin.vue';
import ImportModal from '../../components/common/ImportModal.vue';
import Icon from '../../components/common/Icon.vue';
import { useLookupsStore } from '../../stores/lookups';
import { ORG_TYPES, orgTypeLabel } from '../../utils/orgTypes';

const lookups = useLookupsStore();
const importing = ref(false);
let reloadList = null;
function imported() {
  importing.value = false;
  if (reloadList) reloadList();
  lookups.load(true);
}
const columns = [
  { key: 'name', label: 'Name' },
  { key: 'acronym', label: 'Acronym' },
  { key: 'type', label: 'Type', render: (o) => orgTypeLabel(o.type) },
  { key: 'registrationNo', label: 'Reg. No.' },
  { key: 'commission', label: 'Primary sector' },
  { key: 'hqDistrict', label: 'HQ district' },
  { key: 'contactPerson', label: 'Contact' },
  { key: 'emails', label: 'Email', render: (o) => (o.emails || []).join(', ') },
  { key: 'phones', label: 'Phone', render: (o) => (o.phones || []).join(', ') },
  { key: 'location', label: 'Map point', render: (o) => (o.location?.lat != null ? '✓' : '') },
];
const fields = [
  { key: 'name', label: 'Name', required: true },
  { key: 'acronym', label: 'Acronym' },
  {
    key: 'type',
    label: 'Organization type',
    type: 'select',
    required: true,
    options: () => ORG_TYPES,
  },
  { key: 'registrationNo', label: 'Registration No. (Registrar of Associations)' },
  {
    key: 'hqDistrict',
    label: 'HQ district',
    type: 'select',
    options: () =>
      lookups.locations
        .filter((l) => l.level === 2 && l.active !== false)
        .map((l) => ({ value: l._id, label: `${l.name}${l.code ? ` (${l.code})` : ''}` })),
  },
  { key: 'aim', label: 'Aim', type: 'textarea' },
  { key: 'description', label: 'Description (public-facing)', type: 'textarea' },
  { key: 'dateFounded', label: 'Date founded' },
  { key: 'chairperson', label: 'Chairperson' },
  { key: 'contactPerson', label: 'Contact person' },
  { key: 'emails', label: 'Emails (comma-separated)', type: 'list' },
  { key: 'phones', label: 'Phones (comma-separated)', type: 'list' },
  { key: 'postalAddress', label: 'Postal address' },
  { key: 'physicalAddress', label: 'Physical address' },
  { key: 'webpage', label: 'Website / social' },
  {
    key: 'commission',
    label: 'Primary sector (commission)',
    type: 'select',
    options: () => lookups.sectors.map((s) => ({ value: s._id, label: s.name })),
  },
  {
    key: 'otherSectors',
    label: 'Also works in (hold Ctrl to select several)',
    type: 'multiselect',
    options: () => lookups.sectors.map((s) => ({ value: s._id, label: s.name })),
  },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];
</script>

<template>
  <CrudAdmin
    title="Organizations"
    subtitle="The “Who” registry — implementers, donors, government and other partners. Map points are set on each organization's profile page."
    resource="organizations"
    :columns="columns"
    :fields="fields"
  >
    <template #actions="{ reload }">
      <button class="btn" @click="reloadList = reload; importing = true"><Icon name="plus" /> Import CSV</button>
    </template>
  </CrudAdmin>

  <ImportModal
    v-if="importing"
    title="Import organizations from CSV"
    entityLabel="organizations"
    templateUrl="/import/organizations/template.xlsx"
    uploadUrl="/import/organizations"
    @close="importing = false"
    @imported="imported"
  />
</template>
