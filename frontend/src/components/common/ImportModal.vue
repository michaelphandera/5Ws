<script setup>
// CSV import flow: pick a file → dry-run validation preview → confirm import.
// The dry run returns row-level errors/warnings; the import button stays
// disabled until every row validates.
import { ref, computed } from 'vue';
import api from '../../api/client';
import Icon from './Icon.vue';
import { useToast } from '../../composables/toast';

const props = defineProps({
  title: { type: String, required: true },
  entityLabel: { type: String, default: 'records' }, // "activities" / "organizations"
  templateUrl: { type: String, required: true },
  uploadUrl: { type: String, required: true },
});
const emit = defineEmits(['close', 'imported']);
const toast = useToast();

const file = ref(null);
const preview = ref(null); // { summary, rows }
const busy = ref(false);
const error = ref('');

const createCount = computed(
  () => preview.value?.summary?.activitiesToCreate ?? preview.value?.summary?.organizationsToCreate ?? 0
);
const problemRows = computed(() => (preview.value?.rows || []).filter((r) => r.errors.length || r.warnings.length));

function downloadTemplate() {
  api.get(props.templateUrl, { responseType: 'blob' }).then((res) => {
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = props.templateUrl.split('/').slice(-1)[0];
    a.click();
    URL.revokeObjectURL(url);
  });
}

function fileChosen(e) {
  file.value = e.target.files[0] || null;
  preview.value = null;
  error.value = '';
  if (file.value) dryRun();
}

async function dryRun() {
  busy.value = true;
  error.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file.value);
    const { data } = await api.post(`${props.uploadUrl}?dryRun=true`, fd);
    preview.value = data;
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not read the file';
  } finally {
    busy.value = false;
  }
}

async function commit() {
  busy.value = true;
  error.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file.value);
    const { data } = await api.post(props.uploadUrl, fd);
    toast.success(`Imported ${data.created} ${props.entityLabel}`);
    emit('imported');
  } catch (e) {
    // Data changed between dry-run and commit → show the fresh row errors.
    if (e.response?.data?.rows) preview.value = e.response.data;
    error.value = e.response?.data?.error || 'Import failed — review the rows below';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal" style="max-width: 720px">
      <h2>{{ title }}</h2>

      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px">
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          @change="fileChosen"
        />
        <button type="button" class="btn btn-sm" @click="downloadTemplate">
          <Icon name="download" :size="13" /> Download template
        </button>
      </div>
      <p class="muted" style="font-size: 12px; margin: -6px 0 14px">
        The template is an Excel workbook with an Instructions sheet and reference sheets listing the
        organizations, locations and codes already in the system. Fill in its <b>Data</b> sheet and upload
        the workbook (or a CSV) here.
      </p>

      <div v-if="busy" class="spinner">Checking…</div>

      <template v-else-if="preview">
        <div class="card" style="padding: 12px; margin-bottom: 12px">
          <b>{{ preview.summary.totalRows }}</b> rows read ·
          <span :style="preview.summary.errorRows ? 'color: var(--red-600, #b3261e); font-weight: 600' : ''">
            {{ preview.summary.errorRows }} with errors
          </span>
          · {{ preview.summary.warningRows }} with warnings ·
          <b>{{ createCount }}</b> {{ entityLabel }} will be created
        </div>

        <div v-if="problemRows.length" class="table-scroll" style="max-height: 260px; overflow-y: auto; margin-bottom: 12px">
          <table class="data" style="font-size: 12.5px">
            <thead>
              <tr><th style="width: 60px">Line</th><th>Issues</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in problemRows" :key="r.line">
                <td><b>{{ r.line }}</b></td>
                <td>
                  <div v-for="(e, i) in r.errors" :key="`e${i}`" style="color: var(--red-600, #b3261e)">✕ {{ e }}</div>
                  <div v-for="(w, i) in r.warnings" :key="`w${i}`" style="color: #935610">⚠ {{ w }}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted" style="font-size: 12.5px">All rows validate — ready to import.</p>
      </template>

      <p v-if="error" class="form-error">{{ error }}</p>

      <div class="modal-actions">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || !preview || preview.summary.errorRows > 0 || !createCount"
          @click="commit"
        >
          <Icon name="check" /> Import {{ createCount }} {{ entityLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
