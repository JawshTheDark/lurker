// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// CTCP (Client-To-Client Protocol) helpers — pure wire-format + display logic,
// kept out of ircConnection so the parsing/reply rules are unit-testable on
// their own. CTCP is the `\x01TYPE args\x01`-framed sub-protocol that rides
// PRIVMSG (requests) and NOTICE (replies); ACTION (/me) is the one CTCP type
// Lurker already handled as a normal message, the rest land here.
//
// References cloned for parity (see ~/Coding/irc-clients): irssi
// (src/irc/core/ctcp.c — the auto-reply set + PING flood guard), WeeChat
// (src/plugins/irc/irc-ctcp.c — CLIENTINFO/SOURCE/TIME templates), and The
// Lounge (server/plugins/irc-events/ctcp.ts — the same irc-framework
// `version:false` + manual-reply approach we use).

import { IRC_VERSION } from '../utils/userAgent.js';

/** Where Lurker's source lives — the CTCP SOURCE reply. */
export const CTCP_SOURCE = 'https://github.com/amiantos/lurker';

// The CTCP request types we auto-answer. CLIENTINFO advertises exactly this set
// (ACTION included — we send/receive it as messages even though it isn't a
// query). Keep in sync with buildCtcpReply's switch.
export const CTCP_SUPPORTED = [
  'ACTION',
  'CLIENTINFO',
  'PING',
  'SOURCE',
  'TIME',
  'VERSION',
] as const;

// irssi parity (ctcp.c): refuse to echo back an oversized PING payload so a peer
// can't turn our auto-reply into a reflection/flood amplifier.
const PING_MAX_PAYLOAD = 100;

// A sane CTCP PING round trip is well under an hour; anything outside [0, 1h] is
// clock skew or a payload that wasn't our timestamp, so we show the raw reply
// instead of a nonsense latency.
const PING_MAX_PLAUSIBLE_MS = 3_600_000;

/** Split a CTCP inner body (`"VERSION"` / `"PING 1719500000000"`) into an
 *  upper-cased type and the remaining argument string. */
export function parseCtcp(message: string): { type: string; args: string } {
  const trimmed = message.trim();
  const sp = trimmed.indexOf(' ');
  if (sp === -1) return { type: trimmed.toUpperCase(), args: '' };
  return { type: trimmed.slice(0, sp).toUpperCase(), args: trimmed.slice(sp + 1) };
}

/**
 * Build the auto-reply argument string for an inbound CTCP request, or null when
 * we don't answer this type. The returned value is the params AFTER the type;
 * the caller frames it as `ctcpResponse(nick, type, reply)`.
 */
export function buildCtcpReply(type: string, args: string, now: Date): string | null {
  switch (type.toUpperCase()) {
    case 'VERSION':
      return IRC_VERSION;
    case 'SOURCE':
      return CTCP_SOURCE;
    case 'CLIENTINFO':
      return CTCP_SUPPORTED.join(' ');
    case 'TIME':
      return formatCtcpTime(now);
    case 'PING':
      // Echo the payload verbatim (that's what makes round-trip timing work for
      // the requester), but drop an abusive one.
      if (args.length > PING_MAX_PAYLOAD) return null;
      return args;
    default:
      return null;
  }
}

/** Locale-free local-ish timestamp for a CTCP TIME reply (RFC-1123 / UTC). */
export function formatCtcpTime(now: Date): string {
  return now.toUTCString();
}

/**
 * Latency in ms for an inbound CTCP PING *reply*, derived from the echoed
 * payload (we send `PING <epoch-ms>`; a well-behaved peer echoes it back), or
 * null if the payload isn't our timestamp / the delta is implausible. The first
 * whitespace-token is used so a `sec usec` style payload degrades to "show raw"
 * rather than misreporting.
 */
export function pingReplyLatencyMs(payload: string, nowMs: number): number | null {
  const first = payload.trim().split(/\s+/)[0];
  const t = Number(first);
  if (!Number.isFinite(t) || first === '') return null;
  const ms = nowMs - t;
  if (ms < 0 || ms > PING_MAX_PLAUSIBLE_MS) return null;
  return ms;
}

/** Render a latency as seconds with 3 decimals ("0.123s"), like irssi/WeeChat. */
export function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

/** Display line for an inbound CTCP *reply* (someone answered our query).
 *  `nowMs` lets PING report a round-trip latency from the echoed timestamp. */
export function formatCtcpReplyLine(
  nick: string,
  type: string,
  args: string,
  nowMs: number,
): string {
  const t = type.toUpperCase();
  if (t === 'PING') {
    const ms = pingReplyLatencyMs(args, nowMs);
    if (ms != null) return `CTCP PING reply from ${nick}: ${formatLatency(ms)}`;
  }
  const tail = args ? `: ${args}` : '';
  return `CTCP ${t} reply from ${nick}${tail}`;
}

/** Display line for an inbound CTCP *request* (someone probed us). */
export function formatCtcpRequestLine(nick: string, type: string, answered: boolean): string {
  const suffix = answered ? '' : ' (no reply)';
  return `${nick} requested CTCP ${type.toUpperCase()}${suffix}`;
}
