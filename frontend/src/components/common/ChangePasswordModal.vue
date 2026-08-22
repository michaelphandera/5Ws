<script setup>
import { ref } from 'vue';
import api from '../../api/client';
import { useToast } from '../../composables/toast';
import Icon from './Icon.vue';

const emit = defineEmits(['close']);
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
    toast.success('Password updated');
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error || e.response?.data?.details?.[0]?.msg || 'Password change failed';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" style="max-width: 420px">
      <h2>Change password</h2>
      <form @submit.prevent="submit">
        <label class="field">
          <span>Current password *</span>
          <input v-model="currentPassword" type="password" autocomplete="current-password" required />
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
          <button type="button" class="btn" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><Icon name="check" /> {{ busy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
