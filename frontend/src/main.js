import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './assets/styles.css';

// v-integer: whole numbers only. v-decimal: digits + one decimal point.
// Blocks e/E/+/- (and stray dots) that type="number" would otherwise accept,
// and sanitizes pasted text.
function numericDirective(pattern, { allowDot = false } = {}) {
  return {
    mounted(el) {
      el.addEventListener('keydown', (e) => {
        const blocked = ['e', 'E', '+', '-', ','];
        if (e.key === '.' && (!allowDot || el.value.includes('.'))) blocked.push('.');
        if (blocked.includes(e.key)) e.preventDefault();
      });
      el.addEventListener('input', () => {
        const clean = (el.value.match(pattern) || [''])[0];
        if (el.value !== clean) {
          el.value = clean;
          el.dispatchEvent(new Event('input'));
        }
      });
    },
  };
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('integer', numericDirective(/\d*/));
app.directive('decimal', numericDirective(/\d*\.?\d*/, { allowDot: true }));
app.mount('#app');
