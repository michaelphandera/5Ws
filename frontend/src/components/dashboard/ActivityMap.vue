<script setup>
// Drillable geo panel: starts at the top admin level and drills down level by
// level (click a unit → see its children), with per-unit details (projects,
// activities, organizations, sectors) in popups and in the list below the map.
// Choropleth where a boundary is stored, proportional circles at centroids otherwise.
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../api/client';
import { useLookupsStore } from '../../stores/lookups';
import { baseLayers } from '../../utils/basemaps';
import { orgTypeLabel } from '../../utils/orgTypes';

const props = defineProps({
  byLevel: { type: Object, default: () => ({}) }, // {level: rows[]}
  maxLevel: { type: Number, default: 2 },
  // Public page overrides: unauthenticated geojson source and level names
  // shipped with the payload (the lookups store needs a login to load).
  geojsonUrl: { type: String, default: '/locations/geojson' },
  levels: { type: Array, default: null }, // [{level, name}]
  // Optional org-point overlay: [{_id, name, acronym, type, commission, location:{lat,lng}}]
  orgMarkers: { type: Array, default: () => [] },
  // false on the public page: hides "Filter dashboard" / "View profile" actions.
  interactive: { type: Boolean, default: true },
  // Force the starting admin level (e.g. 2 = districts on the public page);
  // falls back to the smallest renderable level when null or not renderable.
  startLevel: { type: Number, default: null },
  // Hide the per-unit table under the map (compact/public layouts).
  showTable: { type: Boolean, default: true },
  // Map height in px.
  height: { type: Number, default: 360 },
});
const emit = defineEmits(['select-location', 'select-org']);

const lookups = useLookupsStore();

const METRICS = [
  { key: 'count', label: 'Projects' },
  { key: 'activities', label: 'Activities' },
  { key: 'orgCount', label: 'Organizations' },
];
const metric = ref('count');

// Drill state: the chain of parents we've descended into.
const stack = ref([]);

const renderable = (r) => r.hasGeometry || r.centroid?.lat != null;

// Start at the smallest level that has something to draw (regions may lack
// geometry in some datasets — then we start at districts).
const baseLevel = computed(() => {
  if (props.startLevel && (props.byLevel[props.startLevel] || []).some(renderable)) {
    return props.startLevel;
  }
  const levels = Object.keys(props.byLevel).map(Number).sort((a, b) => a - b);
  for (const l of levels) if ((props.byLevel[l] || []).some(renderable)) return l;
  return levels[0] || 1;
});

const currentParent = computed(() => stack.value[stack.value.length - 1] || null);
const currentLevel = computed(() =>
  currentParent.value ? currentParent.value.level + 1 : baseLevel.value
);

const rows = computed(() =>
  (props.byLevel[currentLevel.value] || []).filter(
    (r) => !currentParent.value || String(r.parentId) === String(currentParent.value.locationId)
  )
);

function childrenOf(r) {
  return (props.byLevel[r.level + 1] || []).filter(
    (c) => String(c.parentId) === String(r.locationId)
  );
}
const hasChildren = (r) => r.level < props.maxLevel && childrenOf(r).length > 0;

const levelName = (l) =>
  props.levels
    ? props.levels.find((x) => x.level === l)?.name || `Level ${l}`
    : lookups.levelName(l);
const unitNoun = computed(() => levelName(currentLevel.value).toLowerCase());

function drillInto(r) {
  if (!hasChildren(r)) return;
  stack.value.push({ locationId: r.locationId, name: r.name, level: r.level });
}
function popTo(depth) {
  stack.value = stack.value.slice(0, depth);
}

const mapEl = ref(null);
let map = null;
let layerGroup = null;
let orgLayer = null;
let layersControl = null;
let orgOverlayAdded = false;
let geoFeatures = null; // FeatureCollection cache

// Single-hue sequential ramp (magnitude): light -> dark blue.
const RAMP = ['#dbe7f5', '#aec9e8', '#7da9d8', '#4d88c7', '#1d5fad'];

function classIndex(value, max) {
  if (max <= 0) return 0;
  return Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length));
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function popupHtml(r) {
  const listLine = (label, items) =>
    items?.length ? `<div class="pu-line"><b>${label}:</b> ${items.map(esc).join(', ')}</div>` : '';
  const projItems = (r.projects || []).map(esc).map((t) => `<li>${t}</li>`).join('');
  const more = r.projectTotal > (r.projects || []).length ? `<li class="pu-muted">+ ${r.projectTotal - r.projects.length} more…</li>` : '';
  return `<div class="map-popup">
    <b>${esc(r.name)}</b> <span class="pu-muted">${esc(levelName(r.level))}</span>
    <div class="pu-line">${r.count} project${r.count === 1 ? '' : 's'} · ${r.activities} activit${r.activities === 1 ? 'y' : 'ies'} · ${r.orgCount} org${r.orgCount === 1 ? '' : 's'}</div>
    ${listLine('Sectors', r.sectors)}
    ${listLine('Organizations', r.orgs)}
    ${projItems ? `<div class="pu-line"><b>Projects:</b><ul class="pu-list">${projItems}${more}</ul></div>` : ''}
    <div class="pu-actions">
      ${hasChildren(r) ? `<a href="#" data-drill="${r.locationId}">Drill into ${esc(levelName(r.level + 1).toLowerCase())}s ›</a>` : ''}
      ${props.interactive ? `<a href="#" data-loc="${r.locationId}">Filter dashboard</a>` : ''}
    </div>
  </div>`;
}

// Org office points: an opt-in overlay, visually distinct from the blue ramp.
function renderOrgs() {
  if (!map || !orgLayer) return;
  orgLayer.clearLayers();
  const markers = (props.orgMarkers || []).filter((o) => o.location?.lat != null);
  if (markers.length && !orgOverlayAdded) {
    layersControl.addOverlay(orgLayer, 'Organizations');
    orgOverlayAdded = true;
  }
  for (const o of markers) {
    const marker = L.circleMarker([o.location.lat, o.location.lng], {
      radius: 6,
      fillColor: o.commission?.color || '#935610',
      fillOpacity: 0.9,
      color: '#ffffff',
      weight: 2,
    });
    const sectorChip = o.commission?.name
      ? `<div class="pu-line"><b>Commission:</b> ${esc(o.commission.name)}</div>`
      : '';
    marker.bindPopup(
      `<div class="map-popup">
        <b>${esc(o.name)}</b>${o.acronym ? ` <span class="pu-muted">${esc(o.acronym)}</span>` : ''}
        <div class="pu-line">${esc(orgTypeLabel(o.type))}</div>
        ${sectorChip}
        ${props.interactive ? `<div class="pu-actions"><a href="#" data-org="${o._id}">View profile ›</a></div>` : ''}
      </div>`,
      { maxWidth: 280 }
    );
    if (props.interactive) {
      marker.on('popupopen', (e) => {
        const a = e.popup.getElement()?.querySelector('a[data-org]');
        if (a) {
          a.addEventListener('click', (ev) => {
            ev.preventDefault();
            emit('select-org', o._id);
            map.closePopup();
          });
        }
      });
    }
    orgLayer.addLayer(marker);
  }
}

async function render() {
  if (!map) return;
  if (!geoFeatures) {
    try {
      const { data } = await api.get(props.geojsonUrl);
      geoFeatures = data;
    } catch {
      geoFeatures = { type: 'FeatureCollection', features: [] };
    }
  }
  layerGroup.clearLayers();
  const shown = rows.value;
  if (!shown.length) return;

  const m = metric.value;
  const max = Math.max(...shown.map((r) => r[m] || 0));
  const geomByLocId = new Map(
    geoFeatures.features.map((f) => [String(f.properties.locationId), f])
  );
  const bounds = [];

  for (const r of shown) {
    const value = r[m] || 0;
    const feature = geomByLocId.get(String(r.locationId));
    let layer;
    if (feature) {
      layer = L.geoJSON(feature, {
        style: {
          fillColor: RAMP[classIndex(value, max)],
          fillOpacity: 0.75,
          color: '#ffffff',
          weight: 2,
        },
      });
      bounds.push(layer.getBounds().getCenter());
    } else if (r.centroid?.lat != null) {
      // Small dots with the sequential ramp carrying the value (same encoding
      // as the choropleth) — size-scaled circles blob together where many
      // small districts sit close on a national view.
      const radius = 5 + 6 * Math.sqrt(max ? value / max : 0);
      layer = L.circleMarker([r.centroid.lat, r.centroid.lng], {
        radius,
        fillColor: RAMP[classIndex(value, max)],
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 1.5,
      });
      bounds.push([r.centroid.lat, r.centroid.lng]);
    }
    if (layer) {
      layer.bindPopup(popupHtml(r), { maxWidth: 300 });
      layer.on('popupopen', (e) => {
        const el = e.popup.getElement();
        const filterA = el?.querySelector('a[data-loc]');
        if (filterA) {
          filterA.addEventListener('click', (ev) => {
            ev.preventDefault();
            emit('select-location', r.locationId);
            map.closePopup();
          });
        }
        const drillA = el?.querySelector('a[data-drill]');
        if (drillA) {
          drillA.addEventListener('click', (ev) => {
            ev.preventDefault();
            map.closePopup();
            drillInto(r);
          });
        }
      });
      layerGroup.addLayer(layer);
    }
  }
  if (bounds.length) map.fitBounds(L.latLngBounds(bounds).pad(0.08));
}

onMounted(async () => {
  map = L.map(mapEl.value, { scrollWheelZoom: false }).setView([-4.67, 55.48], 10);
  const bases = baseLayers();
  bases.Map.addTo(map);
  layerGroup = L.layerGroup().addTo(map);
  orgLayer = L.layerGroup(); // opt-in via the layers control
  layersControl = L.control.layers(bases, {}, { position: 'topright' }).addTo(map);
  await nextTick();
  map.invalidateSize();
  render();
  renderOrgs();
});

onBeforeUnmount(() => {
  if (map) map.remove();
});

watch([() => props.byLevel, metric, stack], render, { deep: true });
watch(() => props.orgMarkers, renderOrgs, { deep: true });
</script>

<template>
  <div>
    <div class="map-toolbar">
      <div class="crumbs">
        <a href="#" :class="{ current: !stack.length }" @click.prevent="popTo(0)">
          All {{ levelName(baseLevel).toLowerCase() }}s
        </a>
        <template v-for="(c, i) in stack" :key="c.locationId">
          <span class="sep">›</span>
          <a href="#" :class="{ current: i === stack.length - 1 }" @click.prevent="popTo(i + 1)">{{ c.name }}</a>
        </template>
      </div>
      <div class="seg">
        <button
          v-for="mo in METRICS"
          :key="mo.key"
          class="seg-btn"
          :class="{ active: metric === mo.key }"
          @click="metric = mo.key"
        >
          {{ mo.label }}
        </button>
      </div>
    </div>
    <div ref="mapEl" :style="{ height: height + 'px', borderRadius: '8px', overflow: 'hidden' }"></div>
    <div class="muted" style="font-size: 11.5px; margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
      <span>Low</span>
      <span style="display: inline-flex; gap: 2px">
        <span v-for="(c, i) in ['#dbe7f5', '#aec9e8', '#7da9d8', '#4d88c7', '#1d5fad']" :key="i"
          :style="{ background: c, width: '22px', height: '10px', display: 'inline-block', borderRadius: i === 0 ? '3px 0 0 3px' : i === 4 ? '0 3px 3px 0' : '0' }" />
      </span>
      <span>high · click a {{ unitNoun }} for details{{ currentLevel < maxLevel ? ' and to drill down' : '' }}</span>
    </div>

    <div v-if="showTable && !rows.length" class="empty" style="padding: 18px 12px">
      No reported work in {{ currentParent ? currentParent.name : 'the selected area' }} under the current filters.
    </div>
    <div v-else-if="showTable" class="unit-list">
      <table class="data">
        <thead>
          <tr>
            <th>{{ levelName(currentLevel) }}</th>
            <th style="text-align: right">Projects</th>
            <th style="text-align: right">Activities</th>
            <th style="text-align: right">Orgs</th>
            <th style="text-align: right">Sectors</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.locationId">
            <td><b>{{ r.name }}</b></td>
            <td style="text-align: right">{{ r.count }}</td>
            <td style="text-align: right">{{ r.activities }}</td>
            <td style="text-align: right">{{ r.orgCount }}</td>
            <td style="text-align: right">{{ r.sectorCount }}</td>
            <td class="row-actions" style="text-align: right; white-space: nowrap">
              <button v-if="hasChildren(r)" class="btn btn-sm" @click="drillInto(r)">Drill ›</button>
              <button class="btn btn-sm" style="margin-left: 6px" @click="emit('select-location', r.locationId)">Filter</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.map-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.crumbs { font-size: 12.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.crumbs a { color: var(--blue-600); text-decoration: none; font-weight: 600; }
.crumbs a.current { color: var(--ink); pointer-events: none; }
.crumbs .sep { color: var(--ink-3); }
.seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 7px; overflow: hidden; }
.seg-btn {
  border: none; background: var(--surface); color: var(--ink-2);
  font-size: 12px; font-weight: 600; padding: 5px 12px; cursor: pointer; font-family: inherit;
}
.seg-btn + .seg-btn { border-left: 1px solid var(--border); }
.seg-btn.active { background: var(--blue-600); color: #fff; }
.unit-list { margin-top: 10px; max-height: 240px; overflow-y: auto; }
.unit-list table { font-size: 12.5px; }
:global(.map-popup) { font-size: 12.5px; line-height: 1.45; }
:global(.map-popup .pu-line) { margin-top: 4px; }
:global(.map-popup .pu-muted) { color: #6b7280; font-size: 11px; }
:global(.map-popup .pu-list) { margin: 2px 0 0; padding-left: 16px; }
:global(.map-popup .pu-actions) { margin-top: 8px; display: flex; gap: 12px; }
:global(.map-popup .pu-actions a) { font-weight: 600; }
</style>
