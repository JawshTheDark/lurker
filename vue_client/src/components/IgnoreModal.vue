<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: Elastic-2.0
-->

<template>
  <div class="modal" @click.self="$emit('close')" @keydown.esc="$emit('close')">
    <div class="card" tabindex="-1" ref="cardEl">
      <header class="head">
        <h2>ignore {{ nick }}</h2>
        <button class="link" @click="$emit('close')" title="close"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <form class="body" @submit.prevent="confirm">
        <label class="field">
          <span class="label-text">Mask</span>
          <input
            ref="inputEl"
            v-model="mask"
            type="text"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
          />
        </label>
        <p class="hint">
          Plain nick (e.g. <code>{{ nick }}</code>) or <code>nick!user@host</code>
          with <code>*</code> wildcards. The default targets this user's
          identity (<code>user@host</code>) so it survives nick changes.
        </p>
        <p class="preview">
          Messages matching <code>{{ mask || '∅' }}</code> will be hidden on this network.
        </p>
        <div class="actions">
          <button type="button" class="btn-secondary" @click="$emit('close')">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="!mask.trim()">Ignore</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useIgnoresStore } from '../stores/ignores.js';

const props = defineProps({
  nick: { type: String, required: true },
  user: { type: String, default: null },
  host: { type: String, default: null },
  networkId: { type: Number, default: null },
});
const emit = defineEmits(['close']);

const ignores = useIgnoresStore();
const cardEl = ref(null);
const inputEl = ref(null);

// Default to a hostmask that hides the nick segment — IRCCloud convention.
// If we don't have an observed user@host yet (member entered before WHO
// completed and we never saw a join), fall back to nick!*@*.
const mask = ref(
  props.user && props.host
    ? `*!${props.user}@${props.host}`
    : `${props.nick}!*@*`,
);

function confirm() {
  const trimmed = mask.value.trim();
  if (!trimmed || !props.networkId) return;
  ignores.addMask(props.networkId, trimmed);
  emit('close');
}

onMounted(() => {
  cardEl.value?.focus();
  // Focus the input next tick so Tab/Enter behave naturally on open.
  setTimeout(() => inputEl.value?.focus(), 0);
});
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.card {
  background: var(--bg);
  border: 1px solid var(--accent);
  width: min(560px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  outline: none;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.head h2 {
  margin: 0;
  flex: 1;
  color: var(--accent);
  font-weight: 600;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link {
  background: none;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  font: inherit;
  padding: 0 4px;
}
.link:hover { color: var(--fg); }
.body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.label-text {
  color: var(--fg-muted);
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
input {
  background: var(--bg-soft);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 6px 8px;
  font: inherit;
}
input:focus { outline: 1px solid var(--accent); }
.hint, .preview {
  margin: 0;
  color: var(--fg-muted);
  font-size: 0.9em;
  line-height: 1.45;
}
.preview { color: var(--fg); }
code {
  background: var(--bg-soft);
  padding: 0 4px;
  border-radius: 2px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.btn-primary,
.btn-secondary {
  background: none;
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 6px 14px;
  cursor: pointer;
  font: inherit;
}
.btn-primary {
  border-color: var(--accent);
  color: var(--accent);
}
.btn-primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
.btn-secondary:hover { background: var(--bg-soft); }
</style>
