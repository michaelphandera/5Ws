<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../api/client';
import LocationPicker from '../components/common/LocationPicker.vue';
import Icon from '../components/common/Icon.vue';
import { useAuthStore } from '../stores/auth';
import { useLookupsStore } from '../stores/lookups';
import { useToast } from '../composables/toast';
import { useDraft } from '../composables/useDraft';

const toast = useToast();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const lookups = useLookupsStore();

const isEdit = computed(() => !!route.params.id);
const projects = ref([]);
const error = ref('');
const busy = ref(false);

// Disaggregation categories come from Admin > Disaggregations (labels, gender
// and age ranges are configured there — nothing is hardcoded here).
const DEMO_FIELDS = computed(() =>
  lookups.disaggregations
    .filter((c) => c.active !== false)
    .map((c) => ({ key: c.key, label: c.label, crossCutting: c.crossCutting, gender: c.gender, ageMin: c.ageMin, ageMax: c.ageMax }))
);

const groupById = computed(() => Object.fromEntries(lookups.beneficiaryGroups.map((g) => [g._id, g])));

// Demographic groups (age/gender bounds set in Admin → Beneficiary Groups) don't
// get the full age-band grid — the group already defines the age range. They get
// a plain female/male split instead, stored under the reserved keys below.
const SEX_FIELDS = [
  { key: 'female', label: 'Female', crossCutting: false },
  { key: 'male', label: 'Male', crossCutting: false },
];
const CROSS_FIELDS = computed(() => DEMO_FIELDS.value.filter((f) => f.crossCutting));

// 'full'  — unconstrained group: the complete category grid.
// 'sex'   — age-bounded group (Youth, Children, Elderly): female/male + cross-cutting.
// 'cross' — gender-bounded group (Women, Men): sex is known, only cross-cutting applies.
function rowMode(b) {
  const g = groupById.value[b.group];
  if (!g || (!g.gender && g.ageMin == null && g.ageMax == null)) return 'full';
  return g.gender ? 'cross' : 'sex';
}
function rowFields(b) {
  const mode = rowMode(b);
  if (mode === 'full') return DEMO_FIELDS.value;
  if (mode === 'sex') return [...SEX_FIELDS, ...CROSS_FIELDS.value];
  return CROSS_FIELDS.value;
}
function toggleLabel(b) {
  const mode = rowMode(b);
  return mode === 'sex' ? 'female / male split' : mode === 'cross' ? 'cross-cutting breakdown' : 'gender / age / PWD';
}
// Keys that no longer apply are cleared when the group (and thus the mode) changes.
function onGroupChange(b) {
  const keep = new Set(rowFields(b).map((f) => f.key));
  const all = [...DEMO_FIELDS.value.map((f) => f.key), ...SEX_FIELDS.map((f) => f.key)];
  for (const k of all) {
    if (!keep.has(k)) b.targeted[k] = '';
  }
}
function groupConstraintHint(b) {
  const g = groupById.value[b.group];
  const mode = rowMode(b);
  if (!g || mode === 'full') return '';
  if (mode === 'cross') return `${g.name} is ${g.gender}-only — sex is already known, so only cross-cutting categories apply`;
  const range =
    g.ageMin != null && g.ageMax != null ? `ages ${g.ageMin}–${g.ageMax}`
    : g.ageMin != null ? `ages ${g.ageMin}+`
    : `ages 0–${g.ageMax}`;
  return `${g.name} · ${range} — how many of them are female / male?`;
}
// Older entries may hold age-band values recorded before the group was constrained;
// they stay in the data (and dashboards) but have no visible cell in this mode.
function hiddenLegacy(b) {
  if (rowMode(b) === 'full') return false;
  const visible = new Set(rowFields(b).map((f) => f.key));
  return DEMO_FIELDS.value.some(
    (f) => !f.crossCutting && !visible.has(f.key) && (b.targeted[f.key] ?? '') !== ''
  );
}

// Sum of the row's visible non-cross-cutting breakdown — age-band categories in
// full mode, the female/male split for demographic groups.
function breakdownSum(b) {
  return rowFields(b)
    .filter((f) => !f.crossCutting)
    .reduce((s, f) => s + (Number(b.targeted[f.key]) || 0), 0);
}
function hasBreakdown(b) {
  return rowFields(b).some((f) => !f.crossCutting && b.targeted[f.key] !== '' && b.targeted[f.key] != null);
}
// Mismatch: an entered total that is lower than the breakdown sum.
function totalMismatch(b) {
  if (!hasBreakdown(b)) return false;
  const total = b.targetedTotal;
  return total !== '' && total != null && Number(total) < breakdownSum(b);
}
function applyBreakdownTotal(b) {
  if (hasBreakdown(b)) b.targetedTotal = breakdownSum(b);
}

const form = ref({
  project: route.query.project || '',
  title: '',
  sector: '',
  description: '',
  locations: [],
  startDate: '',
  endDate: '',
  beneficiaries: [],
  notes: '',
});

// Auto-save: edits are drafted to localStorage so an accidental close or
// session expiry never loses a half-filled report.
const draftCtl = useDraft('activity', route.params.id, form);

function blankDemo() {
  return Object.fromEntries([...DEMO_FIELDS.value, ...SEX_FIELDS].map((f) => [f.key, '']));
}

function addBeneficiaryRow() {
  form.value.beneficiaries.push({
    group: '',
    targetedTotal: '',
    showDisaggregation: false,
    targeted: blankDemo(),
  });
}

function removeBeneficiaryRow(i) {
  form.value.beneficiaries.splice(i, 1);
}

onMounted(async () => {
  await lookups.load();
  const params = auth.isAdmin ? {} : { organization: auth.myOrgId };
  const { data } = await api.get('/projects', { params });
  projects.value = data;

  if (isEdit.value) {
    const { data: a } = await api.get(`/activities/${route.params.id}`);
    form.value = {
      project: a.project?._id || a.project,
      title: a.title,
      sector: a.sector?._id || a.sector,
      description: a.description || '',
      locations: (a.locations || []).map((l) => l._id || l),
      startDate: a.startDate?.slice(0, 10) || '',
      endDate: a.endDate?.slice(0, 10) || '',
      beneficiaries: (a.beneficiaries || []).map((b) => ({
        group: b.group?._id || b.group,
        targetedTotal: b.targetedTotal ?? '',
        showDisaggregation: !!b.disaggregation?.targeted,
        targeted: { ...blankDemo(), ...(b.disaggregation?.targeted || {}) },
      })),
      notes: a.notes || '',
    };
  } else if (!form.value.beneficiaries.length) {
    addBeneficiaryRow();
  }
  draftCtl.enable();
});

function cleanDemo(d) {
  const out = {};
  let any = false;
  for (const f of [...DEMO_FIELDS.value, ...SEX_FIELDS]) {
    if (d[f.key] !== '' && d[f.key] != null) {
      out[f.key] = Number(d[f.key]);
      any = true;
    }
  }
  return any ? out : undefined;
}

async function save() {
  error.value = '';
  busy.value = true;
  const f = form.value;
  const body = {
    project: f.project,
    title: f.title,
    sector: f.sector,
    description: f.description || undefined,
    locations: f.locations,
    startDate: f.startDate,
    endDate: f.endDate || undefined,
    beneficiaries: f.beneficiaries
      .filter((b) => b.group)
      .map((b) => ({
        group: b.group,
        targetedTotal: b.targetedTotal !== '' ? Number(b.targetedTotal) : undefined,
        disaggregation: {
          targeted: cleanDemo(b.targeted),
        },
      })),
    notes: f.notes || undefined,
  };
  try {
    if (isEdit.value) await api.put(`/activities/${route.params.id}`, body);
    else await api.post('/activities', body);
    draftCtl.clear();
    toast.success(isEdit.value ? 'Activity updated' : 'Activity reported');
    router.push('/activities');
  } catch (e) {
    error.value =
      e.response?.data?.error ||
      e.response?.data?.details?.map((d) => d.msg || d.path).join('; ') ||
      'Save failed';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div style="max-width: 860px">
    <div class="page-head">
      <div>
        <h1>{{ isEdit ? 'Edit activity' : 'New activity' }}</h1>
        <p class="lede">One activity = one 5W report: Who, What, Where, When, for Whom</p>
      </div>
    </div>

    <div v-if="draftCtl.draft.value" class="card" style="border-left: 3px solid #935610; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap">
      <span style="font-size: 13px">
        <b>Unsaved draft found</b> from {{ draftCtl.savedAtLabel() }} — resume where you left off?
      </span>
      <span style="display: flex; gap: 8px">
        <button type="button" class="btn btn-sm btn-primary" @click="draftCtl.restore()">Restore draft</button>
        <button type="button" class="btn btn-sm" @click="draftCtl.discard()">Discard</button>
      </span>
    </div>

    <form @submit.prevent="save">
      <div class="card">
        <div class="form-section-title"><span class="step">1</span> Who &amp; What</div>
        <p class="card-sub">The reporting organization (via its project) and the type of work</p>
        <label class="field">
          <span>Project * (defines the reporting organization)</span>
          <select v-model="form.project" required :disabled="isEdit">
            <option value="">—</option>
            <option v-for="p in projects" :key="p._id" :value="p._id">
              {{ p.title }} ({{ p.organization?.acronym || p.organization?.name }})
            </option>
          </select>
        </label>
        <label class="field">
          <span>Activity title *</span>
          <input v-model="form.title" required />
        </label>
        <label class="field">
          <span>Sector *</span>
          <select v-model="form.sector" required>
            <option value="">—</option>
            <option v-for="s in lookups.sectors.filter((x) => x.active !== false)" :key="s._id" :value="s._id">
              {{ s.name }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Description</span>
          <textarea v-model="form.description" rows="2" />
        </label>
      </div>

      <div class="card">
        <div class="form-section-title"><span class="step">2</span> Where</div>
        <p class="card-sub">Every area this activity covers — add one or more locations</p>
        <LocationPicker v-model="form.locations" />
      </div>

      <div class="card">
        <div class="form-section-title"><span class="step">3</span> When</div>
        <p class="card-sub">Implementation period (status is tracked on the project)</p>
        <div class="form-grid">
          <label class="field"><span>Start date *</span><input v-model="form.startDate" type="date" required /></label>
          <label class="field"><span>End date</span><input v-model="form.endDate" type="date" /></label>
        </div>
      </div>

      <div class="card">
        <div class="form-section-title"><span class="step">4</span> For Whom — targeted beneficiaries</div>
        <p class="card-sub">Counts are totals for this activity overall (locations indicate coverage)</p>
        <div v-for="(b, i) in form.beneficiaries" :key="i" class="beneficiary-row">
          <div class="filter-row">
            <label class="field" style="max-width: none">
              <span>Beneficiary group</span>
              <select v-model="b.group" @change="onGroupChange(b)">
                <option value="">—</option>
                <option v-for="g in lookups.beneficiaryGroups.filter((x) => x.active !== false)" :key="g._id" :value="g._id">
                  {{ g.name }}
                </option>
              </select>
            </label>
            <label class="field"><span>Targeted total</span><input v-model="b.targetedTotal" v-integer type="number" min="0" inputmode="numeric" /></label>
            <button v-if="rowFields(b).length" type="button" class="btn btn-sm" @click="b.showDisaggregation = !b.showDisaggregation">
              {{ b.showDisaggregation ? 'Hide' : 'Show' }} {{ toggleLabel(b) }}
            </button>
            <button type="button" class="btn btn-sm btn-danger" @click="removeBeneficiaryRow(i)">Remove</button>
          </div>
          <div v-if="b.showDisaggregation && rowFields(b).length" class="demo-scroll">
            <table class="data demo-table" :class="{ 'demo-compact': rowMode(b) !== 'full' }">
              <thead>
                <tr>
                  <th></th>
                  <th v-for="f in rowFields(b)" :key="f.key">{{ f.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Targeted</b></td>
                  <td v-for="f in rowFields(b)" :key="f.key">
                    <input v-model="b.targeted[f.key]" v-integer type="number" min="0" inputmode="numeric" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="b.showDisaggregation && groupConstraintHint(b)" class="muted" style="font-size: 11.5px; margin: 6px 0 0">
            {{ groupConstraintHint(b) }}
          </p>
          <p v-if="b.showDisaggregation && hiddenLegacy(b)" class="muted" style="font-size: 11.5px; margin: 6px 0 0">
            This entry also carries older age-band values that don’t apply to this group anymore (they still count in dashboards).
            <a href="#" @click.prevent="onGroupChange(b)">Clear them</a>
          </p>
          <div v-if="b.showDisaggregation && hasBreakdown(b)"
            class="breakdown-check" :class="{ warn: totalMismatch(b) }">
            <span>
              Breakdown sum — targeted: <b>{{ breakdownSum(b).toLocaleString() }}</b>
              <template v-if="totalMismatch(b)">
                — the total is lower than the breakdown sum and will be raised to match on save
              </template>
            </span>
            <button type="button" class="btn btn-sm" @click="applyBreakdownTotal(b)">Set total from breakdown</button>
          </div>
        </div>
        <button type="button" class="btn" @click="addBeneficiaryRow"><Icon name="plus" /> Add beneficiary group</button>
      </div>

      <div class="card">
        <div class="form-section-title"><span class="step">5</span> Notes</div>
        <p class="card-sub">Anything else worth recording about this activity (optional — Disaster / Emergency &amp; DRM context is set on the project)</p>
        <label class="field">
          <span>Notes</span>
          <textarea v-model="form.notes" rows="2" />
        </label>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>
      <div style="display: flex; gap: 8px; margin: 16px 0 32px">
        <button type="submit" class="btn btn-primary" :disabled="busy || !form.locations.length">
          <Icon name="check" /> {{ busy ? 'Saving…' : isEdit ? 'Save changes' : 'Submit activity report' }}
        </button>
        <button type="button" class="btn" @click="router.back()"><Icon name="arrowLeft" :size="14" /> Cancel</button>
      </div>
      <p v-if="!form.locations.length" class="muted" style="margin-top: -24px">
        Select at least one location to enable saving.
      </p>
    </form>
  </div>
</template>
