<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import ConfirmDialog from '../components/common/ConfirmDialog.vue';
import Icon from '../components/common/Icon.vue';
import SearchBox from '../components/common/SearchBox.vue';
import Pager from '../components/common/Pager.vue';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../composables/toast';
import { useClientTable } from '../composables/clientTable';
import { downloadCsv } from '../utils/csv';
import { googleEarthUrl, eyeAltForLevel } from '../utils/googleEarth';

const toast = useToast();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const project = ref(null);
const activities = ref([]);
const confirmDelete = ref(false);

const canEdit = computed(
  () => auth.isAdmin || project.value?.organization?._id === auth.myOrgId
);

// Distinct areas this project covers, from its activities' locations.
const coverage = computed(() => {
  const byId = new Map();
  for (const a of activities.value) for (const l of a.locations || []) byId.set(l._id, l);
  return [...byId.values()].sort((x, y) => x.name.localeCompare(y.name));
});

const { q, page, pages, filtered, paged } = useClientTable(activities, {
  searchText: (a) =>
    [a.title, a.sector?.name, (a.locations || []).map((l) => l.name).join(' ')]
      .filter(Boolean)
      .join(' '),
});

function exportCsv() {
  downloadCsv(
    `${(project.value?.title || 'project').replace(/[^\w-]+/g, '-').toLowerCase()}-activities.csv`,
    ['Activity', 'Sector', 'Locations', 'Start', 'End'],
    filtered.value.map((a) => [
      a.title,
      a.sector?.name || '',
      (a.locations || []).map((l) => l.name).join('; '),
      a.startDate?.slice(0, 10) || '',
      a.endDate?.slice(0, 10) || '',
    ])
  );
}

async function load() {
  const [p, a] = await Promise.all([
    api.get(`/projects/${route.params.id}`),
    api.get('/activities', { params: { project: route.params.id, limit: 200 } }),
  ]);
  project.value = p.data;
  activities.value = a.data.items;
}
onMounted(load);

async function doDelete() {
  try {
    await api.delete(`/projects/${project.value._id}`);
    toast.success('Project deleted');
    router.push('/projects');
  } catch (e) {
    confirmDelete.value = false;
    toast.error(e.response?.data?.error || 'Delete failed');
  }
}

const fmt = (d) => (d ? d.slice(0, 10) : '—');
</script>

<template>
  <div v-if="project">
    <div class="page-head">
      <div>
        <h1>{{ project.title }}</h1>
        <p class="muted">
          Implemented by <b>{{ project.organization?.name }}</b>
          <span class="badge" :class="`badge-${project.status}`" style="margin-left: 8px">{{ project.status }}</span>
          <span v-if="project.event" class="badge badge-suspended badge-plain" style="margin-left: 6px" :title="project.event.glideNumber || ''">
            {{ project.event.name }}
          </span>
        </p>
      </div>
      <div class="head-actions">
        <router-link v-if="canEdit" class="btn btn-primary" :to="{ name: 'activity-new', query: { project: project._id } }">
          <Icon name="plus" /> New activity
        </router-link>
        <button v-if="canEdit" class="btn btn-danger" @click="confirmDelete = true"><Icon name="trash" :size="13" /> Delete project</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px">
      <div class="grid-3">
        <div>
          <div class="card-title">Timeframe</div>
          {{ fmt(project.startDate) }} → {{ fmt(project.endDate) }}
        </div>
        <div>
          <div class="card-title">Budget</div>
          {{ project.budget?.amount ? `${project.budget.amount.toLocaleString()} ${project.budget.currency}` : '—' }}
        </div>
        <div>
          <div class="card-title">Funding sources</div>
          {{ (project.fundingSources || []).map((o) => o?.name).filter(Boolean).join(', ') || '—' }}
        </div>
      </div>
      <div style="margin-top: 12px">
        <div class="card-title">Partner organizations</div>
        <template v-if="(project.implementingPartners || []).length">
          <span v-for="o in project.implementingPartners" :key="o._id" class="chip" style="padding-right: 11px">
            {{ o.acronym || o.name }}
          </span>
        </template>
        <span v-else class="muted">None — implemented directly by the implementing organization</span>
      </div>
      <div v-if="coverage.length" style="margin-top: 12px">
        <div class="card-title">Coverage — Where</div>
        <template v-for="l in coverage" :key="l._id">
          <a
            v-if="l.centroid?.lat != null"
            class="chip"
            :href="googleEarthUrl(l.centroid.lat, l.centroid.lng, eyeAltForLevel(l.level))"
            target="_blank"
            rel="noopener"
            :title="`Fly to ${l.name} in Google Earth`"
          >
            {{ l.name }} <Icon name="globe" :size="11" />
          </a>
          <span v-else class="chip" style="padding-right: 11px">{{ l.name }}</span>
        </template>
      </div>
      <p v-if="project.description" style="margin-top: 12px">{{ project.description }}</p>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px">
        <h2 style="margin: 0">Activities ({{ activities.length }})</h2>
        <div v-if="activities.length" style="display: flex; gap: 8px; align-items: center">
          <SearchBox v-model="q" placeholder="Search activities…" />
          <button class="btn" @click="exportCsv"><Icon name="download" /> Export CSV</button>
        </div>
      </div>
      <div v-if="!activities.length" class="empty">
        <div class="empty-icon"><Icon name="list" :size="20" /></div>
        <div><b>No activities reported under this project yet.</b></div>
        <div>Use “New activity” to file the first 5W report.</div>
      </div>
      <div v-else-if="!filtered.length" class="empty">
        <div class="empty-icon"><Icon name="search" :size="20" /></div>
        <div><b>No activities match “{{ q }}”.</b></div>
      </div>
      <div v-else class="table-scroll">
        <table class="data">
          <thead>
            <tr><th>Activity</th><th>Sector</th><th>Locations</th><th>Start</th><th>End</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="a in paged" :key="a._id">
              <td>{{ a.title }}</td>
              <td><span class="dot" :style="{ background: a.sector?.color }"></span>{{ a.sector?.name }}</td>
              <td>{{ (a.locations || []).map((l) => l.name).join(', ') }}</td>
              <td>{{ fmt(a.startDate) }}</td>
              <td>{{ fmt(a.endDate) }}</td>
              <td class="row-actions">
                <router-link v-if="canEdit" class="btn btn-sm" :to="`/activities/${a._id}/edit`"><Icon name="edit" :size="13" /> Edit</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
    </div>

    <ConfirmDialog
      v-if="confirmDelete"
      title="Delete project"
      :message="`Delete '${project.title}'? Projects with activities cannot be deleted.`"
      @confirm="doDelete"
      @cancel="confirmDelete = false"
    />
  </div>
</template>
