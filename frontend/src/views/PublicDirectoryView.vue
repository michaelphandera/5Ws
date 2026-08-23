<script setup>
// Public organization directory — the "Who" register without a login, backed by
// /api/public/organizations (directory fields only). Signed-in users get name
// links into the full org profiles; anonymous visitors see the same table.
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import Icon from '../components/common/Icon.vue';
import SearchBox from '../components/common/SearchBox.vue';
import Pager from '../components/common/Pager.vue';
import { useClientTable } from '../composables/clientTable';
import { downloadCsv, exportFilename } from '../utils/csv';
import { ORG_TYPES, orgTypeLabel } from '../utils/orgTypes';
import drdmLogo from '../assets/drdm-logo.png';

const auth = useAuthStore();
const orgs = ref([]);
const loading = ref(false);
const failed = ref(false);
const typeFilter = ref('');
const commissionFilter = ref('');

onMounted(async () => {
  loading.value = true;
  try {
    // Plain axios: no token attachment, no 401 interceptor on a public call.
    const { data } = await axios.get('/api/public/organizations');
    orgs.value = data;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
});

// Filter options come from the data itself — the public page has no lookups store.
const commissions = computed(() => {
  const seen = new Map();
  for (const o of orgs.value) if (o.commission) seen.set(o.commission._id, o.commission.name);
  return [...seen.entries()].map(([id, name]) => ({ _id: id, name })).sort((a, b) => a.name.localeCompare(b.name));
});
const typesPresent = computed(() => {
  const present = new Set(orgs.value.map((o) => o.type));
  return ORG_TYPES.filter((t) => present.has(t.value));
});

const visible = computed(() =>
  orgs.value.filter(
    (o) =>
      (!typeFilter.value || o.type === typeFilter.value) &&
      (!commissionFilter.value || o.commission?._id === commissionFilter.value)
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
    exportFilename('Organization Directory', 'csv'),
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

// Bare domains are common in the register — make them clickable anyway.
const webHref = (w) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
</script>

<template>
  <div class="public-page">
    <header class="hero">
      <div class="hero-inner">
        <div class="hero-main">
          <span class="brand-ring hero-logo">
            <img :src="drdmLogo" alt="Department of Risk and Disaster Management and DICT, Seychelles" />
          </span>
          <div>
            <div class="hero-dept">Department of Risk and Disaster Management and DICT, Seychelles</div>
            <h1>ORGANIZATION DIRECTORY</h1>
            <div class="hero-sub">Civil society organizations of Seychelles</div>
          </div>
          <div class="hero-actions">
            <router-link class="hero-link" :to="{ name: 'welcome' }">Overview</router-link>
            <router-link v-if="auth.isAuthenticated" class="hero-cta" :to="{ name: 'dashboard' }">
              Open dashboard
            </router-link>
            <router-link v-else class="hero-cta" :to="{ name: 'login' }">Log in</router-link>
          </div>
        </div>
      </div>
    </header>
    <div class="flag-bar flag-bar-hero" aria-hidden="true"></div>

    <main class="public-body">
      <div v-if="failed" class="card empty" style="padding: 32px">
        The directory is temporarily unavailable. Please try again in a moment.
      </div>
      <div v-else class="card">
        <div class="directory-bar">
          <SearchBox v-model="q" placeholder="Search organizations…" />
          <select v-model="typeFilter" style="max-width: 240px">
            <option value="">All types</option>
            <option v-for="t in typesPresent" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <select v-model="commissionFilter" style="max-width: 260px">
            <option value="">All commissions / sectors</option>
            <option v-for="c in commissions" :key="c._id" :value="c._id">{{ c.name }}</option>
          </select>
          <span class="dir-count">{{ filtered.length }} organization{{ filtered.length === 1 ? '' : 's' }}</span>
          <button class="btn-outline" type="button" @click="exportCsv">Download CSV</button>
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
                <th>Email</th>
                <th>Phone</th>
                <th>Web</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in paged" :key="o._id">
                <td>
                  <router-link :to="{ name: 'directory-profile', params: { id: o._id } }" style="font-weight: 600">
                    {{ o.name }}
                  </router-link>
                </td>
                <td>{{ o.acronym }}</td>
                <td>{{ orgTypeLabel(o.type) }}</td>
                <td>{{ o.commission?.name || '—' }}</td>
                <td>
                  <a v-if="o.emails?.length" :href="`mailto:${o.emails[0]}`">{{ o.emails[0] }}</a>
                  <span v-else class="muted">—</span>
                </td>
                <td>{{ (o.phones || []).join(', ') || '—' }}</td>
                <td>
                  <a v-if="o.webpage" :href="webHref(o.webpage)" target="_blank" rel="noopener">
                    <Icon name="globe" :size="14" />
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
      </div>
    </main>

    <div class="flag-bar" aria-hidden="true"></div>
    <footer class="public-footer">
      5Ws Seychelles — Civil Society Coordination Platform · Department of Risk and Disaster Management and DICT ·
      <router-link :to="{ name: 'welcome' }">Overview</router-link> ·
      <router-link :to="{ name: 'login' }">Organization login</router-link>
    </footer>
  </div>
</template>

<style scoped>
/* Same page frame as PublicHomeView: shared gutter + content width tokens. */
.public-page {
  min-height: 100vh; background: var(--page-bg, #f2f5f9); display: flex; flex-direction: column;
  --page-gutter: clamp(20px, 4vw, 48px);
  --page-max: 1320px;
}

.hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(160deg, #001d3d 0%, #083a63 55%, #0a5148 115%);
  color: #fff;
  padding: 22px var(--page-gutter);
}
.hero-inner { position: relative; max-width: var(--page-max); margin: 0 auto; }
.hero-main { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.brand-ring {
  border-radius: 50%; flex-shrink: 0;
  background: #fff; border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  display: flex; align-items: center; justify-content: center;
}
.brand-ring img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; display: block; }
.hero-logo { width: 72px; height: 72px; }
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
.flag-bar-hero { border-top: 2px solid #fff; }

.public-body {
  flex: 1; box-sizing: content-box; width: auto; max-width: var(--page-max);
  margin: 0 auto; padding: 16px var(--page-gutter) 24px;
}

.directory-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.dir-count { margin-left: auto; font-size: 12px; color: var(--ink-3, #6b7280); white-space: nowrap; }
.btn-outline {
  background: #fff; color: #003f87; border: 1px solid #003f87; border-radius: 4px;
  padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
}
.btn-outline:hover { background: #eef3fa; }

.public-footer {
  text-align: center; font-size: 11.5px; color: var(--ink-3, #6b7280);
  padding: 12px var(--page-gutter);
}
.public-footer a { color: #003f87; font-weight: 700; text-decoration: none; }
.public-footer a:hover { text-decoration: underline; }
</style>
