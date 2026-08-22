<script setup>
// Single source of truth: this filter state drives charts, map, table and the export URL.
import { useDashboardStore } from '../../stores/dashboard';
import { useLookupsStore } from '../../stores/lookups';

const dash = useDashboardStore();
const lookups = useLookupsStore();

function changed() {
  dash.fetchSummaryDebounced();
}
</script>

<template>
  <div class="card" style="margin-bottom: 16px">
    <div class="filter-grid">
      <label class="field">
        <span>Who — organization</span>
        <select v-model="dash.filters.organization" @change="changed">
          <option value="">All</option>
          <option v-for="o in lookups.organizations" :key="o._id" :value="o._id">
            {{ o.acronym || o.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>What — sector</span>
        <select v-model="dash.filters.sector" @change="changed">
          <option value="">All</option>
          <option v-for="s in lookups.sectors" :key="s._id" :value="s._id">{{ s.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>Where — location</span>
        <select v-model="dash.filters.location" @change="changed">
          <option value="">All</option>
          <option v-for="l in lookups.locations" :key="l._id" :value="l._id">
            {{ ' '.repeat((l.level - 1) * 3) + l.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>When — from</span>
        <input v-model="dash.filters.dateFrom" type="date" @change="changed" />
      </label>
      <label class="field">
        <span>When — to</span>
        <input v-model="dash.filters.dateTo" type="date" @change="changed" />
      </label>
      <label class="field">
        <span>Project status</span>
        <select v-model="dash.filters.status" @change="changed">
          <option value="">All</option>
          <option value="planned">Planned</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label class="field">
        <span>Disaster event</span>
        <select v-model="dash.filters.event" @change="changed">
          <option value="">All</option>
          <option v-for="ev in lookups.events" :key="ev._id" :value="ev._id">{{ ev.name }}</option>
        </select>
      </label>
      <button class="btn" @click="dash.resetFilters()">Reset</button>
    </div>
  </div>
</template>
