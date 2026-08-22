import { ref, computed, watch } from 'vue';

// Client-side search + pagination over an in-memory list (used by every table
// whose endpoint returns the full list; activities paginate server-side).
// searchText(item) -> string of everything the search box should match against.
export function useClientTable(source, { pageSize = 25, searchText } = {}) {
  const q = ref('');
  const page = ref(1);

  const filtered = computed(() => {
    const list = source.value || [];
    const needle = q.value.trim().toLowerCase();
    if (!needle || !searchText) return list;
    return list.filter((item) => searchText(item).toLowerCase().includes(needle));
  });

  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
  const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));

  watch(q, () => (page.value = 1));
  watch(pages, (p) => {
    if (page.value > p) page.value = p;
  });

  return { q, page, pages, filtered, paged };
}
