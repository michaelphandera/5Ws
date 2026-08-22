<script setup>
// Organization profile editor — used by admins (any org) and by org focal
// points for their own organization ("My organization" in the sidebar).
// The backend enforces ownership (allowOwnOrgUpdate); the guard here is UX.
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import Icon from '../components/common/Icon.vue';
import PointPickerMap from '../components/common/PointPickerMap.vue';
import { useAuthStore } from '../stores/auth';
import { useLookupsStore } from '../stores/lookups';
import { useToast } from '../composables/toast';
import { ORG_TYPES } from '../utils/orgTypes';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const lookups = useLookupsStore();
const toast = useToast();

const form = ref(null);
const location = ref(null);
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  if (!auth.isAdmin && auth.myOrgId !== route.params.id) {
    router.replace({ name: 'organizations' });
    return;
  }
  await lookups.load();
  const { data } = await api.get(`/organizations/${route.params.id}`);
  form.value = {
    name: data.name,
    acronym: data.acronym || '',
    type: data.type || 'civil-society',
    commission: data.commission?._id || data.commission || '',
    aim: data.aim || '',
    description: data.description || '',
    dateFounded: data.dateFounded || '',
    chairperson: data.chairperson || '',
    emails: (data.emails || []).join(', '),
    phones: (data.phones || []).join(', '),
    postalAddress: data.postalAddress || '',
    physicalAddress: data.physicalAddress || '',
    webpage: data.webpage || '',
  };
  location.value = data.location?.lat != null ? { ...data.location } : null;
});

const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

async function save() {
  error.value = '';
  busy.value = true;
  try {
    const f = form.value;
    await api.put(`/organizations/${route.params.id}`, {
      name: f.name,
      acronym: f.acronym || null,
      type: f.type,
      commission: f.commission || null,
      aim: f.aim || null,
      description: f.description || null,
      dateFounded: f.dateFounded || null,
      chairperson: f.chairperson || null,
      emails: splitList(f.emails),
      phones: splitList(f.phones),
      postalAddress: f.postalAddress || null,
      physicalAddress: f.physicalAddress || null,
      webpage: f.webpage || null,
      location: location.value?.lat != null ? location.value : null,
    });
    toast.success('Organization profile saved');
    lookups.load(true); // keep org markers and pickers fresh
    router.push({ name: 'organization-profile', params: { id: route.params.id } });
  } catch (e) {
    error.value = e.response?.data?.error || 'Save failed';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="form">
    <div class="page-head">
      <div>
        <h1>Edit organization profile</h1>
        <p class="lede">{{ form.name }}</p>
      </div>
    </div>

    <form @submit.prevent="save">
      <div class="grid-2" style="margin-bottom: 16px; align-items: start">
        <div class="card">
          <div class="card-title">Details</div>
          <label class="field">
            <span>Name *</span>
            <input v-model="form.name" required :disabled="!auth.isAdmin" />
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Acronym</span>
              <input v-model="form.acronym" />
            </label>
            <label class="field">
              <span>Organization type</span>
              <select v-model="form.type">
                <option v-for="t in ORG_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>Commission / Sector</span>
            <select v-model="form.commission">
              <option value="">—</option>
              <option v-for="s in lookups.sectors" :key="s._id" :value="s._id">{{ s.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Aim</span>
            <textarea v-model="form.aim" rows="2" />
          </label>
          <label class="field">
            <span>Description (shown on the profile)</span>
            <textarea v-model="form.description" rows="3" />
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Date founded</span>
              <input v-model="form.dateFounded" />
            </label>
            <label class="field">
              <span>Chairperson</span>
              <input v-model="form.chairperson" />
            </label>
          </div>
        </div>

        <div>
          <div class="card" style="margin-bottom: 16px">
            <div class="card-title">Contact</div>
            <label class="field">
              <span>Emails (comma-separated)</span>
              <input v-model="form.emails" placeholder="info@example.org, chair@example.org" />
            </label>
            <label class="field">
              <span>Phones (comma-separated)</span>
              <input v-model="form.phones" placeholder="+248 2 000 000" />
            </label>
            <label class="field">
              <span>Postal address</span>
              <input v-model="form.postalAddress" />
            </label>
            <label class="field">
              <span>Physical address</span>
              <input v-model="form.physicalAddress" />
            </label>
            <label class="field">
              <span>Webpage</span>
              <input v-model="form.webpage" placeholder="https://…" />
            </label>
          </div>

          <div class="card">
            <div class="card-title">Office location</div>
            <div class="card-sub">Click the map to place the point — it appears on the coverage maps</div>
            <PointPickerMap v-model="location" height="240px" />
          </div>
        </div>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>
      <div class="modal-actions" style="justify-content: flex-start">
        <button type="submit" class="btn btn-primary" :disabled="busy"><Icon name="check" /> {{ busy ? 'Saving…' : 'Save profile' }}</button>
        <router-link class="btn" :to="{ name: 'organization-profile', params: { id: route.params.id } }">Cancel</router-link>
      </div>
    </form>
  </div>
  <div v-else class="spinner">Loading…</div>
</template>
