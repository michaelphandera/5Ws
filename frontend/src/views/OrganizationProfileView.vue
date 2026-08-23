<script setup>
// Organization profile: identity, contacts, map point and its project portfolio.
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api/client';
import Icon from '../components/common/Icon.vue';
import PointPickerMap from '../components/common/PointPickerMap.vue';
import { useAuthStore } from '../stores/auth';
import { orgTypeLabel } from '../utils/orgTypes';
import { googleEarthUrl } from '../utils/googleEarth';

const route = useRoute();
const auth = useAuthStore();
const org = ref(null);
const projects = ref([]);
const activityTotal = ref(0);
const notFound = ref(false);

const canEdit = computed(() => auth.isAdmin || auth.myOrgId === org.value?._id);

async function load() {
  try {
    const [o, p, a] = await Promise.all([
      api.get(`/organizations/${route.params.id}`),
      api.get('/projects', { params: { organization: route.params.id } }),
      api.get('/activities', { params: { organization: route.params.id, limit: 1 } }),
    ]);
    org.value = o.data;
    projects.value = p.data;
    activityTotal.value = a.data.total;
  } catch {
    notFound.value = true;
  }
}
onMounted(load);

const fmt = (d) => (d ? d.slice(0, 10) : '—');
</script>

<template>
  <div v-if="notFound" class="card empty" style="padding: 32px">Organization not found.</div>
  <div v-else-if="org">
    <div class="page-head">
      <div>
        <h1>{{ org.name }} <span v-if="org.acronym" class="muted" style="font-size: 16px">({{ org.acronym }})</span></h1>
        <p class="muted">
          {{ orgTypeLabel(org.type) }}
          <span v-if="org.commission" class="badge badge-planned" style="margin-left: 8px">{{ org.commission.name }}</span>
          <span v-if="org.active === false" class="badge badge-suspended" style="margin-left: 6px">inactive</span>
        </p>
      </div>
      <div class="head-actions">
        <router-link v-if="canEdit" class="btn btn-primary" :to="{ name: 'organization-edit', params: { id: org._id } }">
          <Icon name="edit" /> Edit profile
        </router-link>
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
            <tr v-if="org.registrationNo"><td class="muted">Registration No.</td><td>{{ org.registrationNo }}</td></tr>
            <tr v-if="org.hqDistrict"><td class="muted">HQ district</td><td>{{ org.hqDistrict.name }}{{ org.hqDistrict.code ? ` (${org.hqDistrict.code})` : '' }}</td></tr>
            <tr v-if="org.otherSectors?.length"><td class="muted">Also works in</td><td>{{ org.otherSectors.map((s) => s.name).join(', ') }}</td></tr>
            <tr v-if="org.dateFounded"><td class="muted">Founded</td><td>{{ org.dateFounded }}</td></tr>
            <tr v-if="org.chairperson"><td class="muted">Chairperson</td><td>{{ org.chairperson }}</td></tr>
            <tr v-if="org.contactPerson"><td class="muted">Contact person</td><td>{{ org.contactPerson }}</td></tr>
            <tr v-if="org.emails?.length"><td class="muted">Email</td><td>{{ org.emails.join(', ') }}</td></tr>
            <tr v-if="org.phones?.length"><td class="muted">Phone</td><td>{{ org.phones.join(', ') }}</td></tr>
            <tr v-if="org.postalAddress"><td class="muted">Postal address</td><td>{{ org.postalAddress }}</td></tr>
            <tr v-if="org.physicalAddress"><td class="muted">Physical address</td><td>{{ org.physicalAddress }}</td></tr>
            <tr v-if="org.webpage">
              <td class="muted">Website / social</td>
              <td><a :href="org.webpage.startsWith('http') ? org.webpage : `https://${org.webpage}`" target="_blank" rel="noopener">{{ org.webpage }}</a></td>
            </tr>
            <tr v-if="org.notes"><td class="muted">Notes</td><td>{{ org.notes }}</td></tr>
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
        <div v-else class="empty" style="padding: 32px 12px">
          No map location set{{ canEdit ? ' — add one via “Edit profile”' : '' }}.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Projects</div>
      <div class="card-sub">{{ projects.length }} projects · {{ activityTotal }} activities reported</div>
      <div v-if="!projects.length" class="empty" style="padding: 24px 12px">No projects reported yet.</div>
      <table v-else class="data">
        <thead>
          <tr><th>Project</th><th>Status</th><th>Start</th><th>End</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p._id">
            <td>
              <router-link :to="{ name: 'project-detail', params: { id: p._id } }" style="font-weight: 600">
                {{ p.title }}
              </router-link>
            </td>
            <td><span class="badge" :class="`badge-${p.status}`">{{ p.status }}</span></td>
            <td>{{ fmt(p.startDate) }}</td>
            <td>{{ fmt(p.endDate) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="spinner">Loading…</div>
</template>
