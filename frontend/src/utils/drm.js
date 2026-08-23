// DRM phases — must match backend/src/utils/drm.js.
export const DRM_PHASES = [
  { value: 'prevention-mitigation', label: 'Prevention & Mitigation' },
  { value: 'preparedness', label: 'Preparedness' },
  { value: 'response', label: 'Response' },
  { value: 'recovery-rehabilitation', label: 'Recovery & Rehabilitation' },
  { value: 'crosscutting', label: 'Cross-cutting / Capacity Building' },
];

export const drmPhaseLabel = (value) =>
  DRM_PHASES.find((p) => p.value === value)?.label || value || '';
