<script setup>
// Public organization profile — the organization directory's detail page, backed by
// /api/public/organizations/:id. Same shape as the in-app profile, minus the
// internal fields (chairperson, addresses, notes, registration no.).
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import Icon from '../components/common/Icon.vue';
import PointPickerMap from '../components/common/PointPickerMap.vue';
import { orgTypeLabel } from '../utils/orgTypes';
import { googleEarthUrl } from '../utils/googleEarth';
import drdmLogo from '../assets/drdm-logo.png';

const route = useRoute();
const auth = useAuthStore();
const org = ref(null);
const notFound = ref(false);

onMounted(async () => {
  try {
    // Plain axios: no token attachment, no 401 interceptor on a public call.
    const { data } = await axios.get(`/api/public/organizations/${route.params.id}`);
    org.value = data;
  } catch {
    notFound.value = true;
  }
});

const fmt = (d) => (d ? d.slice(0, 10) : '—');
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
            <h1>{{ org ? org.name : 'ORGANIZATION DIRECTORY' }}</h1>
            <div class="hero-sub">Civil society organization profile</div>
          </div>
          <div class="hero-actions">
            <router-link class="hero-link" :to="{ name: 'directory' }">Full directory</router-link>
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
      <div v-if="notFound" class="card empty" style="padding: 32px">Organization not found.</div>
      <template v-else-if="org">
        <div class="page-head">
          <div>
            <h1 style="margin: 0">
              {{ org.name }}
              <span v-if="org.acronym" class="muted" style="font-size: 16px">({{ org.acronym }})</span>
            </h1>
            <p class="muted" style="margin: 4px 0 0">
              {{ orgTypeLabel(org.type) }}
              <span v-if="org.commission" class="badge badge-planned" style="margin-left: 8px">{{ org.commission.name }}</span>
            </p>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom: 16px">
          <div class="card">
            <div class="card-title">About</div>
            <p v-if="org.description || org.aim" style="margin: 0 0 12px; line-height: 1.55">
              {{ org.description || org.aim }}
            </p>
            <table class="data">
              <tbody>
                <tr v-if="org.aim && org.description"><td class="muted">Aim</td><td>{{ org.aim }}</td></tr>
                <tr v-if="org.hqDistrict"><td class="muted">HQ district</td><td>{{ org.hqDistrict.name }}{{ org.hqDistrict.code ? ` (${org.hqDistrict.code})` : '' }}</td></tr>
                <tr v-if="org.otherSectors?.length"><td class="muted">Also works in</td><td>{{ org.otherSectors.map((s) => s.name).join(', ') }}</td></tr>
                <tr v-if="org.dateFounded"><td class="muted">Founded</td><td>{{ org.dateFounded }}</td></tr>
                <tr v-if="org.emails?.length">
                  <td class="muted">Email</td>
                  <td><a :href="`mailto:${org.emails[0]}`">{{ org.emails.join(', ') }}</a></td>
                </tr>
                <tr v-if="org.phones?.length"><td class="muted">Phone</td><td>{{ org.phones.join(', ') }}</td></tr>
                <tr v-if="org.webpage">
                  <td class="muted">Website / social</td>
                  <td><a :href="webHref(org.webpage)" target="_blank" rel="noopener">{{ org.webpage }}</a></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 10px">
              <div class="card-title">Office location</div>
              <a
                v-if="org.location?.lat != null"
                class="btn btn-sm btn-ghost"
                :href="googleEarthUrl(org.location.lat, org.location.lng)"
                target="_blank"
                rel="noopener"
                title="Fly to this office in Google Earth"
              >
                <Icon name="globe" :size="14" /> Google Earth
              </a>
            </div>
            <PointPickerMap v-if="org.location?.lat != null" :modelValue="org.location" readonly height="280px" />
            <div v-else class="empty" style="padding: 32px 12px">No map location set.</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Projects</div>
          <div class="card-sub">{{ org.projects.length }} project{{ org.projects.length === 1 ? '' : 's' }} reported</div>
          <div v-if="!org.projects.length" class="empty" style="padding: 24px 12px">No projects reported yet.</div>
          <table v-else class="data">
            <thead>
              <tr><th>Project</th><th>Status</th><th>Start</th><th>End</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in org.projects" :key="p._id">
                <td>
                  <!-- Project pages are behind login — link only for signed-in users -->
                  <router-link
                    v-if="auth.isAuthenticated"
                    :to="{ name: 'project-detail', params: { id: p._id } }"
                    style="font-weight: 600"
                  >
                    {{ p.title }}
                  </router-link>
                  <b v-else>{{ p.title }}</b>
                </td>
                <td><span class="badge" :class="`badge-${p.status}`">{{ p.status }}</span></td>
                <td>{{ fmt(p.startDate) }}</td>
                <td>{{ fmt(p.endDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="spinner">Loading…</div>
    </main>

    <div class="flag-bar" aria-hidden="true"></div>
    <footer class="public-footer">
      5Ws Seychelles — Civil Society Coordination Platform · Department of Risk and Disaster Management and DICT ·
      <router-link :to="{ name: 'directory' }">Organization directory</router-link> ·
      <router-link :to="{ name: 'login' }">Organization login</router-link>
    </footer>
  </div>
</template>

<style scoped>
/* Same page frame as the other public views: shared gutter + width tokens. */
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
  color: #fff; font-size: clamp(20px, 2.6vw, 28px); line-height: 1.15;
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

.public-footer {
  text-align: center; font-size: 11.5px; color: var(--ink-3, #6b7280);
  padding: 12px var(--page-gutter);
}
.public-footer a { color: #003f87; font-weight: 700; text-decoration: none; }
.public-footer a:hover { text-decoration: underline; }
</style>
