// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

export interface LongPressCoords {
  clientX: number;
  clientY: number;
}

export interface LongPressOptions {
  delay?: number;
  moveTolerance?: number;
}

export interface LongPressHandlers {
  onTouchstart(e: TouchEvent): void;
  onTouchmove(e: TouchEvent): void;
  onTouchend(): void;
  onTouchcancel(): void;
  onClickCapture(e: MouseEvent): void;
  onContextmenuCapture(e: MouseEvent): void;
}

export interface LongPressAPI {
  bind<T>(
    callback: (coords: LongPressCoords, payload: T | undefined) => void,
    payload?: T,
  ): LongPressHandlers;
  cancel(): void;
}

// Generic touch long-press primitive. Returns a `bind(callback, payload?)`
// factory that produces the four touch handlers a row element needs:
//   <div v-bind="longPress.bind((coords, payload) => ...)">.
// The callback receives `{ clientX, clientY }` from the original touch and
// the optional payload the caller passed to `bind`. After a successful
// long-press, the next synthetic `click` on the same target is suppressed
// (touchend → click sequence on mobile) so the row's tap handler doesn't
// also fire. A subsequent contextmenu on the same gesture (iOS Safari fires
// one after touchend) is also suppressed.

export function useLongPress({
  delay = 450,
  moveTolerance = 8,
}: LongPressOptions = {}): LongPressAPI {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let suppressNextClick = false;
  let suppressNextContextMenu = false;

  function cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function bind<T>(
    callback: (coords: LongPressCoords, payload: T | undefined) => void,
    payload?: T,
  ): LongPressHandlers {
    return {
      onTouchstart(e: TouchEvent) {
        if (!e.touches || e.touches.length !== 1) {
          cancel();
          return;
        }
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        cancel();
        timer = setTimeout(() => {
          timer = null;
          suppressNextClick = true;
          suppressNextContextMenu = true;
          callback({ clientX: startX, clientY: startY }, payload);
        }, delay);
      },
      onTouchmove(e: TouchEvent) {
        if (!timer || !e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (
          Math.abs(t.clientX - startX) > moveTolerance ||
          Math.abs(t.clientY - startY) > moveTolerance
        ) {
          cancel();
        }
      },
      onTouchend() {
        cancel();
      },
      onTouchcancel() {
        cancel();
      },
      onClickCapture(e: MouseEvent) {
        if (suppressNextClick) {
          suppressNextClick = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
      onContextmenuCapture(e: MouseEvent) {
        if (suppressNextContextMenu) {
          suppressNextContextMenu = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
    };
  }

  return { bind, cancel };
}
