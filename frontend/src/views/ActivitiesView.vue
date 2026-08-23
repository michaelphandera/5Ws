<script setup>
import { ref, onMounted } from 'vue';
import api from '../api/client';
import ConfirmDialog from '../components/common/ConfirmDialog.vue';
import Icon from '../components/common/Icon.vue';
import SearchBox from '../components/common/SearchBox.vue';
import Pager from '../components/common/Pager.vue';
import ImportModal from '../components/common/ImportModal.vue';
import ExportMenu from '../components/common/ExportMenu.vue';
import { useAuthStore } from '../stores/auth';
import { useLookupsStore } from '../stores/lookups';
import { useToast } from '../composables/toast';
import { exportFilename } from '../utils/csv';

const toast = useToast();

const auth = useAuthStore();
const lookups = useLookupsStore();

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pages = ref(1);
const loading = ref(false);
const deleting = ref(null);

const filters = ref({ organization: '', sector: '', status: '', location: '' });
const q = ref('');
let qTimer = null;
function qChanged() {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => load(), 300);
}

async function load(p = 1) {
  loading.value = true;
  page.value = p;
  try {
    const params = { page: p, limit: 25 };
    if (q.value.trim()) params.q = q.value.trim();
    for (const [k, v] of Object.entries(filters.value)) if (v) params[k] = v;
    const { data } = await api.get('/activities', { params });
    items.value = data.items;
    total.value = data.total;
    pages.value = data.pages;
  } finally {
    loading.value = false;
  }
}
onMounted(() => load());

function canEdit(a) {
  return auth.isAdmin || a.organization?._id === auth.myOrgId;
}

async function doDelete() {
  try {
    await api.delete(`/activities/${deleting.value._id}`);
    toast.success('Activity deleted');
    deleting.value = null;
    await load(page.value);
  } catch (e) {
    deleting.value = null;
    toast.error(e.response?.data?.error || 'Delete failed');
  }
}

function exportMatrix(fmt) {
  const params = new URLSearchParams();
  if (q.value.trim()) params.set('q', q.value.trim());
  for (const [k, v] of Object.entries(filters.value)) if (v) params.set(k, v);
  api
    .get(`/export/activities.${fmt}?${params}`, { responseType: 'blob' })
    .then((res) => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename('Activities', fmt);
      a.click();
      URL.revokeObjectURL(url);
    });
}

const importing = ref(false);
function imported() {
  importing.value = false;
  load();
}

const fmt = (d) => (d ? d.slice(0, 10) : '—');
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Activities</h1>
        <p class="lede">{{ total }} activities — each one is a 5W report</p>
      </div>
      <div class="head-actions">
        <SearchBox v-model="q" placeholder="Search activities…" @update:modelValue="qChanged" />
        <ExportMenu
          :items="[
            { label: 'Excel (.xlsx)', run: () => exportMatrix('xlsx') },
            { label: 'CSV (.csv)', run: () => exportMatrix('csv') },
          ]"
        />
        <button class="btn" @click="importing = true"><Icon name="plus" /> Import CSV</button>
        <router-link class="btn btn-primary" :to="{ name: 'activity-new' }"><Icon name="plus" /> New activity</router-link>
      </div>
    </div>

    <ImportModal
      v-if="importing"
      title="Import activities from CSV"
      entityLabel="activities"
      templateUrl="/import/activities/template.xlsx"
      uploadUrl="/import/activities"
      @close="importing = false"
      @imported="imported"
    />

    <div class="card" style="margin-bottom: 16px">
      <div class="filter-grid">
        <label class="field">
          <span>Organization (Who)</span>
          <select v-model="filters.organization" @change="load()">
            <option value="">All</option>
            <option v-for="o in lookups.organizations" :key="o._id" :value="o._id">{{ o.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Sector (What)</span>
          <select v-model="filters.sector" @change="load()">
            <option value="">All</option>
            <option v-for="s in lookups.sectors" :key="s._id" :value="s._id">{{ s.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Location (Where)</span>
          <select v-model="filters.location" @change="load()">
            <option value="">All</option>
            <option v-for="l in lookups.locations" :key="l._id" :value="l._id">
              {{ ' '.repeat((l.level - 1) * 3) + l.name }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Project status</span>
          <select v-model="filters.status" @change="load()">
            <option value="">All</option>
            <option value="planned">Planned</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <div v-if="loading" class="spinner">Loading…</div>
      <div v-else-if="!items.length" class="empty">
        <div class="empty-icon"><Icon name="inbox" :size="20" /></div>
        <div><b>No activities match the current filters.</b></div>
        <div>Adjust the filters or file a new activity report.</div>
      </div>
      <div v-else class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th>Activity</th><th>Organization</th><th>Project</th><th>Sector</th>
              <th>Locations</th><th>Start</th><th>Targeted</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in items" :key="a._id">
              <td>{{ a.title }}</td>
              <td>{{ a.organization?.acronym || a.organization?.name }}</td>
              <td>{{ a.project?.title }}</td>
              <td><span class="dot" :style="{ background: a.sector?.color }"></span>{{ a.sector?.name }}</td>
              <td>{{ (a.locations || []).map((l) => l.name).join(', ') }}</td>
              <td>{{ fmt(a.startDate) }}</td>
              <td>{{ (a.beneficiaries || []).reduce((s, b) => s + (b.targetedTotal || 0), 0).toLocaleString() }}</td>
              <td class="row-actions">
                <template v-if="canEdit(a)">
                  <router-link class="btn btn-sm" :to="`/activities/${a._id}/edit`"><Icon name="edit" :size="13" /> Edit</router-link>
                  <button class="btn btn-sm btn-danger" style="margin-left: 6px" @click="deleting = a"><Icon name="trash" :size="13" /></button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="page" :pages="pages" :total="total" @go="load" />
    </div>

    <ConfirmDialog
      v-if="deleting"
      title="Delete activity"
      :message="`Delete '${deleting.title}'?`"
      @confirm="doDelete"
      @cancel="deleting = null"
    />
  </div>
</template>
