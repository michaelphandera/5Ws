<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import emblemUrl from '../assets/drdm-logo.png';

const auth = useAuthStore();
const router = useRouter();
const username = ref('');
const password = ref('');
const remember = ref(false);
const error = ref('');
const hint = ref('');
const busy = ref(false);

onMounted(() => {
  const saved = localStorage.getItem('fivews.rememberedUser');
  if (saved) {
    username.value = saved;
    remember.value = true;
  }
});

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await auth.login(username.value, password.value);
    if (remember.value) localStorage.setItem('fivews.rememberedUser', username.value);
    else localStorage.removeItem('fivews.rememberedUser');
    router.push({ name: 'dashboard' });
  } catch (e) {
    error.value = e.response?.data?.error || 'Login failed';
  } finally {
    busy.value = false;
  }
}

function showAccountHint() {
  hint.value = 'Accounts are provided by the administrator. Contact your coordinator — they can issue you a temporary password.';
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Illustrated banner -->
      <div class="banner">
        <svg class="banner-art" viewBox="0 0 468 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <!-- connector lines -->
          <g stroke="#a8a8a8" stroke-width="7" fill="none" stroke-linecap="round">
            <path d="M60 130 L150 60 L250 95 L340 45" />
            <path d="M150 60 L150 -10" />
            <path d="M250 95 L250 190" />
            <path d="M340 45 L430 110" />
            <path d="M340 45 L340 -10" />
            <path d="M-10 150 L60 130" />
          </g>
          <!-- junction dots -->
          <g fill="#8a8a8a">
            <circle cx="150" cy="60" r="9" />
            <circle cx="250" cy="95" r="9" />
            <circle cx="340" cy="45" r="9" />
          </g>
          <!-- avatar: woman (left) -->
          <g>
            <circle cx="60" cy="130" r="42" fill="#e9e9e9" />
            <path d="M40 118 q20 -26 40 0 v22 q-20 12 -40 0 z" fill="#8a5a3b" />
            <circle cx="60" cy="122" r="13" fill="#e8b88f" />
            <path d="M38 158 q22 -16 44 0 v14 h-44 z" fill="#d6242b" />
          </g>
          <!-- avatar: person (right) -->
          <g>
            <circle cx="340" cy="115" r="46" fill="#9e9e9e" />
            <path d="M316 100 q24 -30 48 0 v20 q-24 14 -48 0 z" fill="#7a4a2e" />
            <circle cx="340" cy="106" r="14" fill="#e8b88f" />
            <path d="M314 146 q26 -18 52 0 v15 h-52 z" fill="#007a3d" />
          </g>
          <!-- field-work node (top) -->
          <g>
            <circle cx="205" cy="28" r="38" fill="#fcd856" />
            <path d="M178 30 l54 -14" stroke="#d6242b" stroke-width="9" stroke-linecap="round" />
            <circle cx="185" cy="18" r="8" fill="#d6242b" />
            <path d="M212 34 l20 10" stroke="#7a4a2e" stroke-width="6" stroke-linecap="round" />
          </g>
          <!-- small globe node -->
          <circle cx="430" cy="112" r="16" fill="#d6242b" />
          <circle cx="430" cy="112" r="8" fill="#fcd856" />
        </svg>
      </div>

      <!-- Overlapping DRDM emblem medallion -->
      <div class="avatar-ring">
        <img :src="emblemUrl" alt="Disaster Risk Management Division, Seychelles" />
      </div>

      <form class="form-body" @submit.prevent="submit">
        <div class="lockup">
          <div class="lockup-title">5Ws Seychelles</div>
          <div class="lockup-sub">Civil Society Coordination Platform</div>
        </div>
        <label class="field">
          <span>Username or Email</span>
          <input v-model="username" autocomplete="username" required autofocus />
        </label>
        <label class="field">
          <span>Password</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>

        <label class="remember">
          <input v-model="remember" type="checkbox" />
          <span>Remember me</span>
        </label>

        <p v-if="error" class="form-error">{{ error }}</p>

        <button class="login-btn" :disabled="busy">
          {{ busy ? 'LOGGING IN…' : 'LOG IN' }}
        </button>

        <p class="aux-link">
          <a href="#" @click.prevent="showAccountHint">Forgot your password?</a>
        </p>
        <p class="aux-text">
          Not a member? <a href="#" @click.prevent="showAccountHint">Register</a>
        </p>
        <p class="aux-text" style="margin-top: 6px">
          <router-link :to="{ name: 'welcome' }">← View public overview</router-link>
        </p>
        <p v-if="hint" class="hint">{{ hint }}</p>
      </form>
      <div class="flag-bar" aria-hidden="true"></div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100%;
  background: linear-gradient(160deg, #003f87 0%, #0e6fae 55%, #0a9d8f 115%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.login-card {
  position: relative;
  width: min(468px, 100%);
  background: #efefef;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.banner {
  height: 120px;
  background: #003f87;
  overflow: hidden;
}
.banner-art { width: 100%; height: 100%; display: block; }

.avatar-ring {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #fff;
  border: 5px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.avatar-ring img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
  display: block;
}

.form-body {
  padding: 56px 34px 22px;
}

.lockup { text-align: center; margin-bottom: 16px; }
.lockup-title {
  font-size: 20px;
  font-weight: 900;
  color: #111;
  line-height: 1.15;
}
.lockup-sub {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #777;
  margin-top: 2px;
}

.field { display: block; margin-bottom: 12px; }
.field span {
  display: block;
  font-size: 14px;
  color: #333;
  margin-bottom: 5px;
}
.field input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  font-size: 15px;
  color: #222;
  background: #fff;
  border: 1px solid #e2e2e2;
  border-radius: 6px;
  outline: none;
}
.field input:focus { border-color: #003f87; }

.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: #333;
  margin: 2px 0 14px;
  cursor: pointer;
}
.remember input { width: 15px; height: 15px; accent-color: #003f87; }

.form-error {
  color: #c0392b;
  font-size: 13px;
  margin: 0 0 12px;
  text-align: center;
}

.login-btn {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 4px;
  background: #d6242b;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.15s;
}
.login-btn:hover:not(:disabled) { background: #b81d23; }
.login-btn:disabled { opacity: 0.7; cursor: default; }

.aux-link { text-align: center; margin: 14px 0 4px; }
.aux-link a {
  color: #003f87;
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
}
.aux-text {
  text-align: center;
  font-size: 13px;
  color: #8a8a8a;
  margin: 0;
}
.aux-text a { color: #003f87; font-weight: 700; text-decoration: none; }
.aux-link a:hover, .aux-text a:hover { text-decoration: underline; }

.hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: #666;
  text-align: center;
}

.flag-bar {
  height: 6px;
  background: linear-gradient(
    100deg,
    #003f87 0%, #003f87 20%,
    #fcd856 20%, #fcd856 40%,
    #d6242b 40%, #d6242b 60%,
    #ffffff 60%, #ffffff 80%,
    #007a3d 80%, #007a3d 100%
  );
}
</style>
