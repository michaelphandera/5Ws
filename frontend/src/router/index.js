import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  // Public front door: overview stats, charts and coverage map without a login.
  { path: '/', name: 'welcome', component: () => import('../views/PublicHomeView.vue'), meta: { public: true } },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { guest: true } },
  { path: '/change-password', name: 'force-password-change', component: () => import('../views/ForcePasswordChangeView.vue') },
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
  { path: '/organizations', name: 'organizations', component: () => import('../views/OrganizationsView.vue') },
  { path: '/organizations/:id', name: 'organization-profile', component: () => import('../views/OrganizationProfileView.vue') },
  { path: '/organizations/:id/edit', name: 'organization-edit', component: () => import('../views/OrgProfileEditView.vue') },
  { path: '/projects', name: 'projects', component: () => import('../views/ProjectsView.vue') },
  { path: '/projects/:id', name: 'project-detail', component: () => import('../views/ProjectDetailView.vue') },
  { path: '/activities', name: 'activities', component: () => import('../views/ActivitiesView.vue') },
  { path: '/activities/new', name: 'activity-new', component: () => import('../views/ActivityFormView.vue') },
  { path: '/activities/:id/edit', name: 'activity-edit', component: () => import('../views/ActivityFormView.vue') },
  { path: '/admin/organizations', name: 'admin-organizations', component: () => import('../views/admin/OrganizationsAdmin.vue'), meta: { admin: true } },
  { path: '/admin/sectors', name: 'admin-sectors', component: () => import('../views/admin/SectorsAdmin.vue'), meta: { admin: true } },
  { path: '/admin/locations', name: 'admin-locations', component: () => import('../views/admin/LocationsAdmin.vue'), meta: { admin: true } },
  { path: '/admin/activity-types', name: 'admin-activity-types', component: () => import('../views/admin/ActivityTypesAdmin.vue'), meta: { admin: true } },
  { path: '/admin/beneficiary-groups', name: 'admin-beneficiary-groups', component: () => import('../views/admin/BeneficiaryGroupsAdmin.vue'), meta: { admin: true } },
  { path: '/admin/events', name: 'admin-events', component: () => import('../views/admin/EventsAdmin.vue'), meta: { admin: true } },
  { path: '/admin/disaggregations', name: 'admin-disaggregations', component: () => import('../views/admin/DisaggregationsAdmin.vue'), meta: { admin: true } },
  { path: '/admin/users', name: 'admin-users', component: () => import('../views/admin/UsersAdmin.vue'), meta: { admin: true } },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) return true;
  if (to.meta.guest) {
    return auth.isAuthenticated ? { name: 'dashboard' } : true;
  }
  if (!auth.isAuthenticated) return { name: 'login' };
  // A user on a temporary password must set a new one before anything else.
  if (auth.user?.forcePasswordChange && to.name !== 'force-password-change') {
    return { name: 'force-password-change' };
  }
  if (to.meta.admin && !auth.isAdmin) return { name: 'dashboard' };
  return true;
});

export default router;
