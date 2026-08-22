<script setup>
// Small Leaflet map for setting/showing one point. Click to place the marker,
// drag to adjust; "Clear" removes it. Satellite basemap helps place an office.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { baseLayers } from '../../utils/basemaps';

const props = defineProps({
  modelValue: { type: Object, default: null }, // {lat, lng} | null
  readonly: { type: Boolean, default: false },
  height: { type: String, default: '260px' },
});
const emit = defineEmits(['update:modelValue']);

const mapEl = ref(null);
let map = null;
let marker = null;

function setMarker(latlng) {
  if (marker) {
    marker.setLatLng(latlng);
    return;
  }
  marker = L.circleMarker(latlng, {
    radius: 8,
    fillColor: '#935610',
    fillOpacity: 0.9,
    color: '#ffffff',
    weight: 2,
  }).addTo(map);
}

function clearMarker() {
  if (marker) {
    marker.remove();
    marker = null;
  }
  emit('update:modelValue', null);
}

onMounted(() => {
  map = L.map(mapEl.value, { scrollWheelZoom: false }).setView(
    props.modelValue?.lat != null ? [props.modelValue.lat, props.modelValue.lng] : [-4.67, 55.48],
    props.modelValue?.lat != null ? 13 : 10
  );
  const bases = baseLayers();
  bases.Map.addTo(map);
  L.control.layers(bases, {}, { position: 'topright' }).addTo(map);
  if (props.modelValue?.lat != null) setMarker([props.modelValue.lat, props.modelValue.lng]);
  if (!props.readonly) {
    map.on('click', (e) => {
      setMarker(e.latlng);
      emit('update:modelValue', { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    });
  }
  setTimeout(() => map.invalidateSize(), 0);
});

onBeforeUnmount(() => {
  if (map) map.remove();
});

watch(
  () => props.modelValue,
  (v) => {
    if (!map) return;
    if (v?.lat != null) setMarker([v.lat, v.lng]);
    else if (marker) {
      marker.remove();
      marker = null;
    }
  }
);
</script>

<template>
  <div>
    <div ref="mapEl" :style="{ height, borderRadius: '8px', overflow: 'hidden' }"></div>
    <div v-if="!readonly" class="muted" style="font-size: 11.5px; margin-top: 6px; display: flex; justify-content: space-between; align-items: center">
      <span>
        {{ modelValue?.lat != null ? `Point: ${modelValue.lat}, ${modelValue.lng}` : 'Click the map to place the point' }}
      </span>
      <button v-if="modelValue?.lat != null" type="button" class="btn btn-sm" @click="clearMarker">Clear point</button>
    </div>
  </div>
</template>
