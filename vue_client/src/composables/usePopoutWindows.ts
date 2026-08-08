// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// "Pop out" a buffer into its own OS window, and tile the ones that are open.
//
// Why the pop-out itself is cheap: a browser window is its own JS context, so it
// gets its own Pinia store and its own `networks.activeKey`. views/BufferWindow
// activates its buffer on mount and the existing conversation components resolve
// to it unchanged — no buffer-prop refactor anywhere.
//
// Windows are addressed by bufferId, matching router.ts's `/buffer/:id`
// convention: one window per buffer, so the id doubles as the identity on the
// wire and the DOM window name needs no sanitising.
//
// ⚠ TILING USES BOTH ROUTES ON PURPOSE, and measures the result. Whether a
// browser honours a given move is not knowable up front:
//   • opener-driven `handle.moveTo()` works only for windows THIS document
//     opened, and those handles die on every reload of the opener;
//   • a pop-out moving ITSELF (told where to go over a BroadcastChannel)
//     survives opener reloads and covers windows opened in a previous session.
// Chromium's rules for which is permitted vary, and BOTH fail SILENTLY when
// refused. So we issue both, wait, and verify against the position the pop-out
// reports for itself, reporting honestly when we come up short.
//
// Orphans (live pop-outs this document never opened) are re-adopted by NAME:
// `window.open('', name)` returns the existing named window without navigating
// it. The channel doubles as the liveness registry behind the indicator.

import { computed, ref } from 'vue';

const CHANNEL = 'lurker:popouts';
/** How long to wait for pop-outs to answer a census before tiling what replied. */
const CENSUS_MS = 300;
/** Cap on the multi-screen probe — see the warning in tileArea(). */
const SCREEN_DETAILS_MS = 1500;
/** Grace for moves + acks to land before measuring — see phase 2 of tilePopouts. */
const PLACE_SETTLE_MS = 450;

type Msg =
  | { t: 'hello'; id: number }
  | { t: 'bye'; id: number }
  | { t: 'census' }
  | { t: 'here'; id: number }
  | { t: 'place'; id: number; rect: TileRect }
  | { t: 'placed'; id: number; x: number; y: number }
  | { t: 'focus'; id: number };

export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

let channel: BroadcastChannel | null = null;
/** This window's bufferId when it IS a pop-out; null in the opener. */
let selfId: number | null = null;

/** bufferIds of pop-outs that have announced themselves. */
const live = new Set<number>();
/** bufferId → where a pop-out reported it actually landed after a 'place'. */
const acks = new Map<number, { x: number; y: number }>();
const version = ref(0);
/** Handles for windows this context opened. */
const handles = new Map<number, Window>();

function windowNameFor(bufferId: number): string {
  return `lurker_b_${bufferId}`;
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
        live.add(m.id);
        version.value++;
        break;
      case 'bye':
        live.delete(m.id);
        version.value++;
        break;
      case 'census':
        // Only pop-outs answer; the opener has nothing to declare.
        if (selfId != null) post({ t: 'here', id: selfId });
        break;
      case 'place':
        if (selfId != null && m.id === selfId) {
          applyRect(m.rect);
          // Ack with where we ACTUALLY ended up. The opener can't measure this
          // itself: it reads a handle synchronously, but this message arrives
          // asynchronously, so a correct self-move still looks like a failure
          // from over there. Only the window itself knows the truth.
          post({ t: 'placed', id: selfId, x: window.screenX, y: window.screenY });
        }
        break;
      case 'placed':
        acks.set(m.id, { x: m.x, y: m.y });
        break;
      case 'focus':
        if (selfId != null && m.id === selfId) window.focus();
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
export function registerAsPopout(bufferId: number | null): () => void {
  if (bufferId == null) return () => {};
  selfId = bufferId;
  ensureChannel();
  post({ t: 'hello', id: bufferId });
  const bye = (): void => {
    if (selfId != null) post({ t: 'bye', id: selfId });
  };
  window.addEventListener('pagehide', bye);
  return () => {
    bye();
    window.removeEventListener('pagehide', bye);
    selfId = null;
  };
}

/** bufferIds currently popped out, per the live registry. */
export const poppedOut = computed<ReadonlySet<number>>(() => {
  void version.value;
  return new Set(live);
});

export function isPoppedOut(bufferId: number | null): boolean {
  return bufferId != null && poppedOut.value.has(bufferId);
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
export function popOutBuffer(bufferId: number): Window | null {
  const existing = handles.get(bufferId);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }
  // Already open from a previous session (no handle here): ask it to focus
  // itself rather than re-opening.
  if (poppedOut.value.has(bufferId)) {
    post({ t: 'focus', id: bufferId });
    // Non-null so the caller doesn't report a blocked popup: nothing failed.
    return window;
  }

  // Explicit width/height (plus popup=yes) is what makes Chromium open a WINDOW
  // rather than a tab — and a popup window is one the script may move/resize.
  const win = window.open(
    `/popout/${bufferId}`,
    windowNameFor(bufferId),
    'popup=yes,width=520,height=760',
  );
  if (!win) return null;
  handles.set(bufferId, win);
  version.value++;
  return win;
}

export function closePopout(bufferId: number): void {
  const win = handles.get(bufferId);
  if (win && !win.closed) win.close();
  handles.delete(bufferId);
  version.value++;
}

/**
 * The rectangle to tile into.
 *
 * getScreenDetails() (Window Management API, Chromium) is consulted ONLY to
 * learn about a multi-monitor setup, and prompts for permission the first time.
 * Where it's unavailable or denied we fall back to `window.screen.avail*`, which
 * still tiles correctly on the current display. So tiling degrades to "this
 * monitor", not to "doesn't work".
 */
async function tileArea(): Promise<TileRect> {
  const api = window as unknown as {
    getScreenDetails?: () => Promise<{ currentScreen: Record<string, number> }>;
  };
  if (typeof api.getScreenDetails === 'function') {
    try {
      // ⚠ MUST be time-boxed. This call raises a permission prompt, and a prompt
      // the user never answers leaves the promise pending FOREVER — which took
      // the whole tile action down with it: no placement, no error, no toast.
      // Multi-screen awareness is a nice-to-have; never let it block tiling.
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

export interface TileResult {
  /** Pop-outs we know about (census answers ∪ handles we hold). */
  total: number;
  /** How many we could get a live window handle to. */
  handled: number;
  /** How many verifiably ended up where we put them. */
  moved: number;
  /** First thing that went wrong, for the toast. */
  sample: string;
}

/**
 * Arrange every live pop-out into a near-square grid: 2 split side-by-side,
 * 3–4 make a 2×2, and so on.
 */
export async function tilePopouts(): Promise<TileResult> {
  // Re-census first: this is what makes tiling work on pop-outs this document
  // never opened (e.g. opened before the opener last reloaded).
  live.clear();
  version.value++;
  post({ t: 'census' });
  const area = await tileArea();
  await new Promise((r) => setTimeout(r, CENSUS_MS));

  const ids = [...new Set([...live, ...handles.keys()])].sort((a, b) => a - b);
  if (ids.length === 0) return { total: 0, handled: 0, moved: 0, sample: '' };

  let handled = 0;
  let sample = '';
  acks.clear();

  const cols = Math.ceil(Math.sqrt(ids.length));
  const rows = Math.ceil(ids.length / cols);
  const w = Math.floor(area.width / cols);
  const h = Math.floor(area.height / rows);
  const rects = new Map<number, TileRect>();

  // ── Phase 1: ask, both ways ──────────────────────────────────────────────
  // Which route a given browser honours isn't knowable up front, so issue both
  // and let the verification below say what actually happened.
  ids.forEach((id, i) => {
    const rect: TileRect = {
      left: area.left + (i % cols) * w,
      top: area.top + Math.floor(i / cols) * h,
      width: w,
      height: h,
    };
    rects.set(id, rect);

    // Broadcast first so the pop-out's own move is already in flight while we
    // try the opener-driven one.
    if (live.has(id)) post({ t: 'place', id, rect });

    let win = handles.get(id);
    if ((!win || win.closed) && live.has(id)) {
      // Orphan: re-acquire by name. window.open with an EMPTY url returns the
      // existing window with that name without navigating or reloading it —
      // safe because the census just proved a window with this id is live.
      const reacquired = window.open('', windowNameFor(id));
      if (reacquired && !reacquired.closed) {
        handles.set(id, reacquired);
        win = reacquired;
      }
    }
    if (win && !win.closed) {
      handled++;
      try {
        win.moveTo(Math.round(rect.left), Math.round(rect.top));
        win.resizeTo(Math.round(rect.width), Math.round(rect.height));
      } catch (e) {
        if (!sample) sample = e instanceof Error ? e.message : String(e);
      }
    }
  });

  // ── Phase 2: let it land, THEN measure ───────────────────────────────────
  // ⚠ Reading positions back synchronously (right after moveTo, before any
  // broadcast could arrive) made a pop-out that placed itself perfectly measure
  // as a failure. Wait for both routes to settle first.
  await new Promise((r) => setTimeout(r, PLACE_SETTLE_MS));

  let moved = 0;
  for (const id of ids) {
    const rect = rects.get(id)!;
    // Prefer the pop-out's own ack — the only observer a stale handle can't fool.
    const ack = acks.get(id);
    const win = handles.get(id);
    const pos = ack ?? (win && !win.closed ? { x: win.screenX, y: win.screenY } : null);
    if (!pos) continue;
    // Tolerance covers window chrome and the browser clamping to a minimum size
    // or onto the work area.
    const near =
      Math.abs(pos.x - Math.round(rect.left)) <= 60 && Math.abs(pos.y - Math.round(rect.top)) <= 60;
    if (near) moved++;
    else if (!sample) {
      sample = `wanted ${Math.round(rect.left)},${Math.round(rect.top)} · got ${pos.x},${pos.y}`;
    }
  }

  version.value++;
  return { total: ids.length, handled, moved, sample };
}
