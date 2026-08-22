<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';
import { useDashboardStore } from '../stores/dashboard';
import { useLookupsStore } from '../stores/lookups';
import FilterBar from '../components/dashboard/FilterBar.vue';
import StatCards from '../components/dashboard/StatCards.vue';
import BarChart from '../components/dashboard/BarChart.vue';
import DonutChart from '../components/dashboard/DonutChart.vue';
import DemographicsCard from '../components/dashboard/DemographicsCard.vue';
import ActivityMap from '../components/dashboard/ActivityMap.vue';
import Icon from '../components/common/Icon.vue';
import ExportMenu from '../components/common/ExportMenu.vue';

const dash = useDashboardStore();
const lookups = useLookupsStore();
const router = useRouter();

// Org office points for the map's opt-in "Organizations" overlay.
const orgMarkers = computed(() =>
  lookups.organizations.filter((o) => o.active !== false && o.location?.lat != null)
);
function openOrgProfile(id) {
  router.push({ name: 'organization-profile', params: { id } });
}

onMounted(async () => {
  await lookups.load();
  dash.fetchSummary();
});

const s = computed(() => dash.summary);
const unitLabel = computed(() => lookups.levelName(s.value?.mapLevel || 2));

// Status is a state — reserved status palette, never reused for series.
const STATUS_COLORS = { planned: '#6b7280', ongoing: '#1d5fad', completed: '#19703a' };
const STATUS_ORDER = ['planned', 'ongoing', 'completed'];
const cap = (x) => x[0].toUpperCase() + x.slice(1);

const statusItems = computed(() => {
  const byKey = Object.fromEntries((s.value?.byStatus || []).map((r) => [r.status, r.count]));
  return STATUS_ORDER.map((x) => ({ label: cap(x), value: byKey[x] || 0, color: STATUS_COLORS[x] }));
});

// Ranked areas at the map's current admin level — the glanceable "Where".
const topAreas = computed(() => (s.value?.byLevel?.[s.value.mapLevel] || []).slice(0, 8));
const maxAreaCount = computed(() => Math.max(1, ...topAreas.value.map((a) => a.count)));

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const sectorData = computed(() => ({
  labels: (s.value?.bySector || []).map((r) => r.code || r.name),
  names: (s.value?.bySector || []).map((r) => r.name),
  values: (s.value?.bySector || []).map((r) => r.projects),
  colors: (s.value?.bySector || []).map((r) => r.color || '#1d5fad'),
}));

// Axis labels are short codes to keep the half-width card readable;
// this key spells them out below the chart.
const sectorKey = computed(() =>
  (s.value?.bySector || []).filter((r) => r.code && r.name && r.name !== r.code)
);

const eventData = computed(() => ({
  labels: (s.value?.byEvent || []).map((r) => r.name),
  values: (s.value?.byEvent || []).map((r) => r.projects),
}));

function selectLocation(locationId) {
  dash.filters.location = locationId;
  dash.fetchSummary();
}

function exportMatrix(fmt) {
  const params = new URLSearchParams(dash.activeFilterParams);
  api.get(`/export/activities.${fmt}?${params}`, { responseType: 'blob' }).then((res) => {
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `5w-activities.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p class="lede">Who does What, Where, When, for Whom — live view of all reported projects</p>
      </div>
      <div class="head-actions">
        <ExportMenu
          label="Export 5W matrix"
          :items="[
            { label: 'Excel (.xlsx)', run: () => exportMatrix('xlsx') },
            { label: 'CSV (.csv)', run: () => exportMatrix('csv') },
          ]"
        />
      </div>
    </div>

    <FilterBar />

    <div v-if="!s" class="stat-row">
      <div v-for="i in 4" :key="i" class="skeleton" style="height: 104px"></div>
    </div>
    <template v-else>
      <StatCards :totals="s.totals" :unitLabel="unitLabel" />

      <div v-if="!s.totals.projects" class="card empty">
        <div class="empty-icon"><Icon name="inbox" :size="20" /></div>
        <div><b>No projects match the current filters.</b></div>
        <div>Projects will appear here as organizations register their work.</div>
      </div>

      <!-- Row 1: the tall map pairs with a stacked column (status + demographics)
           so the right side fills its full height — no dead half-column. -->
      <div class="grid-2" style="margin-bottom: 16px">
        <div class="card">
          <div class="card-title">Coverage map</div>
          <div class="card-sub">Where — click an area for details, drill down level by level, or switch the metric</div>
          <ActivityMap
            :byLevel="s.byLevel"
            :maxLevel="s.maxLocLevel"
            :orgMarkers="orgMarkers"
            @select-location="selectLocation"
            @select-org="openOrgProfile"
          />
        </div>
        <div class="dash-stack">
          <div class="card">
            <div class="card-title">Projects by status</div>
            <div class="card-sub">When — share of projects in each state</div>
            <DonutChart :items="statusItems" centerLabel="Projects" :size="150" />
          </div>
          <div class="card">
            <div class="card-title">Who is targeted — demographics</div>
            <div class="card-sub">For Whom — targeted beneficiaries by disaggregation category</div>
            <DemographicsCard :demographics="s.demographics" />
          </div>
        </div>
      </div>

      <!-- Row 2: two ranked-bar cards of similar shape. -->
      <div class="grid-2" style="margin-bottom: 16px">
        <div class="card">
          <div class="card-title">Projects by sector</div>
          <div class="card-sub">What — a project counts under every sector its activities report</div>
          <BarChart
            :labels="sectorData.labels"
            :values="sectorData.values"
            :colors="sectorData.colors"
            :tooltipLabels="sectorData.names"
            horizontal
            showValues
            :height="Math.max(200, sectorData.labels.length * 26 + 24)"
          />
          <div v-if="sectorKey.length" class="chart-key">
            <span v-for="r in sectorKey" :key="r.code" class="key-item">
              <span class="key-dot" :style="{ background: r.color || '#1d5fad' }"></span>
              <b>{{ r.code }}</b>
              <span class="key-name">{{ r.name }}</span>
            </span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Most active {{ unitLabel.toLowerCase() }}s</div>
          <div class="card-sub">Where — ranked by projects, click to filter the dashboard</div>
          <div v-if="!topAreas.length" class="empty" style="padding: 24px 12px">
            No located activities under the current filters.
          </div>
          <button
            v-for="a in topAreas"
            :key="a.locationId"
            class="area-row"
            type="button"
            @click="selectLocation(a.locationId)"
          >
            <span class="area-name">{{ a.name }}</span>
            <span class="area-bar">
              <span class="fill" :style="{ width: (a.count / maxAreaCount) * 100 + '%' }"></span>
            </span>
            <span class="area-nums">
              <b>{{ a.count }}</b> project{{ a.count === 1 ? '' : 's' }}
              <span class="muted">· {{ a.orgCount }} org{{ a.orgCount === 1 ? '' : 's' }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Row 3: events pairs with latest updates; spans the row when alone. -->
      <div class="grid-2" style="margin-bottom: 16px">
        <div class="card" :style="s.recentProjects && s.recentProjects.length ? '' : 'grid-column: 1 / -1'">
          <div class="card-title">Disaster / Emergency context</div>
          <div class="card-sub">Projects linked to registered emergencies</div>
          <template v-if="s.byEvent.length">
            <BarChart :labels="eventData.labels" :values="eventData.values" horizontal :height="Math.max(120, s.byEvent.length * 44)" />
            <table class="data" style="margin-top: 8px">
              <tbody>
                <tr v-for="e in s.byEvent" :key="e.eventId">
                  <td><b>{{ e.name }}</b> <span class="muted">{{ e.glideNumber }}</span></td>
                  <td><span class="badge" :class="e.status === 'active' ? 'badge-suspended' : 'badge-planned'">{{ e.status }}</span></td>
                  <td style="text-align: right">{{ e.projects }} project{{ e.projects === 1 ? '' : 's' }}</td>
                </tr>
              </tbody>
            </table>
          </template>
          <div v-else class="empty" style="padding: 24px 12px">
            No projects are linked to a disaster event under the current filters.
            Set one in the project form’s “Disaster / Emergency context” field.
          </div>
        </div>

        <div v-if="s.recentProjects && s.recentProjects.length" class="card">
        <div class="card-title">Latest updates</div>
        <div class="card-sub">Most recently added or edited projects in the current selection</div>
        <table class="data" style="margin-top: 6px">
          <thead>
            <tr>
              <th>Project</th>
              <th>Organization</th>
              <th>Status</th>
              <th>Period</th>
              <th style="text-align: right">Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in s.recentProjects" :key="p._id">
              <td>
                <router-link :to="{ name: 'project-detail', params: { id: p._id } }"><b>{{ p.title }}</b></router-link>
              </td>
              <td>{{ p.organization ? (p.organization.acronym || p.organization.name) : '—' }}</td>
              <td><span class="badge" :class="`badge-${p.status}`">{{ p.status }}</span></td>
              <td class="muted">{{ fmtDate(p.startDate) }} — {{ fmtDate(p.endDate) }}</td>
              <td class="muted" style="text-align: right">{{ fmtDate(p.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Right column of the map row: two stacked cards fill the full row height. */
.dash-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.dash-stack > .card { margin-top: 0; }
.dash-stack > .card:last-child { flex: 1 1 auto; }

/* Ranked "most active areas" rows — whole row is a click target. */
.area-row {
  display: grid; grid-template-columns: 130px 1fr 150px;
  gap: 10px; align-items: center; width: 100%;
  padding: 5px 4px; margin: 0; border: none; background: none;
  border-radius: 6px; cursor: pointer; text-align: left;
  font: inherit; font-size: 12.5px; color: var(--ink-2, #4b5563);
}
.area-row:hover { background: var(--gray-100, #f1f4f8); }
.area-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.area-bar {
  position: relative; height: 14px; background: var(--gray-100, #f1f4f8);
  border: 1px solid var(--border, #e3e8ef); border-radius: 4px; overflow: hidden;
}
.area-bar .fill {
  position: absolute; top: 2px; left: 2px; height: 8px;
  border-radius: 3px; background: var(--blue-600, #1d5fad);
}
.area-nums { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.area-nums b { color: var(--ink, #17263c); }

/* Key for abbreviated sector codes — dot carries the color, text stays in ink. */
.chart-key {
  display: flex; flex-wrap: wrap; gap: 3px 14px;
  margin-top: 10px; padding-top: 8px;
  border-top: 1px solid var(--border, #e3e8ef);
  font-size: 11px; line-height: 1.6; color: var(--ink-2, #4b5563);
}
.key-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.key-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.key-item b { color: var(--ink, #17263c); font-weight: 600; }
.key-name { color: var(--muted, #6b7280); }
</style>
