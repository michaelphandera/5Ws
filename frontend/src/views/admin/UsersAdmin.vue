<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/client';
import Icon from '../../components/common/Icon.vue';
import SearchBox from '../../components/common/SearchBox.vue';
import Pager from '../../components/common/Pager.vue';
import { useLookupsStore } from '../../stores/lookups';
import { useToast } from '../../composables/toast';
import { useClientTable } from '../../composables/clientTable';
import { downloadCsv } from '../../utils/csv';

const toast = useToast();

const lookups = useLookupsStore();
const users = ref([]);
const editing = ref(null);
const error = ref('');

async function load() {
  const { data } = await api.get('/users');
  users.value = data;
}
onMounted(load);

const { q, page, pages, filtered, paged } = useClientTable(users, {
  searchText: (u) => [u.username, u.name, u.email, u.role, u.organization?.name].filter(Boolean).join(' '),
});

function exportCsv() {
  downloadCsv(
    'users.csv',
    ['Username', 'Name', 'Email', 'Role', 'Organization', 'Status'],
    filtered.value.map((u) => [
      u.username,
      u.name || '',
      u.email || '',
      u.role,
      u.organization?.name || '',
      u.active ? 'active' : 'inactive',
    ])
  );
}

function openNew() {
  editing.value = { username: '', name: '', email: '', role: 'org', organization: '', password: '', forcePasswordChange: false };
  error.value = '';
}

function openEdit(u) {
  editing.value = {
    _id: u.id,
    username: u.username,
    name: u.name || '',
    email: u.email || '',
    role: u.role,
    organization: u.organization?._id || '',
    password: '',
    forcePasswordChange: !!u.forcePasswordChange,
  };
  error.value = '';
}

async function save() {
  error.value = '';
  const body = { ...editing.value };
  delete body._id;
  if (!body.password) delete body.password;
  if (!body.organization) delete body.organization;
  if (!body.email) delete body.email;
  try {
    if (editing.value._id) await api.put(`/users/${editing.value._id}`, body);
    else await api.post('/users', body);
    toast.success(editing.value._id ? 'User updated' : 'User created');
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || e.response?.data?.details?.[0]?.msg || 'Save failed';
  }
}

async function toggleActive(u) {
  try {
    await api.patch(`/users/${u.id}/active`, { active: !u.active });
    toast.success(u.active ? 'Account deactivated' : 'Account activated');
    await load();
  } catch (e) {
    toast.error(e.response?.data?.error || 'Failed to update account');
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Users</h1>
        <p class="lede">Admins manage master data; org focal points report their own projects and activities</p>
      </div>
      <div class="head-actions">
        <SearchBox v-model="q" placeholder="Search users…" />
        <button class="btn" @click="exportCsv"><Icon name="download" /> Export CSV</button>
        <button class="btn btn-primary" @click="openNew"><Icon name="plus" /> New user</button>
      </div>
    </div>

    <div class="card">
      <div v-if="!filtered.length" class="empty">
        <div class="empty-icon"><Icon name="search" :size="20" /></div>
        <div><b>No users match “{{ q }}”.</b></div>
      </div>
      <table v-else class="data">
        <thead>
          <tr>
            <th>Username</th><th>Name</th><th>Role</th><th>Organization</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in paged" :key="u.id">
            <td>{{ u.username }}</td>
            <td>{{ u.name }}</td>
            <td><span class="badge" :class="u.role === 'admin' ? 'badge-ongoing' : 'badge-planned'">{{ u.role }}</span></td>
            <td>{{ u.organization?.name || '—' }}</td>
            <td>
              <span class="badge" :class="u.active ? 'badge-completed' : 'badge-suspended'">
                {{ u.active ? 'active' : 'inactive' }}
              </span>
            </td>
            <td style="text-align: right; white-space: nowrap">
              <button class="btn btn-sm" @click="openEdit(u)"><Icon name="edit" :size="13" /> Edit</button>
              <button class="btn btn-sm" style="margin-left: 6px" @click="toggleActive(u)">
                {{ u.active ? 'Deactivate' : 'Activate' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
    </div>

    <div v-if="editing" class="modal-backdrop" @click.self="editing = null">
      <div class="modal">
        <h2>{{ editing._id ? 'Edit user' : 'New user' }}</h2>
        <form @submit.prevent="save">
          <label class="field">
            <span>Username *</span>
            <input v-model="editing.username" required :disabled="!!editing._id" />
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Full name</span>
              <input v-model="editing.name" />
            </label>
            <label class="field">
              <span>Email</span>
              <input v-model="editing.email" type="email" />
            </label>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Role *</span>
              <select v-model="editing.role" required>
                <option value="admin">Administrator</option>
                <option value="org">Organization focal point</option>
              </select>
            </label>
            <label class="field" v-if="editing.role === 'org'">
              <span>Organization *</span>
              <select v-model="editing.organization" required>
                <option value="">—</option>
                <option v-for="o in lookups.organizations" :key="o._id" :value="o._id">{{ o.name }}</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>{{ editing._id ? 'New password (leave blank to keep current)' : 'Password * (min 8 chars)' }}</span>
            <input v-model="editing.password" type="password" :required="!editing._id" minlength="8" />
          </label>
          <label class="field" style="display: flex; align-items: center; gap: 8px; flex-direction: row">
            <input v-model="editing.forcePasswordChange" type="checkbox" style="width: auto" />
            <span style="margin: 0">Require password change at next login (for temporary passwords)</span>
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
