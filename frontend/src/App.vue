<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useToast } from './composables/toast';
import AppShell from './components/layout/AppShell.vue';

const route = useRoute();
const auth = useAuthStore();
const { toasts } = useToast();
// Public and guest pages carry their own layout, even for signed-in users.
const showShell = computed(
  () => auth.isAuthenticated && !route.meta.public && !route.meta.guest && route.name !== 'force-password-change'
);
</script>

<template>
  <AppShell v-if="showShell">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>
  </AppShell>
  <router-view v-else />

  <Teleport to="body">
    <div class="toast-stack">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type" role="status">
        <span class="toast-dot"></span>
        {{ t.message }}
      </div>
    </div>
  </Teleport>
</template>
