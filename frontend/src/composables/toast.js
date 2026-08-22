import { reactive } from 'vue';

const toasts = reactive([]);
let nextId = 1;

export function useToast() {
  function push(message, type = 'success', timeout = 3200) {
    const id = nextId++;
    toasts.push({ id, message, type });
    setTimeout(() => {
      const i = toasts.findIndex((t) => t.id === id);
      if (i !== -1) toasts.splice(i, 1);
    }, timeout);
  }
  return {
    toasts,
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error', 4500),
  };
}
