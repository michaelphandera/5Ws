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
import ActivityMap from '../components/dashboard/ActivityMap.vue';
import Icon from '../components/common/Icon.vue';
import drdmLogo from '../assets/drdm-logo.png';

const auth = useAuthStore();
const s = ref(null);
const failed = ref(false);
const fetching = ref(false);

// Public filters — whitelisted server-side; options come from the first load.
const filters = ref({ sector: '', status: '', location: '' });
const options = ref({ sectors: [], locations: [], levels: [] });
const hasFilters = computed(() => Object.values(filters.value).some(Boolean));

async function fetchSummary() {
  fetching.value = true;
  try {
    const params = {};
    for (const [k, v] of Object.entries(filters.value)) if (v) params[k] = v;
    // Plain axios: no token attachment, no interceptors needed on a public call.
    const { data } = await axios.get('/api/public/summary', { params });
    s.value = data;
    if (!options.value.sectors.length) {
      options.value = {
        sectors: data.sectorOptions || [],
        locations: data.locationOptions || [],
        levels: data.levels || [],
      };
    }
  } catch {
    if (!s.value) failed.value = true;
  } finally {
    fetching.value = false;
  }
}

function clearFilters() {
  filters.value = { sector: '', status: '', location: '' };
  fetchSummary();
}

const locationsByLevel = computed(() => {
  const groups = [];
  for (const lvl of options.value.levels) {
    const items = options.value.locations.filter((l) => l.level === lvl.level);
    if (items.length) groups.push({ ...lvl, items });
  }
  return groups;
});

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

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
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
        <div class="hero-topbar">
          <div class="public-brand">
            <span class="brand-ring">
              <img :src="drdmLogo" alt="Disaster Risk Management Division, Seychelles" />
            </span>
            <div>
              <b>5Ws Seychelles</b>
              <small>CIVIL SOCIETY COORDINATION PLATFORM</small>
            </div>
          </div>
          <router-link v-if="auth.isAuthenticated" class="hero-cta" :to="{ name: 'dashboard' }">
            Open dashboard
          </router-link>
          <router-link v-else class="hero-cta" :to="{ name: 'login' }">Log in</router-link>
        </div>

        <div class="hero-main">
          <h1>Who does What, Where, When, for Whom</h1>
          <p class="hero-lede">
            A live picture of civil-society projects across Seychelles, coordinated by the
            Disaster Risk Management Division.
          </p>
        </div>
      </div>
    </header>
    <div class="flag-bar flag-bar-hero" aria-hidden="true"></div>

    <main class="public-body">
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

        <!-- Filters -->
        <div class="filter-bar card">
          <span class="fb-label">Filter</span>
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
          <select v-model="filters.location" @change="fetchSummary">
            <option value="">All areas</option>
            <optgroup v-for="g in locationsByLevel" :key="g.level" :label="g.name">
              <option v-for="l in g.items" :key="l._id" :value="l._id">{{ l.name }}</option>
            </optgroup>
          </select>
          <button v-if="hasFilters" class="btn btn-sm" @click="clearFilters">Clear</button>
          <span v-if="fetching" class="muted fb-busy">Updating…</span>
        </div>

        <!-- Coverage map -->
        <div class="card">
          <div class="card-row">
            <div>
              <div class="card-title">Where work is happening</div>
              <div class="card-sub">Click a {{ unitLabel }} for details · the “Organizations” layer shows member offices</div>
            </div>
          </div>
          <ActivityMap
            :byLevel="s.byLevel"
            :maxLevel="s.maxLocLevel"
            :levels="s.levels"
            :orgMarkers="s.organizations"
            :startLevel="s.maxLocLevel"
            :showTable="false"
            :height="300"
            geojsonUrl="/public/geojson"
            :interactive="false"
          />
        </div>

        <!-- Row 1: seams align — the donut card stretches to the sector card's height -->
        <div class="two-col">
          <div class="card">
            <div class="card-title">What — projects by sector</div>
            <div class="card-sub">A project counts under every sector its activities report</div>
            <BarChart
              :labels="sectorData.labels"
              :values="sectorData.values"
              :colors="sectorData.colors"
              horizontal
              showValues
              :height="sectorChartHeight"
            />
          </div>

          <div class="card flex-card">
            <div class="spread">
              <div>
                <div class="card-title">When — project status</div>
                <DonutChart :items="statusItems" centerLabel="Projects" :size="150" />
              </div>
              <hr class="card-divider" />
              <div>
                <div class="card-title">For Whom — targeted, female / male</div>
                <DonutChart :items="genderItems" centerLabel="Targeted" :size="150" />
              </div>
            </div>
          </div>
        </div>

        <!-- Row 2 -->
        <div class="two-col">
          <div class="card">
            <div class="card-title">For Whom — targeted beneficiaries</div>
            <div class="card-sub">By disaggregation category, as reported</div>
            <DemographicsCard :demographics="s.demographics" />
          </div>

          <div class="card">
            <div class="card-title">Recently registered projects</div>
            <div v-if="!s.recentProjects?.length" class="empty" style="padding: 20px 12px">
              No projects reported yet.
            </div>
            <div v-else class="recent-grid">
              <div v-for="p in s.recentProjects" :key="p.title" class="recent-item">
                <div class="ri-main">
                  <div class="ri-title">{{ p.title }}</div>
                  <div class="ri-org">
                    {{ p.organization?.acronym || p.organization?.name || '—' }}
                    <span class="ri-dates">· {{ fmtDate(p.startDate) }}</span>
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
      5Ws Seychelles — Civil Society Coordination Platform · Disaster Risk Management Division ·
      <router-link :to="{ name: 'login' }">Organization login</router-link>
    </footer>
  </div>
</template>

<style scoped>
.public-page { min-height: 100vh; background: var(--page-bg, #f2f5f9); display: flex; flex-direction: column; }

/* ---- Hero — same gradient and motifs as the login page ---- */
.hero {
  position: relative;
  overflow: hidden;
  /* Deeper, muted take on the login gradient — same hue journey, less glare */
  background: linear-gradient(160deg, #001d3d 0%, #083a63 55%, #0a5148 115%);
  color: #fff;
  padding: 0 22px 20px;
}
/* Full-bleed background mesh behind the hero content */
.hero-art {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none;
}
@media (max-width: 760px) { .hero-art { display: none; } }
.hero-inner { position: relative; max-width: 1440px; margin: 0 auto; }
.hero-topbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0 16px; }
.public-brand { display: flex; align-items: center; gap: 10px; }
.brand-ring {
  width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
  background: #fff; border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  display: flex; align-items: center; justify-content: center;
}
.brand-ring img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; display: block; }
.public-brand b { display: block; font-size: 14.5px; letter-spacing: 0.2px; }
.public-brand small { display: block; font-size: 8.5px; letter-spacing: 1.3px; color: rgba(255, 255, 255, 0.68); }
.hero-cta {
  background: #d6242b; color: #fff; text-decoration: none;
  font-weight: 700; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  border-radius: 4px; padding: 9px 18px;
  transition: background 0.15s; white-space: nowrap;
}
.hero-cta:hover { background: #b81d23; }

.hero-main { padding-bottom: 2px; }
/* Hero type: pure white with opacity steps — tinted grays go muddy on the dark gradient */
.hero h1 { color: #fff; font-size: clamp(19px, 2.4vw, 25px); line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.2px; }
.hero-lede { color: rgba(255, 255, 255, 0.84); max-width: 560px; margin: 0; font-size: 13px; line-height: 1.5; }

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
  /* 1440 + 2×22px gutters, so card edges line up with .hero-inner */
  flex: 1; width: 100%; max-width: 1484px; margin: 0 auto; padding: 16px 22px 24px;
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

.public-stats.stat-row { margin-bottom: 0; grid-template-columns: repeat(4, 1fr); }
@media (max-width: 900px) { .public-stats.stat-row { grid-template-columns: repeat(2, 1fr); } }

.filter-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px !important;
}
.fb-label { font-size: 11px; font-weight: 700; letter-spacing: 0.6px; color: var(--ink-3, #8a93a2); text-transform: uppercase; }
.filter-bar select { max-width: 220px; font-size: 12.5px; }
.fb-busy { font-size: 11.5px; }

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
  padding: 12px;
}
.public-footer a { color: #003f87; font-weight: 700; text-decoration: none; }
.public-footer a:hover { text-decoration: underline; }
</style>
