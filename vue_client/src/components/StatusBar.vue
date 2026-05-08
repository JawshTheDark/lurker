<template>
  <div class="status-bar">
    <span class="clock">[{{ clock }}]</span>
    <span v-if="bufferLabel" class="buffer">{{ bufferLabel }}</span>
    <span v-if="memberCount != null" class="count">{{ '{' + memberCount + '}' }}</span>
    <TypingIndicator class="typing" />
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { useSettingsStore } from '../stores/settings.js';
import { formatTimestamp } from '../utils/timestamp.js';
import TypingIndicator from './TypingIndicator.vue';

const networks = useNetworksStore();
const buffers = useBuffersStore();
const settings = useSettingsStore();

const tsFormat = computed(() => settings.effective('look.bar.time_format') || 'HH:mm');
const now = ref(new Date());

let timer = null;
onMounted(() => {
  timer = setInterval(() => { now.value = new Date(); }, 1000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const clock = computed(() => formatTimestamp(now.value.toISOString(), tsFormat.value));

const bufferLabel = computed(() => {
  const t = networks.activeBuffer?.target;
  if (!t) return '';
  if (t.startsWith(':server:')) return '[server]';
  return `[${t}]`;
});

// Show the nicklist count only for channels (not server consoles or DMs).
const memberCount = computed(() => {
  const t = networks.activeBuffer?.target;
  if (!t || !t.startsWith('#')) return null;
  const buf = networks.activeKey ? buffers.byKey(networks.activeKey) : null;
  return buf?.members?.length ?? null;
});
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 1ch;
  padding: 1ch 12px 0;
  border-top: 1px solid var(--border);
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
}
.clock { color: var(--fg-muted); }
.buffer { color: var(--accent); }
.count { color: var(--fg-muted); }
.typing { flex: 0 0 auto; }
</style>
