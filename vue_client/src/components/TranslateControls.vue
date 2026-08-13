<!-- Copyright (c) 2026 Brad Root
     SPDX-License-Identifier: MPL-2.0 -->

<!--
  The per-conversation translation controls: a reading toggle (overlay incoming),
  a posting toggle (translate-approve outgoing), and — only while posting is on —
  a language picker for what to translate outgoing messages INTO.

  Shared by DesktopChat and MobileChat so the two can never drift again (they did:
  mobile shipped with no translation UI at all). The host passes a bufferId and a
  button class matching its own toolbar idiom ('link' desktop, 'icon' mobile).

  Renders nothing unless a backend is configured and a real buffer is active —
  the same "a switch with no service behind it is worse than none" doctrine the
  topic bar already applied inline.
-->
<template>
  <template v-if="translate.enabled && bufferId != null">
    <button
      type="button"
      :class="[buttonClass, { 'tr-on': translate.readingEnabled(bufferId) }]"
      :title="
        translate.readingEnabled(bufferId)
          ? 'Stop translating incoming messages'
          : 'Translate incoming messages'
      "
      aria-label="Toggle incoming translation"
      @click="translate.setReading(bufferId, !translate.readingEnabled(bufferId))"
    >
      <i class="fa-solid fa-language"></i>
    </button>
    <button
      type="button"
      :class="[buttonClass, { 'tr-on': translate.postingEnabled(bufferId) }]"
      :title="
        translate.postingEnabled(bufferId)
          ? 'Stop translating outgoing messages'
          : 'Translate outgoing messages (with approval)'
      "
      aria-label="Toggle outgoing translation"
      @click="translate.setPosting(bufferId, !translate.postingEnabled(bufferId))"
    >
      <i class="fa-solid fa-pen-to-square"></i>
    </button>
    <!-- The "into what?" the posting toggle used to lack. Only meaningful while
         posting is on; the reading target already answers "into what?" for
         incoming, so there is no matching picker there. -->
    <select
      v-if="translate.postingEnabled(bufferId)"
      class="tr-lang"
      title="Language to translate your messages into"
      aria-label="Outgoing translation language"
      :value="translate.postLangFor(bufferId) ?? ''"
      @change="onLang"
    >
      <option v-for="l in languages" :key="l.code" :value="l.code">{{ l.label }}</option>
    </select>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTranslateStore } from '../stores/translate.js';
import { getOption } from '../utils/settingsRegistry.js';

const props = withDefaults(
  defineProps<{
    bufferId: number | null | undefined;
    buttonClass?: string;
  }>(),
  { buttonClass: 'link' },
);

const translate = useTranslateStore();

// The picker's options ARE the registry's target-language list — read once,
// never a second hand-maintained copy that can fall out of sync with settings.
const languages = computed(() => {
  const opt = getOption('chat.translate.target_lang');
  const choices = (opt && 'choices' in opt ? opt.choices : []) as readonly string[];
  const labels = (opt && 'choiceLabels' in opt ? opt.choiceLabels : undefined) as
    | Record<string, string>
    | undefined;
  return choices.map((code) => ({ code, label: labels?.[code] ?? code }));
});

function onLang(e: Event) {
  if (props.bufferId == null) return;
  translate.setPostLang(props.bufferId, (e.target as HTMLSelectElement).value);
}
</script>

<style scoped>
.tr-lang {
  height: 1.9rem;
  max-width: 9rem;
  padding: 0 0.35rem;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(128, 128, 128, 0.35));
  background: var(--input-bg, transparent);
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.tr-lang:hover {
  border-color: var(--accent, #7c5cff);
}
</style>
