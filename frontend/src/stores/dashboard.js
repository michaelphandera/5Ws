import { defineStore } from 'pinia';
import api from '../api/client';

// One filter state drives charts, map, table and the export URL.
export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    filters: {
      organization: '',
      sector: '',
      status: '',
      location: '',
      dateFrom: '',
      dateTo: '',
      event: '',
      demographic: '',
    },
    summary: null,
    loading: false,
    _timer: null,
  }),
  getters: {
    activeFilterParams: (s) =>
      Object.fromEntries(Object.entries(s.filters).filter(([, v]) => v !== '' && v != null)),
  },
  actions: {
    async fetchSummary() {
      this.loading = true;
      try {
        const { data } = await api.get('/dashboard/summary', { params: this.activeFilterParams });
        this.summary = data;
      } finally {
        this.loading = false;
      }
    },
    fetchSummaryDebounced() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.fetchSummary(), 300);
    },
    resetFilters() {
      Object.keys(this.filters).forEach((k) => (this.filters[k] = ''));
      this.fetchSummary();
    },
  },
});
