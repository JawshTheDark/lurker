// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import type { Ref } from 'vue';
import { ref } from 'vue';

// Bridges MessageList's scroll position into the StatusBar without a prop drill.
// MessageList writes via the setters; StatusBar reads the refs.
const stuckToBottom = ref(true);
const newBelow = ref(0);
const scrollToBottomToken = ref(0);

export interface ScrollState {
  stuckToBottom: Ref<boolean>;
  newBelow: Ref<number>;
  scrollToBottomToken: Ref<number>;
}

export function useScrollState(): ScrollState {
  return { stuckToBottom, newBelow, scrollToBottomToken };
}

export function setStuckToBottom(v: boolean): void {
  stuckToBottom.value = !!v;
  if (v) newBelow.value = 0;
}

export function bumpNewBelow(): void {
  if (!stuckToBottom.value) newBelow.value += 1;
}

export function resetScrollState(): void {
  stuckToBottom.value = true;
  newBelow.value = 0;
}

export function requestScrollToBottom(): void {
  scrollToBottomToken.value += 1;
}
