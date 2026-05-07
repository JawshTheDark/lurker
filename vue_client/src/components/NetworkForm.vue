<template>
  <div class="modal" @click.self="$emit('close')">
    <form class="card" @submit.prevent="submit">
      <h2>Add network</h2>
      <label>
        <span>Name</span>
        <input v-model="form.name" placeholder="Libera" required />
      </label>
      <div class="row">
        <label class="grow">
          <span>Host</span>
          <input v-model="form.host" placeholder="irc.libera.chat" required />
        </label>
        <label class="port">
          <span>Port</span>
          <input v-model.number="form.port" type="number" min="1" max="65535" />
        </label>
        <label class="tls">
          <span>TLS</span>
          <input v-model="form.tls" type="checkbox" />
        </label>
      </div>
      <label>
        <span>Nick</span>
        <input v-model="form.nick" required />
      </label>
      <label>
        <span>Real name (optional)</span>
        <input v-model="form.realname" />
      </label>
      <label>
        <span>Server password (optional)</span>
        <input v-model="form.server_password" type="password" autocomplete="off" />
      </label>
      <label class="check">
        <input v-model="form.autoconnect" type="checkbox" />
        <span>Connect on server startup</span>
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="ghost" @click="$emit('close')">Cancel</button>
        <button type="submit" :disabled="loading">{{ loading ? 'Saving…' : 'Save & connect' }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useNetworksStore } from '../stores/networks.js';

const emit = defineEmits(['close']);
const networks = useNetworksStore();

const form = reactive({
  name: '',
  host: '',
  port: 6697,
  tls: true,
  nick: '',
  realname: '',
  server_password: '',
  autoconnect: true,
});

const loading = ref(false);
const error = ref(null);

async function submit() {
  loading.value = true;
  error.value = null;
  try {
    await networks.create({ ...form });
    emit('close');
  } catch (err) {
    error.value = err.message || 'failed to save network';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.card {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h2 { margin: 0; color: var(--accent); }
label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--fg-muted); }
label span { text-transform: uppercase; letter-spacing: 0.05em; }
.row { display: flex; gap: 8px; align-items: end; }
.grow { flex: 1; }
.port { width: 80px; }
.tls { width: 48px; align-items: center; }
.tls input { transform: scale(1.2); }
.check { flex-direction: row; align-items: center; gap: 8px; }
.check input { width: auto; }
.check span { text-transform: none; letter-spacing: normal; color: var(--fg); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.ghost { background: transparent; }
.error { color: var(--bad); margin: 0; font-size: 13px; }
</style>
