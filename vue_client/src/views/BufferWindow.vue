<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0

  A single buffer, alone in its own browser window (`/b/:networkId/:target`).
  Opened by the "Pop out" action; see composables/usePopoutWindows.ts.

  ⚠ The reason this is ~150 lines instead of a refactor of MessageList &co:
  every browser window is its own JS context, so it gets its OWN Pinia store and
  therefore its OWN `networks.activeKey`. The four conversation components read
  that global directly — which would be the whole problem for an in-page split
  pane, but is exactly what makes a separate WINDOW free. We activate our buffer
  on mount and the components resolve to it with no changes at all.

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
      <button
        v-if="hasNicklist"
        type="button"
        class="members-toggle"
        :title="showMembers ? 'Hide member list' : 'Show member list'"
        @click="showMembers = !showMembers"
      >
        <i class="fa-solid fa-users"></i>
      </button>
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
import { useBuffersStore } from '../stores/buffers.js';
import { useActiveBuffer } from '../composables/useActiveBuffer.js';
import { useChatBootstrap } from '../composables/useChatBootstrap.js';
import { connected } from '../composables/useSocket.js';

const route = useRoute();
const buffers = useBuffersStore();

// Same bootstrap the main shell runs. The reporters it starts are per-context
// module singletons, so this window gets its own presence/visibility reporter
// (which is what lets the server tell a focused pop-out from a hidden one) and
// its own hydration reconciler. No `onJump`: a pop-out is pinned to one buffer
// and must never navigate itself somewhere else on a notification click.
useChatBootstrap();

const networkId = computed(() => Number(route.params.networkId));
// Encoded by the opener because a channel's leading '#' is a URL fragment
// delimiter; vue-router hands it back already decoded.
const target = computed(() => String(route.params.target ?? ''));

const { topic, bufferLabel, hasInput, hasNicklist } = useActiveBuffer();
const showMembers = ref(true);
const ready = ref(false);

// Activate once the socket is up AND the buffer registry has landed — the
// buffer list arrives in the connect-burst snapshot, so activating before that
// would resolve to nothing and blank the pane. Mirrors consumeColdStartJump's
// readiness gate rather than racing the snapshot.
const canActivate = computed(
  () =>
    connected.value &&
    Number.isFinite(networkId.value) &&
    !!target.value &&
    buffers.isOpen(networkId.value, target.value),
);

function activate(): void {
  buffers.activate(networkId.value, target.value);
  ready.value = true;
}

const stop = watch(
  canActivate,
  (ok) => {
    if (!ok || ready.value) return;
    activate();
    stop();
  },
  { immediate: true },
);
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
  gap: 0.6rem;
  padding: 0.4rem 0.7rem;
  background: var(--panel-bg, #1b1d24);
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
  opacity: 0.75;
  font-size: 0.85rem;
}
.pending {
  margin-left: auto;
  opacity: 0.6;
  font-size: 0.8rem;
}
.members-toggle {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--fg-muted, #9aa0ac);
  cursor: pointer;
  padding: 0.2rem 0.35rem;
}
.members-toggle:hover {
  color: var(--text, #e7e9ee);
}
.topic-divider {
  grid-area: divider;
  height: 1px;
  background: var(--border, #2c2f38);
}

/* These selectors target the root elements of the imported components. Vue 3
   scoped CSS attaches the parent's data-v attribute to a child component's root
   element, so .message-list / .members / .status-bar / .input here match the
   rendered roots of MessageList / MemberList / StatusBar / MessageInput. Same
   contract DesktopChat.vue relies on. */
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
