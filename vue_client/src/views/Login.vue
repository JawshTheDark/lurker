<template>
  <div class="login">
    <form class="card" @submit.prevent="submit">
      <h1>Caint</h1>
      <p class="subtitle">Sign in to your IRC client.</p>
      <label>
        <span>Username</span>
        <input v-model="username" autocomplete="username" autofocus required />
      </label>
      <label>
        <span>Password</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
      <p v-if="auth.error" class="error">{{ auth.error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const username = ref('');
const password = ref('');
const loading = ref(false);
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

async function submit() {
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.replace(route.query.next || '/');
  } catch (_) {
    // error displayed via auth.error
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 28px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
h1 { margin: 0; color: var(--accent); font-size: 28px; }
.subtitle { margin: 0; color: var(--fg-muted); }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--fg-muted); }
label span { text-transform: uppercase; letter-spacing: 0.05em; }
.error { margin: 0; color: var(--bad); font-size: 13px; }
</style>
