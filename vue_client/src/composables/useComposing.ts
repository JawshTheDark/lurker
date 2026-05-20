// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Cross-component state for what the user is currently composing. Lives in a
// module-level reactive ref so MessageInput (the writer) and StatusBar (the
// reader) can stay decoupled — no provide/inject, no Pinia store, no prop
// drilling. There's only ever one input field on screen at a time, so a
// singleton is the right shape.
//
// `chunks` is the estimated number of IRC PRIVMSGs the current text would
// produce on the wire. 0 = empty, 1 = single line, ≥2 = the SPLIT/FLOOD
// indicator should appear. `isAction` flips when the user has typed /me so
// downstream code can pick the tighter ACTION byte budget if it wants.

import { reactive, readonly } from 'vue';

export interface ComposingState {
  chunks: number;
  isAction: boolean;
}

const state = reactive<ComposingState>({
  chunks: 0,
  isAction: false,
});

export function setComposingState({ chunks, isAction }: ComposingState): void {
  state.chunks = chunks;
  state.isAction = isAction;
}

export function useComposing(): Readonly<ComposingState> {
  return readonly(state);
}
