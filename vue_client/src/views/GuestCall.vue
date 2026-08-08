<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0

  Public guest page for a voice call (`/call/:token`) — the one route in the app
  with NO account behind it. Someone an op sent a link to picks a display name
  and joins; the in-call controls are the global CallBar, same as for a member.

  The token in the path is the whole credential, so this page deliberately shows
  nothing about the channel before it is redeemed: naming the channel to anyone
  holding a URL (or reading a Referer) would leak more than the link grants.
-->

<template>
  <div class="guest-call">
    <div class="card">
      <h1>Join voice call</h1>

      <p v-if="!config.voiceEnabled" class="err">Voice calling isn’t available here.</p>

      <template v-else-if="!voice.active && !voice.connecting">
        <p class="hint">You’ve been invited to a voice call. Pick a name to join.</p>
        <input
          v-model="name"
          class="name"
          placeholder="Your name"
          maxlength="24"
          spellcheck="false"
          :disabled="joining"
          @keyup.enter="join"
        />
        <button class="join" type="button" :disabled="!name.trim() || joining" @click="join">
          {{ joining ? 'Joining…' : 'Join call' }}
        </button>
        <p v-if="error" class="err">{{ error }}</p>
      </template>

      <p v-else-if="voice.connecting" class="hint">Connecting…</p>

      <template v-else>
        <p class="ok">You’re in the call.</p>
        <p class="hint">
          {{
            voice.muted
              ? 'This link is listen-only — you can hear everyone, but not speak.'
              : 'Use the call controls in the corner to mute or leave.'
          }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useVoiceStore } from '../stores/voice.js';
import { useConfigStore } from '../stores/config.js';

const route = useRoute();
const voice = useVoiceStore();
const config = useConfigStore();

const token = String(route.params.token || '');
const name = ref('');
const joining = ref(false);
const error = ref('');

// A guest has no session, so nothing else fetches this — without it
// `voiceEnabled` is false and the page claims voice is unavailable.
onMounted(() => {
  if (!config.checked) void config.fetch().catch(() => {});
});

async function join() {
  if (!name.value.trim() || joining.value) return;
  joining.value = true;
  error.value = '';
  try {
    await voice.joinAsGuest(token, name.value.trim());
    if (voice.error) error.value = voice.error;
  } finally {
    joining.value = false;
  }
}
</script>

<style scoped>
.guest-call {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--bg);
  color: var(--fg);
}
.card {
  width: 100%;
  max-width: 22rem;
  padding: var(--space-6);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  text-align: center;
}
.card h1 {
  font-size: 1.15rem;
  margin: 0 0 var(--space-4);
}
.hint {
  color: var(--fg-muted);
  margin: 0 0 var(--space-4);
}
.name {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  border: 1px solid var(--border);
  background: var(--bg);
  color: inherit;
}
.join {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  background: var(--accent);
  color: var(--bg);
  font-weight: 600;
  cursor: pointer;
}
.join:disabled {
  opacity: 0.55;
  cursor: default;
}
.ok {
  color: var(--good);
  font-weight: 600;
}
.err {
  color: var(--bad);
  margin: var(--space-3) 0 0;
}
</style>
