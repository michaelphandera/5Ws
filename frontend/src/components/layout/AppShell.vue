<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useLookupsStore } from '../../stores/lookups';
import Icon from '../common/Icon.vue';
import ChangePasswordModal from '../common/ChangePasswordModal.vue';
import drdmLogo from '../../assets/drdm-logo.png';

const auth = useAuthStore();
const lookups = useLookupsStore();
const router = useRouter();
const route = useRoute();

onMounted(() => lookups.load());

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  organizations: 'Organizations',
  'organization-profile': 'Organizations',
  'organization-edit': 'Organizations',
  projects: 'Projects',
  'project-detail': 'Projects',
  activities: 'Activities',
  'activity-new': 'Activities',
  'activity-edit': 'Activities',
  'admin-organizations': 'Organizations',
  'admin-sectors': 'Sectors',
  'admin-locations': 'Locations',
  'admin-activity-types': 'Activity Types',
  'admin-beneficiary-groups': 'Beneficiary Groups',
  'admin-events': 'Disaster Events',
  'admin-inform-components': 'INFORM Components',
  'admin-disaggregations': 'Disaggregations',
  'admin-users': 'Users',
};
const pageTitle = computed(() => PAGE_TITLES[route.name] || '');
const isAdminPage = computed(() => String(route.name || '').startsWith('admin-'));

const initials = computed(() => {
  const n = auth.user?.name || auth.user?.username || '?';
  return n
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
});

const changingPassword = ref(false);

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <nav class="side-nav">
      <router-link to="/" class="brand" title="Go to the public home page">
        <img class="brand-emblem" :src="drdmLogo" alt="Department of Risk and Disaster Management and DICT, Seychelles" />
        <div class="brand-name">
          CIVIL SOCIETY COORDINATION PLATFORM
          <small>5Ws Seychelles</small>
        </div>
      </router-link>

      <div class="nav-section">Reporting</div>
      <router-link to="/dashboard"><Icon name="dashboard" /> Dashboard</router-link>
      <router-link to="/organizations"><Icon name="building" /> Organizations</router-link>
      <router-link to="/projects"><Icon name="folder" /> Projects</router-link>
      <router-link to="/activities"><Icon name="list" /> Activities</router-link>
      <router-link v-if="!auth.isAdmin && auth.myOrgId" :to="`/organizations/${auth.myOrgId}/edit`">
        <Icon name="userCog" /> My organization
      </router-link>

      <template v-if="auth.isAdmin">
        <div class="nav-section">Administration</div>
        <router-link to="/admin/organizations"><Icon name="building" /> Organizations</router-link>
        <router-link to="/admin/sectors"><Icon name="tag" /> Sectors</router-link>
        <router-link to="/admin/locations"><Icon name="pin" /> Locations</router-link>
        <router-link to="/admin/beneficiary-groups"><Icon name="users" /> Beneficiary Groups</router-link>
        <router-link to="/admin/disaggregations"><Icon name="layers" /> Disaggregations</router-link>
        <router-link to="/admin/events"><Icon name="alert" /> Disaster Events</router-link>
        <router-link to="/admin/inform-components"><Icon name="layers" /> INFORM Components</router-link>
        <router-link to="/admin/users"><Icon name="userCog" /> Users</router-link>
      </template>

      <div class="nav-footer">Who · What · Where · When · for Whom</div>
    </nav>

    <div class="main-area">
      <header class="top-bar">
        <span class="crumb">
          <template v-if="isAdminPage">Administration / </template><b>{{ pageTitle }}</b>
        </span>
        <div class="user-chip">
          <div class="user-meta">
            <div class="name">{{ auth.user?.name || auth.user?.username }}</div>
            <div class="role">
              {{ auth.isAdmin ? 'Administrator' : auth.user?.organization?.name || 'Organization user' }}
            </div>
          </div>
          <div class="avatar">{{ initials }}</div>
          <button class="btn btn-ghost btn-sm" title="Change password" @click="changingPassword = true">
            <Icon name="edit" /> Password
          </button>
          <button class="btn btn-ghost btn-sm" title="Sign out" @click="logout">
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </header>
      <main class="page">
        <div class="page-inner">
          <slot />
        </div>
      </main>
    </div>

    <ChangePasswordModal v-if="changingPassword" @close="changingPassword = false" />
  </div>
</template>
