// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: Elastic-2.0

// Drives in-client notifications: a toast in the corner and an optional sound.
// Called from useSocket whenever an IRC message arrives. The event carries
// independent content signals (matched, dm, notifyAlways) set by the server;
// each signal type has its own master `enabled` toggle and sound sub-toggle in
// settings, so toast/sound delivery is fully decoupled from how the signal
// was generated. Settings are read live so quick-toggles take effect at once.

import { useToastsStore } from '../stores/toasts.js';
import { useSettingsStore } from '../stores/settings.js';
import { useNetworksStore } from '../stores/networks.js';
import { useIgnoresStore } from '../stores/ignores.js';

// Cached templates, one per sound choice. Used purely to preload the file
// once per choice; we never play the template itself. Each actual play
// clones the template (see playSound) so it gets its own state machine.
const audioTemplates = new Map();

function getTemplate(choice) {
  let el = audioTemplates.get(choice);
  if (!el) {
    el = new Audio(`/sounds/${choice}.mp3`);
    el.preload = 'auto';
    audioTemplates.set(choice, el);
  }
  return el;
}

// Signal kind in priority order: DM > matched > always-notify. A DM that
// also happens to match a highlight rule is treated as a DM (single
// notification, gated by the DM master toggle), so users don't get
// double-fired or surprised by the wrong sound.
function pickKindKey(event) {
  if (event.dm) return 'dm';
  if (event.matched) return 'highlight';
  if (event.notifyAlways) return 'always_notify';
  return null;
}

export function notifyForEvent(event) {
  if (!event || event.self) return;
  const kindKey = pickKindKey(event);
  if (!kindKey) return;

  // Ignored sender → no toast, no sound. Push is gated server-side in
  // wsHub.maybePush since push fires while no client is open and a
  // client-side filter can't intercept it.
  const ignores = useIgnoresStore();
  if (event.nick && event.networkId
      && ignores.isIgnored(event.networkId, event.nick, event.userhost)) {
    return;
  }

  const settings = useSettingsStore();
  if (!settings.effective(`notifications.${kindKey}.enabled`)) return;

  const networks = useNetworksStore();
  const toasts = useToastsStore();

  const netName = networks.networkById(event.networkId)?.name || `net:${event.networkId}`;
  const where = event.target && !event.target.startsWith(':server:')
    ? `${netName} · ${event.target}`
    : netName;
  toasts.push({
    kind: kindKey,
    title: `${event.nick || '?'} in ${where}`,
    body: event.text || '',
    networkId: event.networkId,
    target: event.target,
    messageId: event.id,
  });

  if (settings.effective(`notifications.${kindKey}.sound.enabled`)) {
    playSound(
      settings.effective(`notifications.${kindKey}.sound.choice`) || 'ping',
      settings.effective(`notifications.${kindKey}.sound.volume`),
    );
  }
}

export function playSound(choice, volume) {
  // Clone the cached template so each notification gets its own audio
  // element. A shared element silently drops rapid-fire plays: setting
  // currentTime mid-play aborts the in-flight play() promise, and the
  // element's state machine races subsequent calls. cloneNode reuses the
  // browser's cached audio bytes but produces an independent state.
  const el = getTemplate(choice || 'ping').cloneNode();
  el.volume = Math.max(0, Math.min(1, (Number(volume) || 0) / 100));
  const p = el.play();
  // Pre-user-gesture autoplay is blocked by the browser; swallow that one
  // case quietly. Real failures (decode errors etc.) will still surface in
  // the devtools console because the promise itself logs an unhandled
  // rejection if we don't catch — keeping the catch keeps the console
  // clean during the very common pre-gesture replay.
  if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay blocked */ });
}
