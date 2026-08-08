// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// "Pop out" a buffer into its own OS window, and tile the ones that are open.
//
// Why the pop-out itself is cheap: a browser window is its own JS context, so it
// gets its own Pinia store and its own `networks.activeKey`. views/BufferWindow
// activates its buffer on mount and the existing conversation components resolve
// to it unchanged — no buffer-prop refactor anywhere.
//
// ⚠ TILING IS NOT DONE WITH WINDOW HANDLES, and that's the whole design.
// The obvious version — keep the WindowProxy that `window.open` returned and
// call moveTo/resizeTo on it — only works for windows THIS document opened, and
// those handles die on every reload of the opener. Reload the main window and
// your existing pop-outs are still on screen but permanently untileable, so
// "Tile" silently moves whichever one happened to be opened most recently.
//
// Instead every pop-out MOVES ITSELF: the opener broadcasts a rectangle over a
// BroadcastChannel and each pop-out applies it to its own window. A window can
// always move/resize itself, so this survives opener reloads, works for windows
// opened in a previous session, and lets a pop-out spawned from another pop-out
// join in. The channel doubles as the liveness registry behind the indicator.

import { computed, ref } from 'vue';

const CHANNEL = 'lurker:popouts';
/** How long to wait for pop-outs to answer a census before tiling what replied. */
const CENSUS_MS = 300;
/** Cap on the multi-screen probe — see the warning in tileArea(). */
const SCREEN_DETAILS_MS = 1500;

type Msg =
  | { t: 'hello'; id: string; key: string }
  | { t: 'bye'; id: string }
  | { t: 'census' }
  | { t: 'here'; id: string; key: string }
  | { t: 'place'; id: string; rect: TileRect }
  | { t: 'focus'; key: string };

export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

let channel: BroadcastChannel | null = null;
/** Set in a pop-out window by registerAsPopout(); null in the opener. */
let selfId: string | null = null;
let selfKey: string | null = null;

/** id → buffer key, for every pop-out that has announced itself. */
const live = new Map<string, string>();
const version = ref(0);
/** Handles for windows this context opened — used ONLY to focus on re-click. */
const handles = new Map<string, Window>();

export function bufferPopoutKey(networkId: number | string, target: string): string {
  return `${networkId}::${target.toLowerCase()}`;
}

function windowNameFor(networkId: number | string, target: string): string {
  const safe = target.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `lurker_b_${networkId}_${safe}`;
}

function post(msg: Msg): void {
  ensureChannel()?.postMessage(msg);
}

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (ev: MessageEvent<Msg>) => {
    const m = ev.data;
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
      case 'here':
        live.set(m.id, m.key);
        version.value++;
        break;
      case 'bye':
        live.delete(m.id);
        version.value++;
        break;
      case 'census':
        // Only pop-outs answer; the opener has nothing to declare.
        if (selfId && selfKey) post({ t: 'here', id: selfId, key: selfKey });
        break;
      case 'place':
        if (selfId && m.id === selfId) applyRect(m.rect);
        break;
      case 'focus':
        if (selfKey && m.key === selfKey) window.focus();
        break;
    }
  };
  return channel;
}

function applyRect(r: TileRect): void {
  try {
    // Move before sizing: resizing while still on another display can get the
    // dimensions clamped to that display's bounds.
    window.moveTo(Math.round(r.left), Math.round(r.top));
    window.resizeTo(Math.round(r.width), Math.round(r.height));
  } catch {
    /* window no longer scriptable */
  }
}

/**
 * Called by views/BufferWindow.vue so this window joins the registry and will
 * answer census + place messages. Returns a disposer.
 */
export function registerAsPopout(key: string): () => void {
  selfId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  selfKey = key;
  ensureChannel();
  post({ t: 'hello', id: selfId, key });
  const bye = (): void => {
    if (selfId) post({ t: 'bye', id: selfId });
  };
  window.addEventListener('pagehide', bye);
  return () => {
    bye();
    window.removeEventListener('pagehide', bye);
    selfId = null;
    selfKey = null;
  };
}

/** Buffer keys currently popped out, per the live registry. */
export const poppedOut = computed<ReadonlySet<string>>(() => {
  void version.value;
  return new Set(live.values());
});

export function isPoppedOut(networkId: number | string, target: string): boolean {
  return poppedOut.value.has(bufferPopoutKey(networkId, target));
}

export const popoutCount = computed(() => {
  void version.value;
  return live.size;
});

/** Ask any already-open pop-outs to announce themselves — call once on mount so
 *  the indicator/Tile button are correct after the opener reloads. */
export function refreshPopoutRegistry(): void {
  live.clear();
  version.value++;
  post({ t: 'census' });
}

/**
 * Open (or focus) a pop-out for a buffer. MUST run inside a user gesture or the
 * popup blocker eats it; null means it was blocked, which callers surface —
 * a blocked popup is invisible by definition.
 */
export function popOutBuffer(networkId: number | string, target: string): Window | null {
  const key = bufferPopoutKey(networkId, target);
  const existing = handles.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }
  // Already open from a previous session (no handle here): ask it to focus
  // itself rather than re-opening. Window names make the open idempotent
  // anyway, but this avoids a pointless navigation.
  if (poppedOut.value.has(key)) {
    post({ t: 'focus', key });
    // Non-null so the caller doesn't report a blocked popup: nothing failed,
    // the window is already open and has been asked to raise itself.
    return window;
  }

  // encodeURIComponent: '#' is a fragment delimiter and would truncate the path.
  const url = `/b/${encodeURIComponent(String(networkId))}/${encodeURIComponent(target)}`;
  // Explicit width/height (plus popup=yes) is what makes Chromium open a WINDOW
  // rather than a tab — and a popup window is one the script may move/resize.
  const win = window.open(url, windowNameFor(networkId, target), 'popup=yes,width=520,height=760');
  if (!win) return null;
  handles.set(key, win);
  version.value++;
  return win;
}

export function closePopout(networkId: number | string, target: string): void {
  const key = bufferPopoutKey(networkId, target);
  const win = handles.get(key);
  if (win && !win.closed) win.close();
  handles.delete(key);
  version.value++;
}

/**
 * The rectangle to tile into.
 *
 * getScreenDetails() (Window Management API, Chromium) is consulted ONLY to
 * learn about a multi-monitor setup, and prompts for permission the first time.
 * Where it's unavailable or denied we fall back to `window.screen.avail*`, which
 * still tiles correctly on the current display — self-moves need no permission.
 * So tiling degrades to "this monitor", not to "doesn't work".
 */
async function tileArea(): Promise<TileRect> {
  const api = window as unknown as {
    getScreenDetails?: () => Promise<{ currentScreen: Record<string, number> }>;
  };
  if (typeof api.getScreenDetails === 'function') {
    try {
      // ⚠ MUST be time-boxed. This call raises a permission prompt, and a prompt
      // the user never answers (or that the browser declines to settle) leaves
      // the promise pending FOREVER — which took the whole tile action down with
      // it: no placement, no error, no toast, a dead-looking button. Multi-screen
      // awareness is a nice-to-have; never let it block tiling.
      const s = (
        await Promise.race([
          api.getScreenDetails(),
          new Promise<null>((r) => setTimeout(() => r(null), SCREEN_DETAILS_MS)),
        ])
      )?.currentScreen;
      if (s) {
        return {
          left: s.availLeft ?? s.left ?? 0,
          top: s.availTop ?? s.top ?? 0,
          width: s.availWidth ?? s.width ?? window.screen.availWidth,
          height: s.availHeight ?? s.height ?? window.screen.availHeight,
        };
      }
    } catch {
      /* denied/unsupported — single-screen path below */
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
 * Arrange every live pop-out into a near-square grid: 2 split side-by-side,
 * 3–4 make a 2×2, and so on. Returns how many were placed — 0 means none
 * answered, which the caller reports rather than looking like a dead button.
 */
export async function tilePopouts(): Promise<number> {
  // Re-census first: this is what makes tiling work on pop-outs this document
  // never opened (e.g. opened before the opener last reloaded).
  live.clear();
  version.value++;
  post({ t: 'census' });
  const area = await tileArea();
  await new Promise((r) => setTimeout(r, CENSUS_MS));

  // Slot by BUFFER KEY, not by broadcast id: it's the one identifier both the
  // opener and the pop-out know, so the direct and broadcast paths below agree
  // on which window belongs in which cell and can safely both fire.
  const keys = [...new Set([...live.values(), ...handles.keys()])].sort();
  if (keys.length === 0) return 0;

  const idByKey = new Map<string, string>();
  for (const [id, key] of live) idByKey.set(key, id);

  const cols = Math.ceil(Math.sqrt(keys.length));
  const rows = Math.ceil(keys.length / cols);
  const w = Math.floor(area.width / cols);
  const h = Math.floor(area.height / rows);

  keys.forEach((key, i) => {
    const rect: TileRect = {
      left: area.left + (i % cols) * w,
      top: area.top + Math.floor(i / cols) * h,
      width: w,
      height: h,
    };

    // 1. Opener-driven move — the path that actually works. Chromium honours
    //    moveTo/resizeTo from the document that OPENED a popup, but quietly
    //    ignores a popup moving itself, so this has to be the primary route.
    let win = handles.get(key);
    if ((!win || win.closed) && idByKey.has(key)) {
      // Orphan (opened before this document loaded, so we hold no handle).
      // Re-acquire it by name: window.open with an EMPTY url returns the
      // existing window with that name without navigating or reloading it.
      // Safe because the census just proved a window with this key is live.
      const [netPart] = key.split('::');
      const target = key.slice(netPart.length + 2);
      const reacquired = window.open('', windowNameFor(netPart, target));
      if (reacquired && !reacquired.closed) {
        handles.set(key, reacquired);
        win = reacquired;
      }
    }
    if (win && !win.closed) {
      try {
        win.moveTo(Math.round(rect.left), Math.round(rect.top));
        win.resizeTo(Math.round(rect.width), Math.round(rect.height));
      } catch {
        /* fall through to the broadcast below */
      }
    }

    // 2. Broadcast as backstop, for anything we still couldn't get a handle to.
    //    Same rect, so a window that honours both ends up in the same cell.
    const id = idByKey.get(key);
    if (id) post({ t: 'place', id, rect });
  });

  version.value++;
  return keys.length;
}
