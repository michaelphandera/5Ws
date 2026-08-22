<script setup>
defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true },
  total: { type: Number, default: null }, // row count across all pages, shown when given
});
defineEmits(['go']);
</script>

<template>
  <div v-if="pages > 1" class="pager">
    <button class="btn btn-sm" :disabled="page <= 1" @click="$emit('go', page - 1)">← Prev</button>
    <span class="muted">
      Page {{ page }} of {{ pages }}<template v-if="total != null"> · {{ total.toLocaleString() }} rows</template>
    </span>
    <button class="btn btn-sm" :disabled="page >= pages" @click="$emit('go', page + 1)">Next →</button>
  </div>
</template>
