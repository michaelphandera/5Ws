<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../api/client';
import ConfirmDialog from '../../components/common/ConfirmDialog.vue';
import Icon from '../../components/common/Icon.vue';
import SearchBox from '../../components/common/SearchBox.vue';
import Pager from '../../components/common/Pager.vue';
import { useLookupsStore } from '../../stores/lookups';
import { useToast } from '../../composables/toast';
import { useClientTable } from '../../composables/clientTable';
import { downloadCsv } from '../../utils/csv';

const toast = useToast();

const lookups = useLookupsStore();
const tree = ref([]);
const config = ref({ levels: [] });
const editing = ref(null); // { _id?, name, parent, parentName, lat, lng, geometryText }
const deleting = ref(null);
const error = ref('');
const savingConfig = ref(false);

async function load() {
  const [t, c] = await Promise.all([api.get('/locations/tree'), api.get('/admin-level-config')]);
  tree.value = t.data;
  config.value = c.data;
}
onMounted(load);

function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

const flatRows = computed(() => flatten(tree.value));
const levelName = (level) => config.value.levels.find((l) => l.level === level)?.name || level;

const { q, page, pages, filtered, paged } = useClientTable(flatRows, {
  searchText: (n) => [n.name, n.code, levelName(n.level)].filter(Boolean).join(' '),
});

function exportCsv() {
  downloadCsv(
    'locations.csv',
    ['Name', 'P-code', 'Level', 'Centroid lat', 'Centroid lng', 'Has boundary', 'Active'],
    filtered.value.map((n) => [
      n.name,
      n.code || '',
      levelName(n.level),
      n.centroid?.lat ?? '',
      n.centroid?.lng ?? '',
      n.geometry ? 'yes' : 'no',
      n.active === false ? 'inactive' : 'active',
    ])
  );
}

function openNew(parent = null) {
  editing.value = {
    name: '',
    parent: parent?._id || null,
    parentName: parent?.name || null,
    lat: '',
    lng: '',
    geometryText: '',
  };
  error.value = '';
}

function openEdit(node) {
  editing.value = {
    _id: node._id,
    name: node.name,
    code: node.code || '',
    parentName: null,
    lat: node.centroid?.lat ?? '',
    lng: node.centroid?.lng ?? '',
    geometryText: node.geometry ? JSON.stringify(node.geometry) : '',
    active: node.active !== false,
  };
  error.value = '';
}

async function save() {
  error.value = '';
  const body = { name: editing.value.name };
  if (editing.value._id && editing.value.code) body.code = editing.value.code;
  if (editing.value.lat !== '' && editing.value.lng !== '') {
    body.centroid = { lat: Number(editing.value.lat), lng: Number(editing.value.lng) };
  }
  if (editing.value.geometryText) {
    try {
      body.geometry = JSON.parse(editing.value.geometryText);
    } catch {
      error.value = 'Boundary GeoJSON is not valid JSON';
      return;
    }
  } else if (editing.value._id) {
    body.geometry = null;
  }
  try {
    if (editing.value._id) {
      body.active = editing.value.active;
      await api.put(`/locations/${editing.value._id}`, body);
    } else {
      body.parent = editing.value.parent;
      await api.post('/locations', body);
    }
    toast.success(editing.value._id ? 'Location updated' : 'Location created');
    editing.value = null;
    await load();
    lookups.load(true);
  } catch (e) {
    error.value = e.response?.data?.error || 'Save failed';
  }
}

async function doDelete() {
  try {
    const { data } = await api.delete(`/locations/${deleting.value._id}`);
    toast.success(data.softDeleted ? 'Location in use — deactivated instead' : 'Location deleted');
    deleting.value = null;
    await load();
    lookups.load(true);
  } catch (e) {
    deleting.value = null;
    toast.error(e.response?.data?.error || 'Delete failed');
  }
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    await api.put('/admin-level-config', { levels: config.value.levels });
    toast.success('Level names saved');
    lookups.load(true);
  } finally {
    savingConfig.value = false;
  }
}

function addLevel() {
  const next = config.value.levels.length + 1;
  if (next > 3) return;
  config.value.levels.push({ level: next, name: `Level ${next}` });
}
function removeLevel() {
  if (config.value.levels.length > 1) config.value.levels.pop();
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Locations</h1>
        <p class="lede">Geographic hierarchy used for the “Where” dimension — level names are fully configurable</p>
      </div>
      <div class="head-actions">
        <SearchBox v-model="q" placeholder="Search locations…" />
        <button class="btn" @click="exportCsv"><Icon name="download" /> Export CSV</button>
        <button class="btn btn-primary" @click="openNew(null)">
          <Icon name="plus" /> New {{ config.levels[0]?.name || 'top-level unit' }}
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Hierarchy level names</div>
      <div class="filter-row">
        <label v-for="lv in config.levels" :key="lv.level" class="field">
          <span>Level {{ lv.level }}</span>
          <input v-model="lv.name" />
        </label>
        <button class="btn btn-sm" @click="addLevel" :disabled="config.levels.length >= 3">+ level</button>
        <button class="btn btn-sm" @click="removeLevel" :disabled="config.levels.length <= 1">− level</button>
        <button class="btn btn-primary btn-sm" :disabled="savingConfig" @click="saveConfig">Save names</button>
      </div>
    </div>

    <div class="card">
      <div v-if="!filtered.length" class="empty">
        <div class="empty-icon"><Icon name="search" :size="20" /></div>
        <div><b>No locations match “{{ q }}”.</b></div>
      </div>
      <table v-else class="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>P-code</th>
            <th>Level</th>
            <th>Centroid</th>
            <th>Boundary</th>
            <th style="width: 210px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="node in paged" :key="node._id" :style="node.active === false ? 'opacity:.5' : ''">
            <td>
              <span :style="{ paddingLeft: node.depth * 22 + 'px' }">
                {{ node.depth > 0 ? '└ ' : '' }}{{ node.name }}
              </span>
            </td>
            <td class="muted">{{ node.code }}</td>
            <td>{{ levelName(node.level) }}</td>
            <td class="muted">
              {{ node.centroid?.lat != null ? `${node.centroid.lat}, ${node.centroid.lng}` : '—' }}
            </td>
            <td>{{ node.geometry ? '✓ GeoJSON' : '—' }}</td>
            <td class="row-actions">
              <button v-if="node.level < 3" class="btn btn-sm" @click="openNew(node)"><Icon name="plus" :size="13" /> child</button>
              <button class="btn btn-sm" style="margin-left: 6px" @click="openEdit(node)"><Icon name="edit" :size="13" /> Edit</button>
              <button class="btn btn-sm btn-danger" style="margin-left: 6px" @click="deleting = node"><Icon name="trash" :size="13" /></button>
            </td>
          </tr>
        </tbody>
      </table>
      <Pager :page="page" :pages="pages" :total="filtered.length" @go="(p) => (page = p)" />
    </div>

    <div v-if="editing" class="modal-backdrop" @click.self="editing = null">
      <div class="modal">
        <h2>
          {{ editing._id ? 'Edit location' : editing.parentName ? `New unit under ${editing.parentName}` : 'New top-level unit' }}
        </h2>
        <form @submit.prevent="save">
          <label class="field">
            <span>Name *</span>
            <input v-model="editing.name" required />
          </label>
          <label v-if="editing._id" class="field">
            <span>P-code <span class="hint">(official place code — COD-AB / ISO 3166-2; used in 5W exports)</span></span>
            <input v-model="editing.code" placeholder="e.g. SC-08" />
          </label>
          <div class="form-grid">
            <label class="field">
              <span>Centroid latitude</span>
              <input v-model="editing.lat" type="number" step="any" />
            </label>
            <label class="field">
              <span>Centroid longitude</span>
              <input v-model="editing.lng" type="number" step="any" />
            </label>
          </div>
          <label class="field">
            <span>Boundary GeoJSON geometry (optional — enables choropleth on the map)</span>
            <textarea v-model="editing.geometryText" rows="4" placeholder='{"type":"Polygon","coordinates":[...]}' />
          </label>
          <label v-if="editing._id" class="field" style="display: flex; align-items: center; gap: 8px">
            <input type="checkbox" v-model="editing.active" style="width: auto" />
            <span style="margin: 0">Active</span>
          </label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <div class="modal-actions">
            <button type="button" class="btn" @click="editing = null">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmDialog
      v-if="deleting"
      title="Delete location"
      :message="`Delete '${deleting.name}'? If activities reference it, it will be deactivated instead.`"
      @confirm="doDelete"
      @cancel="deleting = null"
    />
  </div>
</template>
