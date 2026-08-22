<script setup>
// Landing page for users signed in with a temporary password: the backend
// rejects every non-/auth request until they set their own password.
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../composables/toast';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'New passwords do not match';
    return;
  }
  busy.value = true;
  try {
    await api.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    await auth.refreshUser(); // clears forcePasswordChange in the store
    toast.success('Password updated — welcome!');
    router.push({ name: 'dashboard' });
  } catch (e) {
    error.value = e.response?.data?.error || e.response?.data?.details?.[0]?.msg || 'Password change failed';
  } finally {
    busy.value = false;
  }
}

function signOut() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="force-page">
    <div class="card force-card">
      <h2>Set a new password</h2>
      <p class="muted" style="margin: 0 0 14px">
        Your administrator issued you a temporary password. Choose your own password to continue.
      </p>
      <form @submit.prevent="submit">
        <label class="field">
          <span>Temporary password *</span>
          <input v-model="currentPassword" type="password" autocomplete="current-password" required autofocus />
        </label>
        <label class="field">
          <span>New password * (min 8 characters)</span>
          <input v-model="newPassword" type="password" autocomplete="new-password" required minlength="8" />
        </label>
        <label class="field">
          <span>Confirm new password *</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" required minlength="8" />
        </label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <div class="modal-actions">
          <button type="button" class="btn" @click="signOut">Sign out</button>
          <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save and continue' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.force-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--page-bg, #f2f5f9);
  padding: 24px;
}
.force-card { width: min(440px, 100%); }
</style>
