<script setup>
// Organization directory — visible to every authenticated user (the admin CRUD
// lives separately under Admin > Organizations).
import { ref, computed, onMounted } from 'vue';
import api from '../api/client';
import Icon from '../components/common/Icon.vue';
import SearchBox from '../components/common/SearchBox.vue';
import Pager from '../components/common/Pager.vue';
import ExportMenu from '../components/common/ExportMenu.vue';
import { useLookupsStore } from '../stores/lookups';
import { useClientTable } from '../composables/clientTable';
import { downloadCsv, exportFilename } from '../utils/csv';
import { ORG_TYPES, orgTypeLabel } from '../utils/orgTypes';

const lookups = useLookupsStore();
const orgs = ref([]);
const loading = ref(false);
const typeFilter = ref('');
const commissionFilter = ref('');

onMounted(async () => {
  loading.value = true;
  try {
    const [{ data }] = await Promise.all([api.get('/organizations'), lookups.load()]);
    orgs.value = data;
  } finally {
    loading.value = false;
  }
});

const visible = computed(() =>
  orgs.value.filter(
    (o) =>
      o.active !== false &&
      (!typeFilter.value || o.type === typeFilter.value) &&
      (!commissionFilter.value || (o.commission?._id || o.commission) === commissionFilter.value)
  )
);

const { q, page, pages, filtered, paged } = useClientTable(visible, {
  searchText: (o) =>
    [o.name, o.acronym, orgTypeLabel(o.type), o.commission?.name, ...(o.emails || []), ...(o.phones || [])]
      .filter(Boolean)
      .join(' '),
});

function exportCsv() {
  downloadCsv(
    exportFilename('Organizations', 'csv'),
    ['Name', 'Acronym', 'Type', 'Commission / Sector', 'Email', 'Phone', 'Webpage'],
    filtered.value.map((o) => [
      o.name,
      o.acronym || '',
      orgTypeLabel(o.type),
      o.commission?.name || '',
      (o.emails || []).join('; '),
      (o.phones || []).join('; '),
      o.webpage || '',
    ])
  );
}

// Server-built files: full-profile Excel, and KML that opens in Google Earth.
function downloadServerFile(path, filename) {
  api.get(path, { responseType: 'blob' }).then((res) => {
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Organizations</h1>
        <p class="lede">The “Who” directory — {{ visible.length }} active organizations</p>
      </div>
      <div class="head-actions">
        <SearchBox v-model="q" placeholder="Search organizations…" />
        <ExportMenu
          :items="[
            { label: 'Excel (.xlsx)', run: () => downloadServerFile('/export/organizations.xlsx', exportFilename('Organizations', 'xlsx')) },
            { label: 'CSV (.csv)', run: exportCsv },
            { label: 'Google Earth (.kml)', icon: 'globe', run: () => downloadServerFile('/export/organizations.kml', exportFilename('Organizations', 'kml')) },
          ]"
        />
      </div>
    </div>

    <div class="card">
      <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap">
        <select v-model="typeFilter" style="max-width: 240px">
          <option value="">All types</option>
          <option v-for="t in ORG_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <select v-model="commissionFilter" style="max-width: 260px">
          <option value="">All commissions / sectors</option>
          <option v-for="s in lookups.sectors" :key="s._id" :value="s._id">{{ s.name }}</option>
        </select>
      </div>

      <div v-if="loading" class="spinner">Loading…</div>
      <div v-else-if="!filtered.length" class="empty">
        <div class="empty-icon"><Icon name="search" :size="20" /></div>
        <div><b>No organizations match the current filters.</b></div>
      </div>
      <div v-else class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Acronym</th>
              <th>Type</th>
              <th>Commission / Sector</th>
              <th>Contact</th>
              <th style="width: 60px; text-align: center" title="Has a map location">Map</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in paged" :key="o._id">
              <td>
                <router-link :to="{ name: 'organization-profile', params: { id: o._id } }" style="font-weight: 600">
                  {{ o.name }}
                </router-link>
              </td>
              <td>{{ o.acronym }}</td>
              <td>{{ orgTypeLabel(o.type) }}</td>
              <td>{{ o.commission?.name || '—' }}</td>
              <td class="muted" style="font-size: 12px">
                {{ (o.emails || [])[0] || (o.phones || [])[0] || '—' }}
              </td>
              <td style="text-align: center">
                <Icon v-if="o.location?.lat != null" name="pin" :size="14" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
    </div>
  </div>
</template>
