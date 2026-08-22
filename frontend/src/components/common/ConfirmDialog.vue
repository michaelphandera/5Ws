<script setup>
defineProps({
  title: { type: String, default: 'Confirm' },
  message: { type: String, required: true },
});
const emit = defineEmits(['confirm', 'cancel']);
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal" style="width: min(420px, 92vw)">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <div class="modal-actions">
        <button class="btn" @click="emit('cancel')">Cancel</button>
        <button class="btn btn-danger" @click="emit('confirm')">Confirm</button>
      </div>
    </div>
  </div>
</template>
