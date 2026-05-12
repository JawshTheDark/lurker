<template>
  <div v-if="active" class="status-bar" :class="{ compact }">
    <span class="seg clock">{{ clock }}</span>
    <span class="seg buffer"><template v-if="targetLabel"><span v-if="networkLabel && !compact" class="net">{{ networkLabel }}/</span><span class="name">{{ targetLabel }}</span></template><span v-else class="name">{{ networkLabel }}</span><span v-if="modeSuffix && !compact" class="modes">{{ modeSuffix }}</span></span>
    <span v-if="memberCount != null && !compact" class="seg count"><span class="num">{{ memberCount }}</span> {{ memberCount === 1 ? 'user' : 'users' }}</span>
    <span v-if="lagLabel && !compact" class="seg lag">{{ lagLabel }}</span>
    <span v-if="uploadLabel" class="seg upload" :class="{ failed: uploads.failedAt }">{{ uploadLabel }}</span>
    <button v-if="newBelow > 0 && !compact" class="seg jump" type="button" @click="onJumpToBottom">{{ newBelow }} new ↓</button>
    <span v-if="typingSegments.length" class="seg typing">Typing: <template v-for="(seg, i) in typingSegments" :key="i"><span :style="seg.color ? { color: seg.color } : null">{{ seg.text }}</span></template></span>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { useSettingsStore } from '../stores/settings.js';
import { useUploadsStore } from '../stores/uploads.js';
import { useNickColors } from '../composables/useNickColors.js';
import { useScrollState, requestScrollToBottom } from '../composables/useScrollState.js';
import { formatTimestamp } from '../utils/timestamp.js';

defineProps({
  // Mobile/petite mode: hide the network prefix, mode suffix, member count,
  // lag, and "new ↓" jump button. Leaves clock | buffer | typing — what fits
  // legibly on a phone width.
  compact: { type: Boolean, default: false },
});

const networks = useNetworksStore();
const buffers = useBuffersStore();
const settings = useSettingsStore();
const uploads = useUploadsStore();
const nickColors = useNickColors();

const uploadLabel = computed(() => {
  if (uploads.current) return `Uploading: ${uploads.current.progress}%`;
  if (uploads.failedAt) {
    return uploads.failedMessage ? `Upload failed — ${uploads.failedMessage}` : 'Upload failed';
  }
  return '';
});
const { newBelow } = useScrollState();

const active = computed(() => networks.activeBuffer);
const buffer = computed(() => (networks.activeKey ? buffers.byKey(networks.activeKey) : null));

const isServerBuffer = computed(() => !!active.value?.target?.startsWith(':server:'));
const isChannel = computed(() => !!active.value?.target?.startsWith('#'));

const networkLabel = computed(() => {
  const a = active.value;
  return a?.network?.name || '';
});

// For server pseudo-buffers we drop the redundant trailing `:server:<id>` and
// just show the network name (no `/`). Channels/DMs show the raw target.
const targetLabel = computed(() => {
  const a = active.value;
  if (!a) return '';
  if (isServerBuffer.value) return '';
  return a.target;
});

const modeSuffix = computed(() => {
  if (!isChannel.value) return '';
  const m = buffer.value?.modes;
  return m ? `(+${m})` : '';
});

const memberCount = computed(() => {
  if (!isChannel.value) return null;
  return buffer.value?.members?.length ?? null;
});

const typingNicks = computed(() => {
  const t = buffer.value?.typing;
  if (!t) return [];
  return Object.keys(t);
});

function nickSeg(nick) {
  return { text: nick, color: nickColors.color(nick) };
}

const typingSegments = computed(() => {
  const list = typingNicks.value;
  if (list.length === 0) return [];
  if (list.length === 1) return [nickSeg(list[0])];
  if (list.length === 2) return [nickSeg(list[0]), { text: ', ' }, nickSeg(list[1])];
  if (list.length === 3) return [nickSeg(list[0]), { text: ', ' }, nickSeg(list[1]), { text: ', ' }, nickSeg(list[2])];
  return [nickSeg(list[0]), { text: ', ' }, nickSeg(list[1]), { text: `, +${list.length - 2}` }];
});

const lagMs = computed(() => {
  const a = active.value;
  if (!a) return null;
  const v = networks.states[a.networkId]?.lagMs;
  return typeof v === 'number' ? v : null;
});

const lagLabel = computed(() => {
  const v = lagMs.value;
  if (v == null) return '';
  if (v < 1000) return `lag: ${v}ms`;
  return `lag: ${(v / 1000).toFixed(1)}s`;
});

// Clock lives in the status bar now. Same 1s tick + same format setting as
// the input bar used to have, so existing look.bar.time_format keeps working.
const tsFormat = computed(() => settings.effective('look.bar.time_format') || 'HH:mm:ss');
const now = ref(new Date());
let clockTimer = null;
let clockAlignTimeout = null;
// Align the first tick to the next wall-clock second boundary before
// kicking off the 1s interval. Without this, the displayed second can be
// up to ~999ms behind any NTP-synced clock — we tick from whatever
// sub-second offset mount happened at, and HH:mm:ss formatting floors.
onMounted(() => {
  const delay = 1000 - (Date.now() % 1000);
  clockAlignTimeout = setTimeout(() => {
    now.value = new Date();
    clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
  }, delay);
});
onBeforeUnmount(() => {
  if (clockAlignTimeout) clearTimeout(clockAlignTimeout);
  if (clockTimer) clearInterval(clockTimer);
});
const clock = computed(() => formatTimestamp(now.value.toISOString(), tsFormat.value));

function onJumpToBottom() {
  requestScrollToBottom();
}
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
.seg { flex: 0 0 auto; }
/* Pipe separator between consecutive visible segments. v-if removes hidden
   segments from the DOM, so adjacent-sibling matching naturally skips them. */
.seg + .seg::before {
  content: '|';
  color: var(--border);
  margin-right: 1ch;
}
.seg.clock { color: var(--fg-muted); }
.seg.buffer { color: var(--fg-muted); }
.seg.buffer .name { color: var(--accent); }
.seg.buffer .net { color: var(--fg-muted); }
.seg.buffer .modes { color: var(--fg-muted); }
.seg.count { color: var(--fg-muted); }
.seg.count .num { color: var(--accent); }
.seg.lag { color: var(--fg-muted); }
.seg.upload { color: var(--accent); }
.seg.upload.failed { color: var(--bad); }
.seg.jump {
  background: none;
  border: none;
  color: var(--warn);
  font: inherit;
  padding: 0;
  cursor: pointer;
}
.seg.jump:hover { color: var(--fg); }
</style>
