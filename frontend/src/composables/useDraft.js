import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '../stores/auth';

// Auto-save drafts for long forms. Call enable() once the form's initial state
// is loaded — from then on, edits are debounced into localStorage. A draft left
// behind by a previous session is exposed as `draft` for a restore/discard
// banner. clear() on successful submit.
export function useDraft(formName, recordId, formRef) {
  const auth = useAuthStore();
  const key = `fivews.draft.${auth.user?.id || 'anon'}.${formName}.${recordId || 'new'}`;

  const draft = ref(null); // { savedAt, data } | null
  const dirty = ref(false);
  const enabled = ref(false);
  let baseline = null;
  let timer = null;

  try {
    const raw = localStorage.getItem(key);
    if (raw) draft.value = JSON.parse(raw);
  } catch {
    /* corrupt draft — ignore */
  }

  function enable() {
    baseline = JSON.stringify(formRef.value);
    enabled.value = true;
  }

  function persist() {
    const json = JSON.stringify(formRef.value);
    if (json === baseline) {
      dirty.value = false;
      return;
    }
    dirty.value = true;
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data: JSON.parse(json) }));
    } catch {
      /* storage quota — skip silently */
    }
  }

  watch(
    formRef,
    () => {
      if (!enabled.value) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 800);
    },
    { deep: true }
  );

  function restore() {
    if (!draft.value) return;
    formRef.value = JSON.parse(JSON.stringify(draft.value.data));
    draft.value = null;
  }

  function discard() {
    try {
      localStorage.removeItem(key);
    } catch {}
    draft.value = null;
  }

  function clear() {
    enabled.value = false;
    clearTimeout(timer);
    try {
      localStorage.removeItem(key);
    } catch {}
    dirty.value = false;
  }

  function onBeforeUnload(e) {
    if (enabled.value && dirty.value) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    clearTimeout(timer);
  });

  const savedAtLabel = () => (draft.value ? new Date(draft.value.savedAt).toLocaleString() : '');

  return { draft, dirty, enable, restore, discard, clear, savedAtLabel };
}
