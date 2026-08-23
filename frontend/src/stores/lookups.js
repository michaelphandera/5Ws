import { defineStore } from 'pinia';
import api from '../api/client';

// Master data fetched once after login; feeds every dropdown, chart label and map legend.
export const useLookupsStore = defineStore('lookups', {
  state: () => ({
    sectors: [],
    activityTypes: [],
    beneficiaryGroups: [],
    disaggregations: [],
    events: [],
    informComponents: [],
    organizations: [],
    locations: [],
    locationTree: [],
    adminLevelConfig: { levels: [] },
    loaded: false,
  }),
  getters: {
    levelName: (s) => (lvl) =>
      s.adminLevelConfig.levels.find((l) => l.level === lvl)?.name || `Level ${lvl}`,
    maxLevel: (s) => Math.max(1, ...s.adminLevelConfig.levels.map((l) => l.level)),
    sectorById: (s) => Object.fromEntries(s.sectors.map((x) => [x._id, x])),
    locationById: (s) => Object.fromEntries(s.locations.map((x) => [x._id, x])),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return;
      const [sectors, types, groups, disaggs, events, informComponents, orgs, locations, tree, cfg] = await Promise.all([
        api.get('/sectors'),
        api.get('/activity-types'),
        api.get('/beneficiary-groups'),
        api.get('/disaggregations'),
        api.get('/events'),
        api.get('/inform-components'),
        api.get('/organizations'),
        api.get('/locations'),
        api.get('/locations/tree'),
        api.get('/admin-level-config'),
      ]);
      this.sectors = sectors.data;
      this.activityTypes = types.data;
      this.beneficiaryGroups = groups.data;
      this.disaggregations = disaggs.data;
      this.events = events.data;
      this.informComponents = informComponents.data;
      this.organizations = orgs.data;
      this.locations = locations.data;
      this.locationTree = tree.data;
      this.adminLevelConfig = cfg.data;
      this.loaded = true;
    },
  },
});
