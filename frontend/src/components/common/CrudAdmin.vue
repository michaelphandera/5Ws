<script setup>
// Generic master-data admin: list + modal form + delete, driven by a field spec.
// Field spec: { key, label, type: 'text'|'textarea'|'select'|'multiselect'|'color'|'number'|'list', options?, required? }
// 'list' renders a text input holding a comma-separated string <-> array field.
// 'multiselect' renders a multiple <select> bound to an array of ids.
import { ref, onMounted } from 'vue';
import api from '../../api/client';
import ConfirmDialog from './ConfirmDialog.vue';
import Icon from './Icon.vue';
import SearchBox from './SearchBox.vue';
import Pager from './Pager.vue';
import { useLookupsStore } from '../../stores/lookups';
import { useToast } from '../../composables/toast';
import { useClientTable } from '../../composables/clientTable';
import { downloadCsv, exportFilename } from '../../utils/csv';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  resource: { type: String, required: true }, // e.g. 'sectors'
  columns: { type: Array, required: true }, // [{key,label,render?}]
  fields: { type: Array, required: true },
});

const lookups = useLookupsStore();
const toast = useToast();
const items = ref([]);
const loading = ref(false);
const error = ref('');
const editing = ref(null); // null = closed, {} = new, {...doc} = edit
const deleting = ref(null);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get(`/${props.resource}`);
    items.value = data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const { q, page, pages, filtered, paged } = useClientTable(items, {
  searchText: (item) => props.columns.map((c) => cellValue(item, c)).join(' '),
});

function exportCsv() {
  // 'inform-components' -> 'Inform_Components' for the standard filename.
  const descriptor = props.resource
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('_');
  downloadCsv(
    exportFilename(descriptor, 'csv'),
    props.columns.map((c) => c.label),
    filtered.value.map((item) => props.columns.map((c) => cellValue(item, c)))
  );
}

function openNew() {
  const blank = {};
  for (const f of props.fields) blank[f.key] = f.type === 'multiselect' ? [] : f.type === 'number' ? null : '';
  editing.value = blank;
  error.value = '';
}

function openEdit(item) {
  const copy = {};
  for (const f of props.fields) {
    let v = item[f.key];
    if (f.type === 'list' && Array.isArray(v)) v = v.join(', ');
    else if (f.type === 'multiselect') v = (v || []).map((x) => x?._id || x);
    else if (v && typeof v === 'object' && v._id) v = v._id;
    if (f.type === 'date' && v) v = String(v).slice(0, 10);
    copy[f.key] = v ?? (f.type === 'multiselect' ? [] : '');
  }
  copy._id = item._id;
  editing.value = copy;
  error.value = '';
}

async function save() {
  error.value = '';
  const body = { ...editing.value };
  delete body._id;
  // Creates omit blank fields (schema defaults apply); updates send null so a
  // previously-set optional field can be cleared.
  for (const k of Object.keys(body)) if (body[k] === '') body[k] = editing.value._id ? null : undefined;
  // List fields: comma-separated string -> array ([] clears on update).
  for (const f of props.fields) {
    if (f.type !== 'list') continue;
    const v = body[f.key];
    if (typeof v === 'string') body[f.key] = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (v === null) body[f.key] = [];
  }
  try {
    if (editing.value._id) await api.put(`/${props.resource}/${editing.value._id}`, body);
    else await api.post(`/${props.resource}`, body);
    toast.success(editing.value._id ? 'Changes saved' : 'Record created');
    editing.value = null;
    await load();
    lookups.load(true); // keep the global lookups cache fresh
  } catch (e) {
    error.value = e.response?.data?.error || 'Save failed';
  }
}

async function doDelete() {
  try {
    const { data } = await api.delete(`/${props.resource}/${deleting.value._id}`);
    toast.success(data.softDeleted ? 'Record in use — deactivated instead' : 'Record deleted');
    deleting.value = null;
    await load();
    lookups.load(true);
  } catch (e) {
    deleting.value = null;
    toast.error(e.response?.data?.error || 'Delete failed');
  }
}

function cellValue(item, col) {
  if (col.render) return col.render(item);
  const v = item[col.key];
  if (v && typeof v === 'object') return v.name || '';
  return v ?? '';
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ title }}</h1>
        <p class="lede">{{ subtitle || `${items.length} records` }}</p>
      </div>
      <div class="head-actions">
        <SearchBox v-model="q" />
        <button class="btn" @click="exportCsv"><Icon name="download" /> Export CSV</button>
        <slot name="actions" :reload="load" />
        <button class="btn btn-primary" @click="openNew"><Icon name="plus" /> New</button>
      </div>
    </div>

    <div class="card">
      <div v-if="loading" class="spinner">Loading…</div>
      <div v-else-if="!items.length" class="empty">
        <div class="empty-icon"><Icon name="inbox" :size="20" /></div>
        <div><b>No records yet.</b></div>
        <div>Use “New” to add the first one.</div>
      </div>
      <div v-else-if="!filtered.length" class="empty">
        <div class="empty-icon"><Icon name="search" :size="20" /></div>
        <div><b>No records match “{{ q }}”.</b></div>
      </div>
      <div v-else class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
              <th style="width: 150px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in paged" :key="item._id" :style="item.active === false ? 'opacity:.55' : ''">
              <td v-for="col in columns" :key="col.key">
                <template v-if="col.key === 'color'">
                  <span class="dot" :style="{ background: item.color }"></span>{{ item.color }}
                </template>
                <template v-else>{{ cellValue(item, col) }}</template>
              </td>
              <td class="row-actions">
                <span v-if="item.active === false" class="badge badge-suspended" style="margin-right: 6px">inactive</span>
                <button class="btn btn-sm" @click="openEdit(item)"><Icon name="edit" :size="13" /> Edit</button>
                <button class="btn btn-sm btn-danger" style="margin-left: 6px" @click="deleting = item">
                  <Icon name="trash" :size="13" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
    </div>

    <div v-if="editing" class="modal-backdrop" @click.self="editing = null">
      <div class="modal">
        <h2>{{ editing._id ? 'Edit' : 'New' }} — {{ title }}</h2>
        <form @submit.prevent="save">
          <template v-for="f in fields" :key="f.key">
            <label class="field">
              <span>{{ f.label }}{{ f.required ? ' *' : '' }}</span>
              <textarea v-if="f.type === 'textarea'" v-model="editing[f.key]" rows="3" :required="f.required" />
              <select v-else-if="f.type === 'select'" v-model="editing[f.key]" :required="f.required">
                <option value="">—</option>
                <option v-for="o in f.options()" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <select v-else-if="f.type === 'multiselect'" v-model="editing[f.key]" multiple size="5">
                <option v-for="o in f.options()" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <input v-else-if="f.type === 'color'" v-model="editing[f.key]" type="color" style="height: 38px; padding: 3px" />
              <input v-else-if="f.type === 'list'" type="text" v-model="editing[f.key]" :required="f.required" :placeholder="f.placeholder || 'Comma-separated'" />
              <input v-else :type="f.type || 'text'" v-model="editing[f.key]" :required="f.required" />
            </label>
          </template>
          <p v-if="error" class="form-error">{{ error }}</p>
          <div class="modal-actions">
            <button type="button" class="btn" @click="editing = null">Cancel</button>
            <button type="submit" class="btn btn-primary"><Icon name="check" /> Save</button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmDialog
      v-if="deleting"
      title="Delete record"
      :message="`Delete '${deleting.name || deleting.title}'? If it is referenced by activities it will be deactivated instead.`"
      @confirm="doDelete"
      @cancel="deleting = null"
    />
  </div>
</template>
