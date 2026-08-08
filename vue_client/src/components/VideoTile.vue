<!--
  Copyright (c) 2026 Brad Root
  SPDX-License-Identifier: MPL-2.0

  One participant's video — a camera or a screen share — inside the call panel.

  ⚠ THIS COMPONENT OWNS attach/detach, and that is not incidental. The room runs
  with adaptiveStream, which only starts a remote video track flowing once it is
  attached to a VISIBLE element, and pauses it when hidden. Attaching centrally
  (the way the store attaches audio to a hidden element) would keep every remote
  camera streaming for the whole call, whether or not anyone was looking.
-->

<template>
  <div ref="tileEl" class="tile" :class="{ screen: source === 'screen_share' }">
    <!-- muted on self: playing your own mic back is an echo. -->
    <video
      ref="videoEl"
      autoplay
      playsinline
      :muted="self"
      :class="{ mirror: self && isCamera }"
    ></video>
    <div class="tile-foot">
      <span class="who" :title="label">{{ label }}</span>
      <button type="button" class="full" :title="fullTitle" @click="toggleFullscreen">
        <i class="fa-solid" :class="isFull ? 'fa-compress' : 'fa-expand'"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useVoiceStore } from '../stores/voice.js';

const props = defineProps<{
  identity: string;
  source: 'camera' | 'screen_share';
  self: boolean;
}>();

const voice = useVoiceStore();
const videoEl = ref<HTMLVideoElement | null>(null);
const tileEl = ref<HTMLElement | null>(null);
const isFull = ref(false);

const isCamera = computed(() => props.source === 'camera');
const label = computed(
  () => `${props.self ? 'You' : props.identity}${isCamera.value ? '' : ' · screen'}`,
);
const fullTitle = computed(() => (isFull.value ? 'Exit fullscreen' : 'Fullscreen'));

onMounted(() => {
  if (videoEl.value) voice.attachVideo(props.identity, props.source, videoEl.value);
  document.addEventListener('fullscreenchange', onFsChange);
});

onBeforeUnmount(() => {
  if (videoEl.value) voice.detachVideo(props.identity, props.source, videoEl.value);
  document.removeEventListener('fullscreenchange', onFsChange);
});

function onFsChange(): void {
  isFull.value = document.fullscreenElement === tileEl.value;
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement === tileEl.value) await document.exitFullscreen();
    else await tileEl.value?.requestFullscreen();
  } catch {
    /* denied or unsupported — the tile stays inline */
  }
}
</script>

<style scoped>
.tile {
  position: relative;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  overflow: hidden;
  aspect-ratio: 16 / 9;
}
.tile video {
  width: 100%;
  height: 100%;
  display: block;
  /* A camera fills the tile; a screen share must not be cropped — losing the
     edges of someone's screen loses exactly the thing they're pointing at. */
  object-fit: cover;
}
.tile.screen video {
  object-fit: contain;
  background: #000;
}
/* Your own camera is a mirror, matching every other video-call product. A
   screen share is NOT mirrored — text would read backwards. */
.mirror {
  transform: scaleX(-1);
}
.tile-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--scrim);
  opacity: 0;
  transition: opacity 120ms;
}
.tile:hover .tile-foot,
.tile:focus-within .tile-foot {
  opacity: 1;
}
.who {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size);
}
.full {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 var(--space-1);
}
</style>
