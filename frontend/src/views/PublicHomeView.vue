<script setup>
// Public front door: read-only overview of who does what where, without a login.
// Uses ONLY /api/public/* — an authenticated endpoint here would trip the
// 401→login redirect in the axios interceptor for anonymous visitors.
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import BarChart from '../components/dashboard/BarChart.vue';
import DonutChart from '../components/dashboard/DonutChart.vue';
import DemographicsCard from '../components/dashboard/DemographicsCard.vue';
import HeadlineGroups from '../components/dashboard/HeadlineGroups.vue';
import LocationMultiPicker from '../components/dashboard/LocationMultiPicker.vue';
import ActivityMap from '../components/dashboard/ActivityMap.vue';
import Icon from '../components/common/Icon.vue';
import ExportMenu from '../components/common/ExportMenu.vue';
import { exportFilename } from '../utils/csv';
import { orgTypeLabel } from '../utils/orgTypes';
import drdmLogo from '../assets/drdm-logo.png';

const auth = useAuthStore();
const s = ref(null);
const failed = ref(false);
const fetching = ref(false);

// Public filters — whitelisted server-side; options come from the first load.
// `location` holds multiple ids (sent comma-separated, union of subtrees).
const emptyFilters = () => ({
  organization: '',
  sector: '',
  status: '',
  event: '',
  dateFrom: '',
  dateTo: '',
  location: [],
});
const filters = ref(emptyFilters());
const options = ref({ sectors: [], locations: [], levels: [], organizations: [], events: [] });
const hasFilters = computed(() =>
  Object.values(filters.value).some((v) => (Array.isArray(v) ? v.length : v))
);

function filterParams() {
  const params = {};
  for (const [k, v] of Object.entries(filters.value)) {
    if (k === 'location') {
      if (v.length) params[k] = v.join(',');
    } else if (v) {
      params[k] = v;
    }
  }
  return params;
}

async function fetchSummary() {
  fetching.value = true;
  try {
    // Plain axios: no token attachment, no interceptors needed on a public call.
    const { data } = await axios.get('/api/public/summary', { params: filterParams() });
    s.value = data;
    if (!options.value.sectors.length) {
      options.value = {
        sectors: data.sectorOptions || [],
        locations: data.locationOptions || [],
        levels: data.levels || [],
        organizations: data.organizationOptions || [],
        events: data.eventOptions || [],
      };
    }
  } catch {
    if (!s.value) failed.value = true;
  } finally {
    fetching.value = false;
  }
}

// Date typing and chip toggling shouldn't fire a request per keystroke/click.
let debounceTimer = null;
function fetchSummaryDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchSummary, 300);
}

function clearFilters() {
  filters.value = emptyFilters();
  fetchSummary();
}

// TODO: confirm DMIS URL
const DMIS_URL = 'https://dmis.gov.sc';

onMounted(fetchSummary);

const n = (v) => (v ?? 0).toLocaleString();
const levelName = (l) => s.value?.levels?.find((x) => x.level === l)?.name || `Level ${l}`;
const unitLabel = computed(() => levelName(s.value?.mapLevel || 2).toLowerCase());
const coveragePct = computed(() => {
  const t = s.value?.totals;
  return t?.unitsTotal ? Math.round((t.unitsCovered / t.unitsTotal) * 100) : 0;
});

// Status is a state — reserved status palette, never reused for series.
const STATUS_COLORS = { planned: '#6b7280', ongoing: '#1d5fad', completed: '#19703a' };
const STATUS_ORDER = ['planned', 'ongoing', 'completed'];
const cap = (x) => x[0].toUpperCase() + x.slice(1);

const statusItems = computed(() => {
  const byKey = Object.fromEntries((s.value?.byStatus || []).map((r) => [r.status, r.count]));
  return STATUS_ORDER.map((k) => ({ label: cap(k), value: byKey[k] || 0, color: STATUS_COLORS[k] }));
});

// Female/male split summed from the gendered disaggregation categories.
const GENDER_COLORS = { female: '#a23a82', male: '#1d5fad' };
const genderItems = computed(() => {
  const d = s.value?.demographics;
  if (!d) return [];
  const sums = { female: 0, male: 0 };
  for (const c of d.categories || []) {
    if (c.crossCutting || !c.gender || sums[c.gender] === undefined) continue;
    sums[c.gender] += (d.targeted || {})[c.key] || 0;
  }
  return [
    { label: 'Female', value: sums.female, color: GENDER_COLORS.female },
    { label: 'Male', value: sums.male, color: GENDER_COLORS.male },
  ];
});

// Sector identity: full names on the axis, entity colors from the registry.
const sectorData = computed(() => ({
  labels: (s.value?.bySector || []).map((r) => r.name),
  values: (s.value?.bySector || []).map((r) => r.projects),
  colors: (s.value?.bySector || []).map((r) => r.color || '#1d5fad'),
}));
const sectorChartHeight = computed(() => Math.max(180, (s.value?.bySector || []).length * 26 + 24));

const activeEvents = computed(() => (s.value?.byEvent || []).filter((e) => e.status === 'active'));

// Implementing organizations by type — the "Who" companion to the coverage map.
const orgTypeData = computed(() => ({
  labels: (s.value?.byOrgType || []).map((r) => orgTypeLabel(r.type)),
  values: (s.value?.byOrgType || []).map((r) => r.count),
}));
const orgTypeChartHeight = computed(() => Math.max(180, (s.value?.byOrgType || []).length * 26 + 24));

// Ranked areas at the map's admin level — the glanceable "Where".
const topAreas = computed(() => (s.value?.byLevel?.[s.value.mapLevel] || []).slice(0, 8));
const maxAreaCount = computed(() => Math.max(1, ...topAreas.value.map((a) => a.count)));

const eventData = computed(() => ({
  labels: (s.value?.byEvent || []).map((r) => r.name),
  values: (s.value?.byEvent || []).map((r) => r.projects),
}));

// Click-to-filter, toggle semantics: clicking the active selection clears it.
function onSectorSelect({ index }) {
  const row = s.value?.bySector?.[index];
  if (!row) return;
  filters.value.sector = String(filters.value.sector) === String(row.sectorId) ? '' : row.sectorId;
  fetchSummary();
}
function onStatusSelect({ label }) {
  const key = (label || '').toLowerCase();
  filters.value.status = filters.value.status === key ? '' : key;
  fetchSummary();
}
function toggleLocation(locationId) {
  const id = String(locationId);
  const cur = filters.value.location.map(String);
  filters.value.location = cur.includes(id)
    ? filters.value.location.filter((x) => String(x) !== id)
    : [...filters.value.location, locationId];
  fetchSummary();
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Public exports: PDF/image snapshots of the overview as shown, and an Excel
// of the same aggregates from the (unauthenticated) public API.
const exportRoot = ref(null);
const exporting = ref(false);
async function exportSnapshot(kind) {
  if (!exportRoot.value || exporting.value) return;
  exporting.value = true;
  try {
    // Loaded on demand — the capture/PDF libraries are too heavy to ship eagerly.
    const { exportNodeAsPng, exportNodeAsPdf } = await import('../utils/exportView');
    if (kind === 'pdf') {
      await exportNodeAsPdf(exportRoot.value, 'Overview', 'Who does What, Where, When, for Whom');
    } else {
      await exportNodeAsPng(exportRoot.value, 'Overview');
    }
  } finally {
    exporting.value = false;
  }
}

function exportOverviewXlsx() {
  const params = new URLSearchParams(filterParams());
  axios.get(`/api/public/summary.xlsx?${params}`, { responseType: 'blob' }).then((res) => {
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename('Overview', 'xlsx');
    a.click();
    URL.revokeObjectURL(url);
  });
}
</script>

<template>
  <div class="public-page">
    <!-- ============ Hero band (echoes the login card: gradient, network art, medallion, flag bar) ============ -->
    <header class="hero">
      <!-- Coordination-network mesh across the whole hero. Lines may run off the
           edges (that reads as a continuing network); the colored accent nodes stay
           in the middle band so they are never cropped, at any viewport width. -->
      <svg class="hero-art" viewBox="0 0 1440 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g stroke="rgba(255,255,255,0.10)" stroke-width="4" fill="none" stroke-linecap="round">
          <path d="M-30 195 L140 140 L300 180 L470 120 L640 155 L820 100 L980 150 L1120 95 L1260 135 L1470 75" />
          <path d="M140 140 L90 -10" />
          <path d="M300 180 L345 240" />
          <path d="M470 120 L430 -10" />
          <path d="M640 155 L690 240" />
          <path d="M820 100 L780 -10" />
          <path d="M980 150 L1010 240" />
          <path d="M1120 95 L1160 -10" />
          <path d="M1260 135 L1310 240" />
        </g>
        <!-- junction dots -->
        <g fill="rgba(255,255,255,0.20)">
          <circle cx="140" cy="140" r="6" />
          <circle cx="300" cy="180" r="6" />
          <circle cx="470" cy="120" r="6" />
          <circle cx="980" cy="150" r="6" />
          <circle cx="1260" cy="135" r="6" />
        </g>
        <!-- feature nodes — kept monochrome so the mesh stays a quiet texture -->
        <circle cx="640" cy="155" r="8" fill="rgba(255,255,255,0.20)" />
        <circle cx="820" cy="100" r="16" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="5" />
        <circle cx="1120" cy="95" r="11" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="5" />
      </svg>

      <div class="hero-inner">
        <div class="hero-main">
          <span class="brand-ring hero-logo">
            <img :src="drdmLogo" alt="Department of Risk and Disaster Management and DICT, Seychelles" />
          </span>
          <div>
            <h1>CIVIL SOCIETY COORDINATION PLATFORM</h1>
            <div class="hero-dept">Coordinated by Department of Risk and Disaster Management; and DICT</div>
            <div class="hero-sub">5Ws — Who does What, Where, When, for Whom</div>
          </div>
          <div class="hero-actions">
            <router-link class="hero-link" :to="{ name: 'directory' }">Organization Directory</router-link>
            <a class="hero-link" :href="DMIS_URL" target="_blank" rel="noopener">DMIS <span class="ext" aria-hidden="true">↗</span></a>
            <router-link v-if="auth.isAuthenticated" class="hero-cta" :to="{ name: 'dashboard' }">
              Open dashboard
            </router-link>
            <router-link v-else class="hero-cta" :to="{ name: 'login' }">Log in</router-link>
          </div>
        </div>
      </div>
    </header>
    <div class="flag-bar flag-bar-hero" aria-hidden="true"></div>

    <main ref="exportRoot" class="public-body">
      <div v-if="failed" class="card empty" style="padding: 32px">
        The overview is temporarily unavailable. Please try again in a moment.
      </div>
      <div v-else-if="!s" class="stat-row" style="margin-top: 16px">
        <div v-for="i in 4" :key="i" class="skeleton" style="height: 90px"></div>
      </div>
      <template v-else>
        <!-- Active emergencies: one slim line per event -->
        <section v-if="activeEvents.length" class="emergency-band">
          <div v-for="e in activeEvents" :key="e.eventId" class="emergency-line">
            <Icon name="alert" :size="14" />
            <b>{{ e.name }}</b>
            <span v-if="e.glideNumber" class="ec-glide">{{ e.glideNumber }}</span>
            <span class="ec-count">{{ e.projects }} project{{ e.projects === 1 ? '' : 's' }} responding</span>
          </div>
        </section>

        <!-- Key stats -->
        <div class="stat-row public-stats">
          <!-- Tile accents walk the Seychelles flag: blue, yellow (darkened for contrast), red, green -->
          <div class="stat-tile" style="--tile-accent: #003f87">
            <div class="tile-head"><span class="label">Organizations</span></div>
            <div class="value">{{ n(s.totals.organizationsRegistered) }}</div>
            <div class="sub">registered members — Who</div>
          </div>
          <div class="stat-tile" style="--tile-accent: #d8a413">
            <div class="tile-head"><span class="label">Projects</span></div>
            <div class="value">{{ n(s.totals.projects) }}</div>
            <div class="sub">{{ n(s.totals.activities) }} activities filed</div>
          </div>
          <div class="stat-tile" style="--tile-accent: #d6242b">
            <div class="tile-head"><span class="label">Beneficiaries targeted</span></div>
            <div class="value">{{ n(s.totals.beneficiariesTargeted) }}</div>
            <div class="sub">for Whom</div>
          </div>
          <div class="stat-tile" style="--tile-accent: #007a3d">
            <div class="tile-head"><span class="label">Coverage</span></div>
            <div class="value">{{ coveragePct }}<span style="font-size: 15px; color: var(--ink-3)">%</span></div>
            <div class="sub">{{ s.totals.unitsCovered }}/{{ s.totals.unitsTotal }} {{ unitLabel }}s — Where</div>
          </div>
        </div>

        <!-- Filters — same dimensions as the internal dashboard (minus budgets) -->
        <div class="filter-bar card">
          <div class="fb-top">
            <span class="fb-label">Filter</span>
            <span v-if="fetching" class="muted fb-busy">Updating…</span>
            <div class="fb-actions" data-export-exclude>
              <button v-if="hasFilters" class="btn btn-sm" @click="clearFilters">Clear</button>
              <ExportMenu
                :label="exporting ? 'Exporting…' : 'Export'"
                :items="[
                  { label: 'Overview PDF (.pdf)', run: () => exportSnapshot('pdf') },
                  { label: 'Overview image (.png)', run: () => exportSnapshot('png') },
                  { label: 'Overview Excel (.xlsx)', run: exportOverviewXlsx },
                ]"
              />
            </div>
          </div>
          <div class="fb-fields">
            <select v-model="filters.organization" @change="fetchSummary">
              <option value="">All organizations</option>
              <option v-for="o in options.organizations" :key="o._id" :value="o._id">
                {{ o.acronym ? `${o.acronym} — ${o.name}` : o.name }}
              </option>
            </select>
            <select v-model="filters.sector" @change="fetchSummary">
              <option value="">All sectors</option>
              <option v-for="o in options.sectors" :key="o._id" :value="o._id">{{ o.name }}</option>
            </select>
            <select v-model="filters.status" @change="fetchSummary">
              <option value="">All statuses</option>
              <option value="planned">Planned</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
            <select v-model="filters.event" @change="fetchSummary">
              <option value="">All emergencies</option>
              <option v-for="e in options.events" :key="e._id" :value="e._id">{{ e.name }}</option>
            </select>
            <LocationMultiPicker
              v-model="filters.location"
              :locations="options.locations"
              :levels="options.levels"
              class="fb-locations"
              @update:modelValue="fetchSummaryDebounced"
            />
            <label class="fb-date">
              <span>From</span>
              <input type="date" v-model="filters.dateFrom" @change="fetchSummaryDebounced" />
            </label>
            <label class="fb-date">
              <span>To</span>
              <input type="date" v-model="filters.dateTo" @change="fetchSummaryDebounced" />
            </label>
          </div>
        </div>

        <!-- Coverage map (left) + organizations-by-type chart (right) -->
        <div class="map-row">
          <div class="card">
            <div class="card-row">
              <div>
                <div class="card-title">Where work is happening</div>
                <div class="card-sub">Click a {{ unitLabel }} for details, drill down, or filter the page · the “Organizations” layer shows member offices</div>
              </div>
            </div>
            <ActivityMap
              :byLevel="s.byLevel"
              :maxLevel="s.maxLocLevel"
              :levels="s.levels"
              :orgMarkers="s.organizations"
              :startLevel="s.maxLocLevel"
              :showTable="true"
              :height="480"
              geojsonUrl="/public/geojson"
              :interactive="true"
              :org-actions="false"
              @select-location="toggleLocation"
            />
          </div>

          <div class="card">
            <div class="card-title">Who — organizations by type</div>
            <div class="card-sub">Implementing organizations in the current selection</div>
            <div v-if="!orgTypeData.labels.length" class="empty" style="padding: 24px 12px">
              No implementing organizations under the current filters.
            </div>
            <BarChart
              v-else
              :labels="orgTypeData.labels"
              :values="orgTypeData.values"
              horizontal
              showValues
              :height="orgTypeChartHeight"
            />
          </div>
        </div>

        <!-- Row 1: seams align — the donut card stretches to the sector card's height -->
        <div class="two-col">
          <div class="card">
            <div class="card-title">What — projects by sector</div>
            <div class="card-sub">A project counts under every sector its activities report · click a bar to filter</div>
            <BarChart
              :labels="sectorData.labels"
              :values="sectorData.values"
              :colors="sectorData.colors"
              horizontal
              showValues
              clickable
              :height="sectorChartHeight"
              @select="onSectorSelect"
            />
          </div>

          <div class="card flex-card">
            <div class="spread">
              <div>
                <div class="card-title">When — project status</div>
                <div class="card-sub">Click a slice to filter</div>
                <DonutChart
                  :items="statusItems"
                  centerLabel="Projects"
                  :size="150"
                  clickable
                  :activeLabel="filters.status ? cap(filters.status) : ''"
                  @select="onStatusSelect"
                />
              </div>
              <hr class="card-divider" />
              <div>
                <div class="card-title">For Whom — targeted, female / male</div>
                <DonutChart :items="genderItems" centerLabel="Targeted" :size="150" />
              </div>
            </div>
          </div>
        </div>

        <!-- Row 2: ranked areas + emergency context (mirrors the internal dashboard) -->
        <div class="two-col">
          <div class="card">
            <div class="card-title">Most active {{ unitLabel }}s</div>
            <div class="card-sub">Where — ranked by projects, click to filter the page</div>
            <div v-if="!topAreas.length" class="empty" style="padding: 24px 12px">
              No located activities under the current filters.
            </div>
            <button
              v-for="a in topAreas"
              :key="a.locationId"
              class="area-row"
              type="button"
              @click="toggleLocation(a.locationId)"
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

          <div class="card">
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
            </div>
          </div>
        </div>

        <!-- Row 3 -->
        <div class="two-col">
          <div class="card">
            <div class="card-title">For Whom — targeted beneficiaries</div>
            <div class="card-sub">By disaggregation category, as reported</div>
            <HeadlineGroups :demographics="s.demographics" />
            <DemographicsCard :demographics="s.demographics" />
          </div>

          <div class="card">
            <div class="card-title">Latest updates</div>
            <div class="card-sub">Most recently added or edited projects in the current selection</div>
            <div v-if="!s.recentProjects?.length" class="empty" style="padding: 20px 12px">
              No projects reported yet.
            </div>
            <div v-else class="recent-grid">
              <div v-for="p in s.recentProjects" :key="p.title" class="recent-item">
                <div class="ri-main">
                  <div class="ri-title">{{ p.title }}</div>
                  <div class="ri-org">
                    {{ p.organization?.acronym || p.organization?.name || '—' }}
                    <span class="ri-dates">· {{ fmtDate(p.startDate) }} — {{ fmtDate(p.endDate) }}</span>
                    <span class="ri-dates">· updated {{ fmtDate(p.updatedAt) }}</span>
                    <span v-for="sec in p.sectors" :key="sec.name" class="sector-chip">
                      <span class="gdot" :style="{ background: sec.color || '#1d5fad' }"></span>{{ sec.name }}
                    </span>
                  </div>
                </div>
                <span class="badge" :class="`badge-${p.status}`">{{ p.status }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Join banner -->
        <section class="join-band">
          <div>
            <b>Working in Seychelles?</b>
            <span> Report your projects so partners can see the full picture.</span>
          </div>
          <router-link class="flag-btn" :to="{ name: 'login' }">Log in to report</router-link>
        </section>
      </template>
    </main>

    <div class="flag-bar" aria-hidden="true"></div>
    <footer class="public-footer">
      5Ws Seychelles — Civil Society Coordination Platform · Department of Risk and Disaster Management and DICT ·
      <router-link :to="{ name: 'directory' }">Organization directory</router-link> ·
      <a :href="DMIS_URL" target="_blank" rel="noopener">DMIS</a> ·
      <router-link :to="{ name: 'login' }">Organization login</router-link>
    </footer>
  </div>
</template>

<style scoped>
.public-page {
  min-height: 100vh; background: var(--page-bg, #f2f5f9); display: flex; flex-direction: column;
  /* One gutter + one content width shared by hero and body so their edges align */
  --page-gutter: clamp(20px, 4vw, 48px);
  --page-max: 1320px;
}

/* ---- Hero — same gradient and motifs as the login page ---- */
.hero {
  position: relative;
  overflow: hidden;
  /* Deeper, muted take on the login gradient — same hue journey, less glare */
  background: linear-gradient(160deg, #001d3d 0%, #083a63 55%, #0a5148 115%);
  color: #fff;
  padding: 22px var(--page-gutter);
}
/* Full-bleed background mesh behind the hero content */
.hero-art {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none;
}
@media (max-width: 760px) { .hero-art { display: none; } }
.hero-inner { position: relative; max-width: var(--page-max); margin: 0 auto; }
.brand-ring {
  width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
  background: #fff; border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  display: flex; align-items: center; justify-content: center;
}
.brand-ring img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; display: block; }
.hero-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.hero-cta {
  background: #d6242b; color: #fff; text-decoration: none;
  font-weight: 700; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  border-radius: 4px; padding: 9px 18px;
  transition: background 0.15s; white-space: nowrap;
}
.hero-cta:hover { background: #b81d23; }
/* Nav links: quiet uppercase text so the red CTA stays the only button */
.hero-link {
  color: rgba(255, 255, 255, 0.82); text-decoration: none;
  font-weight: 700; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 8px 10px; border-radius: 4px; white-space: nowrap;
  transition: color 0.15s, background 0.15s;
}
.hero-link:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
.hero-link .ext { font-size: 10px; opacity: 0.7; }

/* Letterhead layout: emblem + text stack left, actions pushed to the right —
   one row, so no empty band above or beside the lockup */
.hero-main { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.hero-logo { width: 72px; height: 72px; }
/* Hero type hierarchy: department + platform title lead large; the 5Ws line
   sits beneath them in smaller type. Pure white with opacity steps — tinted
   grays go muddy on the dark gradient. */
.hero-dept {
  color: rgba(255, 255, 255, 0.92); font-size: clamp(14px, 1.7vw, 17px);
  font-weight: 700; letter-spacing: 0.2px; margin-bottom: 4px;
}
.hero h1 {
  color: #fff; font-size: clamp(22px, 3vw, 32px); line-height: 1.15;
  margin: 0 0 4px; letter-spacing: 0.6px;
}
.hero-sub {
  color: rgba(255, 255, 255, 0.75); font-size: 12px; font-weight: 700;
  letter-spacing: 1.6px; text-transform: uppercase;
}
@media (max-width: 600px) { .hero-logo { width: 52px; height: 52px; } }

/* Seychelles flag stripe, as on the login card. Flat 90° segments — at page
   width an angled gradient makes the bands look offset — and a hairline
   outline so the white segment reads against the light page. */
.flag-bar {
  height: 6px;
  flex-shrink: 0;
  background: linear-gradient(
    90deg,
    #003f87 0%, #003f87 20%,
    #fcd856 20%, #fcd856 40%,
    #d6242b 40%, #d6242b 60%,
    #ffffff 60%, #ffffff 80%,
    #007a3d 80%, #007a3d 100%
  );
  box-shadow: inset 0 0 0 1px rgba(16, 36, 62, 0.15);
}
/* White seam below the hero — otherwise the stripe's blue segment melts into
   the blue gradient above and the flag looks like it starts at the yellow. */
.flag-bar-hero { border-top: 2px solid #fff; }

/* ---- Body ---- */
.public-body {
  /* content-box: max-width covers content only, so card edges line up with .hero-inner */
  flex: 1; box-sizing: content-box; width: auto; max-width: var(--page-max);
  margin: 0 auto; padding: 16px var(--page-gutter) 24px;
  display: flex; flex-direction: column; gap: 14px;
}
/* One uniform 14px rhythm — the global `.card + .card { margin-top }` rule
   would otherwise ADD to the flex/grid gaps and make spacing uneven. */
.public-body :deep(.card) { margin-bottom: 0; }
.public-body :deep(.card + .card) { margin-top: 0; }

.flex-card { display: flex; flex-direction: column; }
.spread { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; gap: 12px; }
.card-divider { border: none; border-top: 1px solid var(--border, #e3e8ef); margin: 0; }
.card-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

/* Map left, companion chart right — the map earns the wider column. */
.map-row { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; align-items: stretch; }
@media (max-width: 1000px) { .map-row { grid-template-columns: 1fr; } }

.public-stats.stat-row { margin-bottom: 0; grid-template-columns: repeat(4, 1fr); }
@media (max-width: 900px) { .public-stats.stat-row { grid-template-columns: repeat(2, 1fr); } }

.filter-bar {
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px 14px !important;
}
.fb-top { display: flex; align-items: center; gap: 10px; }
.fb-label { font-size: 11px; font-weight: 700; letter-spacing: 0.6px; color: var(--ink-3, #8a93a2); text-transform: uppercase; }
.fb-busy { font-size: 11.5px; }
.fb-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.fb-fields {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px 10px;
  align-items: center;
}
@media (max-width: 1100px) { .fb-fields { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 720px) { .fb-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.fb-fields select { width: 100%; max-width: none; font-size: 12.5px; }
.fb-date { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--ink-3, #8a93a2); }
.fb-date span { flex: 0 0 auto; }
.fb-date input { flex: 1; min-width: 0; font-size: 12px; }
.fb-locations { min-width: 0; }
.fb-locations :deep(select) { max-width: none; font-size: 12.5px; width: 100%; }

/* Ranked "most active areas" rows — whole row is a click target (as internal). */
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

.emergency-band {
  background: #fdf6ec; border: 1px solid #ecd9b8; border-left: 4px solid #d6242b;
  border-radius: 9px; padding: 8px 14px; display: flex; flex-direction: column; gap: 4px;
}
.emergency-line { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: #7a3306; flex-wrap: wrap; }
.emergency-line b { color: #5c2604; }
.ec-glide { font-size: 11px; color: #a08052; font-variant-numeric: tabular-nums; }
.ec-count { color: #7a3306; margin-left: auto; font-weight: 600; }

.gdot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

/* Recent projects: compact list */
.recent-grid { display: grid; grid-template-columns: 1fr; }
.recent-item {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--border, #e3e8ef);
}
.recent-item:last-child { border-bottom: none; }
.ri-title { font-weight: 700; font-size: 12.5px; line-height: 1.3; }
.ri-org { font-size: 11.5px; color: var(--ink-2, #4b5563); margin-top: 3px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.ri-dates { color: var(--ink-3, #6b7280); }
.sector-chip {
  display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600;
  color: var(--ink-2, #4b5563); background: var(--gray-100, #f1f4f8);
  border: 1px solid var(--border, #e3e8ef); border-radius: 999px; padding: 1px 8px;
}

.join-band {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  background: #eaf1fa; border: 1px solid #cddcf0; border-radius: 9px;
  padding: 10px 14px; font-size: 12.5px; color: var(--ink-2, #37445a);
}
.join-band b { color: var(--ink, #17263c); }

.flag-btn {
  background: #d6242b; color: #fff; text-decoration: none;
  font-weight: 700; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase;
  border-radius: 4px; padding: 8px 16px; white-space: nowrap;
  transition: background 0.15s;
}
.flag-btn:hover { background: #b81d23; }

.public-footer {
  text-align: center; font-size: 11.5px; color: var(--ink-3, #6b7280);
  padding: 12px var(--page-gutter);
}
.public-footer a { color: #003f87; font-weight: 700; text-decoration: none; }
.public-footer a:hover { text-decoration: underline; }
</style>
