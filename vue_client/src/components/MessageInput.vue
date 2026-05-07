<template>
  <form class="input" @submit.prevent="submit">
    <input
      v-model="text"
      :placeholder="placeholder"
      :disabled="!active"
      autocomplete="off"
    />
    <button type="submit" :disabled="!active || !text.trim() || (isServer && !text.startsWith('/'))">Send</button>
  </form>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { socketSend } from '../composables/useSocket.js';

const networks = useNetworksStore();
const text = ref('');

const active = computed(() => networks.activeBuffer);
const isServer = computed(() => active.value?.target?.startsWith(':server:'));
const sendable = computed(() => !!active.value && !isServer.value);
const placeholder = computed(() => {
  if (!active.value) return 'Select a channel';
  if (isServer.value) return 'Use /raw <line> here to send raw IRC';
  return `Message ${active.value.target} (try /help)`;
});

function submit() {
  const raw = text.value;
  if (!raw.trim() || !active.value) return;
  const { networkId, target } = active.value;

  if (raw.startsWith('/')) {
    handleCommand(raw, networkId, target);
  } else if (sendable.value) {
    socketSend({ type: 'send', networkId, target, text: raw });
  } else {
    return;
  }
  text.value = '';
}

function handleCommand(line, networkId, target) {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const argLine = line.slice(1 + cmd.length).trim();
  switch (cmd.toLowerCase()) {
    case 'me':
      socketSend({ type: 'action', networkId, target, text: argLine });
      break;
    case 'msg':
    case 'query': {
      const [who, ...msgParts] = rest;
      if (!who) return;
      const body = msgParts.join(' ');
      if (body) socketSend({ type: 'send', networkId, target: who, text: body });
      networks.setActive(networkId, who);
      break;
    }
    case 'join':
      if (rest[0]) {
        const ch = rest[0].startsWith('#') ? rest[0] : `#${rest[0]}`;
        socketSend({ type: 'join', networkId, channel: ch });
      }
      break;
    case 'part':
    case 'leave':
      socketSend({ type: 'part', networkId, channel: rest[0] || target, reason: rest.slice(1).join(' ') });
      break;
    case 'raw':
    case 'quote':
      socketSend({ type: 'raw', networkId, line: argLine });
      break;
    case 'help':
      alert('Commands: /me, /msg <nick> <text>, /join #chan, /part [#chan] [reason], /raw <line>');
      break;
    default:
      socketSend({ type: 'raw', networkId, line: line.slice(1) });
  }
}
</script>

<style scoped>
.input {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-alt);
}
input { flex: 1; }
</style>
