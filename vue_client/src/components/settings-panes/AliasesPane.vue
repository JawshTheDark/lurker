<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0

  Custom slash-command aliases. Add a short name → command-line template with
  mIRC-style $-params; it syncs across your devices and expands before dispatch.
  Also lists the built-in shortcuts for reference. Mirrors the other bespoke
  list panes (form + list) in structure and styling.
-->

<template>
  <section id="aliases" class="settings-pane">
    <h2>aliases</h2>
    <p class="section-desc">
      Create your own slash commands. Type <code>/name</code> and it expands to the command line
      below before it runs. Use parameters in the expansion: <code>$1</code>…<code>$9</code>
      (individual args), <code>$2-</code> (2nd arg onward), <code>$*</code> (all args),
      <code>$me</code> (your nick), <code>$chan</code> (current channel/DM). With no parameter, your
      typed args are appended. Aliases sync across your devices; a custom alias overrides a built-in
      of the same name.
    </p>
    <p v-if="error" class="error inline">{{ error }}</p>

    <h3 class="subhead">add an alias</h3>
    <form class="create-form" @submit.prevent="onAdd">
      <label>
        <span>Name (no slash)</span>
        <input
          v-model="newName"
          type="text"
          maxlength="32"
          placeholder="e.g. op"
          spellcheck="false"
        />
      </label>
      <label>
        <span>Expands to</span>
        <input
          v-model="newExpansion"
          type="text"
          maxlength="512"
          placeholder="e.g. mode $chan +o $1"
          spellcheck="false"
        />
      </label>
      <div class="create-actions">
        <button class="link" type="submit" :disabled="!canAdd">add</button>
      </div>
    </form>

    <h3 class="subhead">your aliases</h3>
    <p v-if="!aliases.aliases.length" class="section-desc muted">No custom aliases yet.</p>
    <ul v-else class="alias-list">
      <li v-for="a in aliases.aliases" :key="a.id" class="alias-row">
        <code class="alias-name">/{{ a.name }}</code>
        <span class="alias-arrow">→</span>
        <code class="alias-expansion">{{ a.expansion }}</code>
        <button class="link danger" type="button" @click="aliases.removeById(a.id)">remove</button>
      </li>
    </ul>

    <h3 class="subhead">built-in shortcuts</h3>
    <p class="section-desc muted">Always available (unless you override the name above).</p>
    <ul class="alias-list builtin">
      <li v-for="[name, exp] in builtins" :key="name" class="alias-row">
        <code class="alias-name">/{{ name }}</code>
        <span class="alias-arrow">→</span>
        <code class="alias-expansion">/{{ exp }}</code>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAliasesStore } from '../../stores/aliases.js';
import { BUILTIN_ALIASES } from '../../lib/commands/catalog.js';

const aliases = useAliasesStore();

const newName = ref('');
const newExpansion = ref('');
const error = ref('');

const builtins = Object.entries(BUILTIN_ALIASES).sort((a, b) => a[0].localeCompare(b[0]));

const canAdd = computed(() => !!newName.value.trim() && !!newExpansion.value.trim());

function onAdd() {
  const name = newName.value.trim().replace(/^\/+/, '');
  const expansion = newExpansion.value.trim();
  if (!name || !expansion) return;
  if (/\s/.test(name)) {
    error.value = 'Alias name must be a single word (no spaces).';
    return;
  }
  error.value = '';
  aliases.add(name, expansion);
  newName.value = '';
  newExpansion.value = '';
}
</script>

<style scoped>
.alias-list {
  list-style: none;
  margin: 0.25rem 0 0.75rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.alias-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.alias-name {
  font-weight: 600;
  white-space: nowrap;
}
.alias-arrow {
  opacity: 0.6;
}
.alias-expansion {
  flex: 1 1 auto;
  overflow-wrap: anywhere;
}
.alias-list.builtin {
  opacity: 0.85;
}
.muted {
  opacity: 0.7;
}
.link.danger {
  color: var(--danger, #c0392b);
}
</style>
