// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useNetworksStore } from '../stores/networks.js';
import { useBuffersStore } from '../stores/buffers.js';
import { FRIENDS_KEY, virtualConfig } from '../lib/virtualBuffers.js';

export interface ActiveBufferState {
  activeKey: Ref<string | null>;
  active: ComputedRef<{ networkId: number; target: string; network: unknown } | null>;
  activeBuf: ComputedRef<unknown>;
  topic: ComputedRef<string | undefined>;
  isServerBuffer: ComputedRef<boolean>;
  isChannel: ComputedRef<boolean>;
  bufferLabel: ComputedRef<string>;
  isSystemConsole: ComputedRef<boolean>;
  isVirtual: ComputedRef<boolean>;
  isFriendsBuffer: ComputedRef<boolean>;
}

export function useActiveBuffer(): ActiveBufferState {
  const networks = useNetworksStore();
  const buffers = useBuffersStore();
  const { activeKey } = storeToRefs(networks);

  const active = computed(() => networks.activeBuffer);
  const virtualCfg = computed(() => virtualConfig(activeKey.value));
  const isVirtual = computed(() => virtualCfg.value != null);
  const isSystemConsole = computed(() => virtualCfg.value?.renderMode === 'console');
  const isFriendsBuffer = computed(() => activeKey.value === FRIENDS_KEY);
  const activeBuf = computed(() => {
    if (!activeKey.value) return null;
    // Only 'buffer'-mode virtual buffers have a Buffer object in the store;
    // 'console' (system log) and 'overview' (friends) render their own bodies.
    if (virtualCfg.value && virtualCfg.value.renderMode !== 'buffer') return null;
    return buffers.byKey(activeKey.value);
  });
  const topic = computed(() => (activeBuf.value as any)?.topic);
  const isServerBuffer = computed(() => !!active.value?.target?.startsWith(':server:'));
  const isChannel = computed(() => !!active.value?.target?.startsWith('#'));
  const bufferLabel = computed(() => {
    if (virtualCfg.value) return virtualCfg.value.label;
    const t = active.value?.target;
    if (!t) return '';
    if (isServerBuffer.value) return (active.value?.network as any)?.name || 'server';
    return t;
  });

  return {
    activeKey,
    active,
    activeBuf,
    topic,
    isServerBuffer,
    isChannel,
    bufferLabel,
    isSystemConsole,
    isVirtual,
    isFriendsBuffer,
  };
}
