// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Tells the server which buffer this tab currently has focused, so the server
// can route "show in active"-style events (notice.msgbuffer='active') to the
// window you're looking at. Mirrors usePresence: a single wired watcher that
// fires on every focus change and re-reports on each fresh socket open (the
// server forgets per-connection state when a socket closes).
//
// The frame is advisory and fire-and-forget. A network buffer sends its
// networkId + target; a virtual buffer (:system:/:friends:) sends target with a
// null networkId, which the server stores as "no network buffer focused" so a
// stale channel never keeps winning after you switch away.

import { watch } from 'vue';
import { socketSend, onSocketOpen } from './useSocket.js';
import { useNetworksStore } from '../stores/networks.js';

let wired = false;

// Parse a networks.activeKey ("<networkId>::<target>" or a flat ":system:"
// sentinel) into the frame payload, or null when nothing is focused.
function frameFor(activeKey: string | null): { networkId: number | null; target: string } | null {
  if (!activeKey) return null;
  const sep = activeKey.indexOf('::');
  if (sep === -1) return { networkId: null, target: activeKey }; // virtual buffer
  const networkId = Number(activeKey.slice(0, sep));
  const target = activeKey.slice(sep + 2);
  if (!Number.isInteger(networkId) || !target) return null;
  return { networkId, target };
}

export function startActiveBufferReporter(): void {
  if (wired) return;
  wired = true;
  const networks = useNetworksStore();
  const report = (): void => {
    const f = frameFor(networks.activeKey);
    if (!f) return;
    socketSend({ type: 'active-buffer', networkId: f.networkId, target: f.target });
  };
  watch(() => networks.activeKey, report);
  onSocketOpen(report); // seed on connect + re-seed on every reconnect
}
