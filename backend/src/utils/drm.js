// DRM phase reference values (REV1 DRR taxonomy). Mirrored by
// frontend/src/utils/drm.js — keep the two lists in sync.
const DRM_PHASES = [
  'prevention-mitigation',
  'preparedness',
  'response',
  'recovery-rehabilitation',
  'crosscutting',
];

const DRM_PHASE_LABELS = {
  'prevention-mitigation': 'Prevention & Mitigation',
  preparedness: 'Preparedness',
  response: 'Response',
  'recovery-rehabilitation': 'Recovery & Rehabilitation',
  crosscutting: 'Cross-cutting / Capacity Building',
};

module.exports = { DRM_PHASES, DRM_PHASE_LABELS };
