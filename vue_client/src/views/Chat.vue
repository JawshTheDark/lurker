<template>
  <div class="chat">
    <aside class="sidebar">
      <div class="sidebar-head">
        <span class="logo">caint</span>
        <span class="status" :class="{ on: connected, off: !connected }">{{ connected ? '●' : '○' }}</span>
        <button class="link" @click="openAddNetwork" title="Add network">+</button>
      </div>
      <BufferList @edit-network="openEditNetwork" />
      <div class="sidebar-foot">
        <RouterLink class="link" to="/settings">settings</RouterLink>
        <button class="link" @click="signOut">sign out</button>
      </div>
    </aside>

    <main class="main">
      <header v-if="active && topic" class="topic">
        <div class="topic-text">{{ topic }}</div>
      </header>

      <MessageList />
      <StatusBar />
      <MessageInput />
    </main>

    <aside v-if="active" class="members">
      <MemberList />
    </aside>

    <NetworkForm
      v-if="showNetworkForm"
      :network="editingNetwork"
      @close="closeNetworkForm"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../stores/auth.js';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSocket } from '../composables/useSocket.js';
import BufferList from '../components/BufferList.vue';
import MessageList from '../components/MessageList.vue';
import MessageInput from '../components/MessageInput.vue';
import MemberList from '../components/MemberList.vue';
import NetworkForm from '../components/NetworkForm.vue';
import StatusBar from '../components/StatusBar.vue';

const auth = useAuthStore();
const networks = useNetworksStore();
const buffers = useBuffersStore();
const settings = useSettingsStore();
const router = useRouter();
const { connected } = useSocket();

const showNetworkForm = ref(false);
const editingNetwork = ref(null);
const { activeKey } = storeToRefs(networks);

function openAddNetwork() {
  editingNetwork.value = null;
  showNetworkForm.value = true;
}
function openEditNetwork(net) {
  editingNetwork.value = net;
  showNetworkForm.value = true;
}
function closeNetworkForm() {
  showNetworkForm.value = false;
  editingNetwork.value = null;
}

const active = computed(() => networks.activeBuffer);
const activeBuf = computed(() => (activeKey.value ? buffers.byKey(activeKey.value) : null));
const topic = computed(() => activeBuf.value?.topic);

onMounted(async () => {
  if (!settings.loaded) settings.fetchAll().catch(() => {});
  await networks.fetchAll();
});

async function signOut() {
  await auth.logout();
  router.replace('/login');
}
</script>

<style scoped>
.chat {
  display: grid;
  grid-template-columns: 220px 1fr 180px;
  grid-template-rows: 100vh;
  height: 100vh;
  overflow: hidden;
}
/* min-height/min-width 0 lets flex/scrolling children stay inside the row. */
.chat > * { min-width: 0; min-height: 0; }

.sidebar {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.sidebar-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo { color: var(--accent); font-weight: bold; flex: 1; }
.status.on { color: var(--good); }
.status.off { color: var(--bad); }
.sidebar-foot {
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}
.user { flex: 1; color: var(--fg-muted); }
.link {
  background: none;
  border: none;
  color: var(--accent);
  padding: 2px 4px;
  cursor: pointer;
  font: inherit;
}
.link:hover { color: var(--fg); }

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.topic {
  padding: 0 12px 1ch;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.topic strong { font-weight: 600; }
.topic-text { color: var(--fg-muted); }
.meta { color: var(--fg-muted); }

.members {
  border-left: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
