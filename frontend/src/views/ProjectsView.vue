<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import api from '../api/client';
import Icon from '../components/common/Icon.vue';
import SearchBox from '../components/common/SearchBox.vue';
import Pager from '../components/common/Pager.vue';
import MultiOrgPicker from '../components/common/MultiOrgPicker.vue';
import { useAuthStore } from '../stores/auth';
import { useLookupsStore } from '../stores/lookups';
import { useToast } from '../composables/toast';
import { useClientTable } from '../composables/clientTable';
import { downloadCsv } from '../utils/csv';

const toast = useToast();

const auth = useAuthStore();
const lookups = useLookupsStore();
const projects = ref([]);
const loading = ref(false);
const editing = ref(null);
const error = ref('');
const filterOrg = ref('');
const filterStatus = ref('');

const CURRENCIES = ['SCR', 'USD', 'EUR'];

const canCreate = computed(() => auth.isAdmin || auth.user?.role === 'org');

const { q, page, pages, filtered, paged } = useClientTable(projects, {
  searchText: (p) =>
    [
      p.title,
      p.organization?.name,
      p.organization?.acronym,
      p.status,
      p.event?.name,
      ...(p.fundingSources || []).map((o) => o?.name || ''),
      ...(p.implementingPartners || []).map((o) => o?.name || ''),
    ]
      .filter(Boolean)
      .join(' '),
});

function exportCsv() {
  downloadCsv(
    'projects.csv',
    ['Title', 'Implementing organization', 'Partner organizations', 'Status', 'Start', 'End', 'Budget', 'Currency', 'Funding sources', 'Disaster event'],
    filtered.value.map((p) => [
      p.title,
      p.organization?.name || '',
      (p.implementingPartners || []).map((o) => o?.name).filter(Boolean).join('; '),
      p.status,
      p.startDate?.slice(0, 10) || '',
      p.endDate?.slice(0, 10) || '',
      p.budget?.amount ?? '',
      p.budget?.currency || '',
      (p.fundingSources || []).map((o) => o?.name).filter(Boolean).join('; '),
      p.event?.name || '',
    ])
  );
}

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (filterOrg.value) params.organization = filterOrg.value;
    if (filterStatus.value) params.status = filterStatus.value;
    const { data } = await api.get('/projects', { params });
    projects.value = data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function canEdit(p) {
  return auth.isAdmin || p.organization?._id === auth.myOrgId;
}

// --- Modal drafts: edits auto-save to localStorage until a successful save. ---
const projectDraft = ref(null); // { savedAt, data } | null — drives the restore banner
let draftBaseline = null;
let draftTimer = null;
const draftKey = () =>
  `fivews.draft.${auth.user?.id || 'anon'}.project.${editing.value?._id || 'new'}`;

function draftOpened() {
  draftBaseline = JSON.stringify(editing.value);
  projectDraft.value = null;
  try {
    const raw = localStorage.getItem(draftKey());
    if (raw) projectDraft.value = JSON.parse(raw);
  } catch {}
}
watch(
  editing,
  () => {
    if (!editing.value) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (!editing.value) return;
      const json = JSON.stringify(editing.value);
      if (json === draftBaseline) return;
      try {
        localStorage.setItem(draftKey(), JSON.stringify({ savedAt: Date.now(), data: JSON.parse(json) }));
      } catch {}
    }, 800);
  },
  { deep: true }
);
function restoreDraft() {
  if (!projectDraft.value) return;
  editing.value = JSON.parse(JSON.stringify(projectDraft.value.data));
  projectDraft.value = null;
}
function discardDraft() {
  try {
    localStorage.removeItem(draftKey());
  } catch {}
  projectDraft.value = null;
}
function onBeforeUnload(e) {
  if (editing.value && JSON.stringify(editing.value) !== draftBaseline) {
    e.preventDefault();
    e.returnValue = '';
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  clearTimeout(draftTimer);
});

function openNew() {
  editing.value = {
    title: '',
    organization: auth.isAdmin ? '' : auth.myOrgId,
    implementingPartners: [],
    description: '',
    startDate: '',
    endDate: '',
    status: 'planned',
    event: '',
    budgetAmount: '',
    budgetCurrency: 'SCR',
    fundingSources: [],
  };
  error.value = '';
  draftOpened();
}

function openEdit(p) {
  editing.value = {
    _id: p._id,
    title: p.title,
    organization: p.organization?._id,
    implementingPartners: (p.implementingPartners || []).map((o) => o._id || o),
    description: p.description || '',
    startDate: p.startDate?.slice(0, 10) || '',
    endDate: p.endDate?.slice(0, 10) || '',
    status: p.status || 'planned',
    event: p.event?._id || p.event || '',
    budgetAmount: p.budget?.amount ?? '',
    budgetCurrency: p.budget?.currency || 'SCR',
    fundingSources: (p.fundingSources || []).map((o) => o._id || o),
  };
  error.value = '';
  draftOpened();
}

async function save() {
  error.value = '';
  const e = editing.value;
  const body = {
    title: e.title,
    description: e.description || undefined,
    startDate: e.startDate || undefined,
    endDate: e.endDate || undefined,
    status: e.status,
    event: e.event || null,
    budget: e.budgetAmount !== '' ? { amount: Number(e.budgetAmount), currency: e.budgetCurrency } : undefined,
    fundingSources: e.fundingSources,
    implementingPartners: e.implementingPartners,
  };
  try {
    if (e._id) {
      await api.put(`/projects/${e._id}`, body);
    } else {
      body.organization = e.organization;
      await api.post('/projects', body);
    }
    try {
      localStorage.removeItem(draftKey());
    } catch {}
    toast.success(e._id ? 'Project updated' : 'Project created');
    editing.value = null;
    await load();
  } catch (err) {
    error.value = err.response?.data?.error || 'Save failed';
  }
}

const fmt = (d) => (d ? d.slice(0, 10) : '—');
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Projects</h1>
        <p class="lede">Projects group the activities an organization reports</p>
      </div>
      <div class="head-actions">
        <SearchBox v-model="q" placeholder="Search projects…" />
        <button class="btn" @click="exportCsv"><Icon name="download" /> Export CSV</button>
        <button v-if="canCreate" class="btn btn-primary" @click="openNew"><Icon name="plus" /> New project</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px">
      <div class="filter-grid">
        <label class="field">
          <span>Organization</span>
          <select v-model="filterOrg" @change="load">
            <option value="">All</option>
            <option v-for="o in lookups.organizations" :key="o._id" :value="o._id">{{ o.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select v-model="filterStatus" @change="load">
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
      <div v-else-if="!projects.length" class="empty">
        <div class="empty-icon"><Icon name="folder" :size="20" /></div>
        <div><b>No projects yet.</b></div>
        <div>Create the first project to start reporting activities under it.</div>
      </div>
      <div v-else-if="!filtered.length" class="empty">
        <div class="empty-icon"><Icon name="search" :size="20" /></div>
        <div><b>No projects match “{{ q }}”.</b></div>
      </div>
      <div v-else class="table-scroll">
        <table class="data">
          <thead>
            <tr><th>Title</th><th>Organization</th><th>Status</th><th>Start</th><th>End</th><th>Budget</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in paged" :key="p._id">
              <td><router-link :to="`/projects/${p._id}`">{{ p.title }}</router-link></td>
              <td>{{ p.organization?.acronym || p.organization?.name }}</td>
              <td><span class="badge" :class="`badge-${p.status}`">{{ p.status }}</span></td>
              <td>{{ fmt(p.startDate) }}</td>
              <td>{{ fmt(p.endDate) }}</td>
              <td>{{ p.budget?.amount ? `${p.budget.amount.toLocaleString()} ${p.budget.currency}` : '—' }}</td>
              <td class="row-actions">
                <button v-if="canEdit(p)" class="btn btn-sm" @click="openEdit(p)"><Icon name="edit" :size="13" /> Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
    </div>

    <div v-if="editing" class="modal-backdrop" @click.self="editing = null">
      <div class="modal">
        <h2>{{ editing._id ? 'Edit project' : 'New project' }}</h2>
        <div v-if="projectDraft" style="border-left: 3px solid #935610; background: var(--surface-2, #f6f8fb); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12.5px">
          <span><b>Unsaved draft</b> from {{ new Date(projectDraft.savedAt).toLocaleString() }}</span>
          <span style="display: flex; gap: 6px">
            <button type="button" class="btn btn-sm btn-primary" @click="restoreDraft">Restore</button>
            <button type="button" class="btn btn-sm" @click="discardDraft">Discard</button>
          </span>
        </div>
        <form @submit.prevent="save">
          <label class="field">
            <span>Title *</span>
            <input v-model="editing.title" required />
          </label>
          <label v-if="auth.isAdmin && !editing._id" class="field">
            <span>Implementing organization (CSO) *</span>
            <select v-model="editing.organization" required>
              <option value="">—</option>
              <option v-for="o in lookups.organizations" :key="o._id" :value="o._id">{{ o.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Partner organizations <span class="hint">(working alongside the implementing organization)</span></span>
            <MultiOrgPicker
              v-model="editing.implementingPartners"
              :exclude="editing.organization ? [editing.organization] : []"
              placeholder="Add a partner organization…"
            />
          </label>
          <label class="field">
            <span>Description</span>
            <textarea v-model="editing.description" rows="3" />
          </label>
          <div class="form-grid">
            <label class="field"><span>Start date</span><input v-model="editing.startDate" type="date" /></label>
            <label class="field"><span>End date</span><input v-model="editing.endDate" type="date" /></label>
            <label class="field">
              <span>Status *</span>
              <select v-model="editing.status" required>
                <option value="planned">Planned</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>Disaster / Emergency context <span class="hint">(if any)</span></span>
            <select v-model="editing.event">
              <option value="">None — regular programming</option>
              <option v-for="ev in lookups.events.filter((x) => x.active !== false)" :key="ev._id" :value="ev._id">
                {{ ev.name }}{{ ev.glideNumber ? ` (${ev.glideNumber})` : '' }}
              </option>
            </select>
          </label>
          <div class="form-grid">
            <label class="field"><span>Budget amount</span><input v-model="editing.budgetAmount" v-decimal type="number" min="0" step="any" inputmode="decimal" /></label>
            <label class="field">
              <span>Currency</span>
              <select v-model="editing.budgetCurrency">
                <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>Funding sources <span class="hint">(from the organization registry — donors listed first)</span></span>
            <MultiOrgPicker v-model="editing.fundingSources" donorsFirst placeholder="Add a funding organization…" />
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <div class="modal-actions">
            <button type="button" class="btn" @click="editing = null">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
