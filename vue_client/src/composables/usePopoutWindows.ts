// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// "Pop out" a buffer into its own OS window, and tile the ones that are open.
//
// Why this is cheap: a browser window is its own JS context, so a pop-out gets
// its own Pinia store and its own `networks.activeKey`. views/BufferWindow.vue
// just activates its buffer on mount and the existing conversation components
// resolve to it unchanged — no buffer-prop refactor anywhere.
//
// Window NAMES are load-bearing. `window.open(url, name)` targets an existing
// window with that name instead of spawning a duplicate, and names outlive the
// opener: after the main window reloads (which drops the handles below) a
// re-click still finds and focuses the pop-out that's already on screen rather
// than opening a second copy of the same channel.

import { computed, ref } from 'vue';

/** Live handles for windows THIS context opened. Lost on reload — the window
 *  name is what makes re-opening idempotent, not this map. */
const handles = new Map<string, Window>();
// Bumped whenever the set changes so `poppedOut` recomputes; a Map isn't deeply
// reactive and a WindowProxy must not be wrapped in a Vue proxy anyway.
const version = ref(0);

export function bufferPopoutKey(networkId: number | string, target: string): string {
  return `${networkId}::${target.toLowerCase()}`;
}

/** A DOM window name for this buffer. Restricted to a conservative charset —
 *  a channel name can hold characters (`#`, `[`, `|`) that are legal in a name
 *  but make debugging and `window.open` feature strings needlessly fragile. */
function windowNameFor(networkId: number | string, target: string): string {
  const safe = target.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `lurker_b_${networkId}_${safe}`;
}

function prune(): void {
  let changed = false;
  for (const [key, win] of handles) {
    if (win.closed) {
      handles.delete(key);
      changed = true;
    }
  }
  if (changed) version.value++;
}

/** Keys of buffers currently popped out (best-effort: only windows this context
 *  opened and that are still open). Drives the sidebar/topic indicator. */
export const poppedOut = computed<ReadonlySet<string>>(() => {
  void version.value;
  const live = new Set<string>();
  for (const [key, win] of handles) if (!win.closed) live.add(key);
  return live;
});

export function isPoppedOut(networkId: number | string, target: string): boolean {
  return poppedOut.value.has(bufferPopoutKey(networkId, target));
}

/**
 * Open (or focus) a pop-out window for a buffer.
 *
 * MUST be called from a user gesture or the popup blocker eats it. Returns the
 * window, or null when it was blocked — callers surface that to the user rather
 * than failing silently, because a blocked popup is invisible by definition.
 */
export function popOutBuffer(networkId: number | string, target: string): Window | null {
  prune();
  const key = bufferPopoutKey(networkId, target);
  const existing = handles.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }

  // encodeURIComponent: '#' is a fragment delimiter and would truncate the path.
  const url = `/b/${encodeURIComponent(String(networkId))}/${encodeURIComponent(target)}`;
  // Explicit width/height (plus popup=yes) is what makes Chrome open a WINDOW
  // rather than a tab. Sized to a readable column; tile() resizes from here.
  const features = 'popup=yes,noopener=no,width=520,height=760';
  const win = window.open(url, windowNameFor(networkId, target), features);
  if (!win) return null;

  handles.set(key, win);
  version.value++;
  win.addEventListener?.('pagehide', () => {
    // Fires on close AND on navigation; prune() re-checks `closed`, so a
    // navigating window isn't dropped from the registry by mistake.
    setTimeout(prune, 0);
  });
  return win;
}

export function closePopout(networkId: number | string, target: string): void {
  const key = bufferPopoutKey(networkId, target);
  const win = handles.get(key);
  if (win && !win.closed) win.close();
  handles.delete(key);
  version.value++;
}

export interface TileArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The rectangle to tile into.
 *
 * `getScreenDetails()` (Window Management API, Chromium) is consulted ONLY to
 * learn about a multi-monitor setup; it prompts for permission the first time.
 * When it's unavailable or denied we fall back to `window.screen.avail*`, which
 * still tiles correctly on the current display — moveTo/resizeTo need no
 * permission for script-opened windows. So tiling degrades to "this monitor"
 * rather than to "doesn't work".
 */
async function tileArea(): Promise<TileArea> {
  const api = window as unknown as {
    getScreenDetails?: () => Promise<{ currentScreen: Record<string, number> }>;
  };
  if (typeof api.getScreenDetails === 'function') {
    try {
      const details = await api.getScreenDetails();
      const s = details.currentScreen;
      return {
        left: s.availLeft ?? s.left ?? 0,
        top: s.availTop ?? s.top ?? 0,
        width: s.availWidth ?? s.width ?? window.screen.availWidth,
        height: s.availHeight ?? s.height ?? window.screen.availHeight,
      };
    } catch {
      /* denied or unsupported — fall through to the single-screen path */
    }
  }
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    left: s.availLeft ?? 0,
    top: s.availTop ?? 0,
    width: s.availWidth,
    height: s.availHeight,
  };
}

/**
 * Arrange every open pop-out into a grid on the current screen.
 *
 * Near-square grid (cols = ceil(sqrt(n))) so 2 windows split side-by-side, 3–4
 * make a 2×2, and so on. Returns how many were placed — 0 means nothing was
 * open, which the caller reports instead of looking like a no-op button.
 */
export async function tilePopouts(): Promise<number> {
  prune();
  const wins = [...handles.values()].filter((w) => !w.closed);
  if (wins.length === 0) return 0;

  const area = await tileArea();
  const cols = Math.ceil(Math.sqrt(wins.length));
  const rows = Math.ceil(wins.length / cols);
  const w = Math.floor(area.width / cols);
  const h = Math.floor(area.height / rows);

  wins.forEach((win, i) => {
    const x = area.left + (i % cols) * w;
    const y = area.top + Math.floor(i / cols) * h;
    try {
      // Order matters: move first, then size. Resizing a window that is still
      // positioned on another display can get clamped to that display's bounds.
      win.moveTo(x, y);
      win.resizeTo(w, h);
    } catch {
      /* a window we no longer control (user moved it to another profile) */
    }
  });
  return wins.length;
}

/** Count of live pop-outs — for enabling/labelling the Tile action. */
export const popoutCount = computed(() => poppedOut.value.size);
