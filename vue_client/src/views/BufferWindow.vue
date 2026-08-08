<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0

  A single buffer, alone in its own browser window (`/popout/:id`). Opened by
  the "Pop out" action; see composables/usePopoutWindows.ts.

  ⚠ The reason this is ~150 lines instead of a refactor of MessageList &co:
  every browser window is its own JS context, so it gets its OWN Pinia store and
  therefore its OWN `networks.activeKey`. The four conversation components read
  that global directly — which would be the whole problem for an in-page split
  pane, but is exactly what makes a separate WINDOW free. We activate our buffer
  on mount and the components resolve to it with no changes at all.

  Addressed by bufferId, matching the `/buffer/:id` convention router.ts adopted
  in 2.0: a name in the path would have to percent-encode every `#&+!` sigil and
  would leak channel and DM names into history, PWA recents and Referer.

  Multi-window is already a supported case server-side: activeBufferService
  tracks the focused buffer PER CONNECTION (each window opens its own socket)
  and prefers a visible tab, so `notice.msgbuffer='active'` still routes to the
  window you're looking at. Drafts and read-state fan out across sockets.
-->

<template>
  <div class="buffer-window" :class="{ 'members-collapsed': !showMembers || !hasNicklist }">
    <header class="topic">
      <span class="label" :title="bufferLabel">{{ bufferLabel }}</span>
      <span v-if="topic" class="topic-text" :title="topic">{{ topic }}</span>
      <span v-if="!ready" class="pending">connecting…</span>
      <IconButton
        v-if="hasNicklist"
        icon="fa-users"
        :label="showMembers ? 'Hide member list' : 'Show member list'"
        @click="showMembers = !showMembers"
      />
    </header>
    <div class="topic-divider"></div>

    <MessageList />
    <MemberList v-if="showMembers && hasNicklist" />
    <StatusBar />
    <MessageInput v-if="hasInput" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import MessageList from '../components/MessageList.vue';
import MessageInput from '../components/MessageInput.vue';
import MemberList from '../components/MemberList.vue';
import StatusBar from '../components/StatusBar.vue';
import IconButton from '../components/IconButton.vue';
import { useBuffersStore } from '../stores/buffers.js';
import { useNetworksStore } from '../stores/networks.js';
import { useActiveBuffer } from '../composables/useActiveBuffer.js';
import { useChatBootstrap } from '../composables/useChatBootstrap.js';
import { connected, useSocket } from '../composables/useSocket.js';
import { registerAsPopout } from '../composables/usePopoutWindows.js';

const route = useRoute();
const buffers = useBuffersStore();
const networks = useNetworksStore();

// Same bootstrap the main shell runs: this window needs its own presence and
// visibility reporter (that's what lets the server tell a focused pop-out from
// a hidden one) and its own hydration reconciler.
useChatBootstrap();
// ⚠ REQUIRED, and easy to miss: useChatBootstrap() only starts the reporters —
// it's useSocket()'s onMounted that actually OPENS the WebSocket. Every other
// view that needs a live connection calls this too. Without it the socket never
// opens, `connected` stays false, and the pop-out sits on "connecting…".
useSocket();

const bufferId = computed(() => {
  const n = Number(route.params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
});

const { topic, bufferLabel, hasInput, hasNicklist } = useActiveBuffer();
const showMembers = ref(true);
const ready = ref(false);

// Join the pop-out registry so "Tile" can place this window.
const unregister = registerAsPopout(bufferId.value);
onBeforeUnmount(unregister);

// Resolve through the store's `byId` getter, NOT a module-level index: a plain
// Map is invisible to Vue, so a watcher on it would never re-fire when the ids
// finally land — and on a cold launch they arrive after the socket connects,
// which is exactly the case this deferral exists for. (Same reasoning as
// useBufferRoute.)
const canActivate = computed(
  () => connected.value && bufferId.value != null && buffers.byId(bufferId.value) != null,
);

function activate(): void {
  if (ready.value) return;
  const id = bufferId.value;
  if (id == null) return;
  const buf = buffers.byId(id);
  if (!buf) return;
  ready.value = true;
  if (networks.activeKey !== bufferKeyOf(buf)) buffers.activate(buf.networkId, buf.target);
}

function bufferKeyOf(buf: { networkId: number | null; target: string }): string {
  return `${buf.networkId ?? ''}::${buf.target}`;
}

const stop = watch(canActivate, (ok) => ok && activate(), { immediate: true });
onBeforeUnmount(stop);

// Name the OS window after the buffer — with several pop-outs tiled across a
// screen, the title bar / taskbar entry is how you tell them apart.
watch(
  bufferLabel,
  (label) => {
    document.title = label ? `${label} — Lurker` : 'Lurker';
  },
  { immediate: true },
);
</script>

<style scoped>
/* The main shell's grid minus the sidebar column — a pop-out is only ever one
   conversation, and the buffer list belongs to the window that spawned it. */
.buffer-window {
  --members-w: 180px;
  display: grid;
  grid-template-columns: 1fr var(--members-w);
  grid-template-rows: auto auto 1fr auto auto;
  grid-template-areas:
    'topic    topic'
    'divider  divider'
    'messages members'
    'status   status'
    'input    input';
  height: 100dvh;
  overflow: hidden;
}
.buffer-window.members-collapsed {
  --members-w: 0px;
}
.buffer-window > * {
  min-width: 0;
  min-height: 0;
}

.topic {
  grid-area: topic;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg);
}
.label {
  font-weight: 600;
  white-space: nowrap;
}
.topic-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-muted);
}
.pending {
  margin-left: auto;
  color: var(--fg-muted);
}
.topic-divider {
  grid-area: divider;
  height: 1px;
  background: var(--border);
}

/* These selectors target the root elements of the imported components. Vue 3
   scoped CSS attaches the parent's data-v attribute to a child component's root
   element, so these match the rendered roots of MessageList / MemberList /
   StatusBar / MessageInput — the same contract DesktopChat.vue relies on. */
.message-list {
  grid-area: messages;
}
.members {
  grid-area: members;
  border-left: 1px solid var(--border);
}
.status-bar {
  grid-area: status;
}
.input {
  grid-area: input;
}
</style>
