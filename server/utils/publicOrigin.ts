// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// The absolute origin (scheme + host) to put in a link this instance hands out.
//
// PUBLIC_BASE_URL wins: it is explicit, proxy-safe, and — unlike anything
// derived from the request — cannot be influenced by whoever is calling. The
// request-header fallback exists so a self-hoster who hasn't set it still gets
// working links, but it is exactly that: a fallback.
//
// ⚠ Anything built from `Host` / `X-Forwarded-Host` is CLIENT-CONTROLLED. For a
// capability URL (a voice guest link) that matters more than for a paste: the
// link is minted by an op and then sent to someone else, so a spoofed Host
// silently points the recipient at an attacker's origin while the token in the
// path stays valid. Hence the strict host charset below, and hence operators
// running anything link-generating should set PUBLIC_BASE_URL.
//
// (routes/uploads.ts grew its own copy of this first, for local-upload links.)

import type { Request } from 'express';

/** A forwarding header may be a list ("proto1, proto2"); take the first hop. */
function firstHeaderValue(v: unknown): string {
  return String(v ?? '')
    .split(',')[0]!
    .trim();
}

// hostname[:port] or [ipv6][:port] — reject anything carrying characters that
// could break out of the authority (slash, space, userinfo '@', …), so a
// spoofed header can never inject a path or scheme into the URL we build.
const HOST_RE = /^[A-Za-z0-9.\-:[\]]+$/;

function requestOrigin(req: Request): string {
  // Only http/https are valid; anything else (a spoofed "javascript:" or a
  // garbage X-Forwarded-Proto) is ignored so it can never reach the built URL.
  const rawProto = firstHeaderValue(req.headers['x-forwarded-proto']) || req.protocol;
  const proto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
  const rawHost = firstHeaderValue(req.headers['x-forwarded-host']) || req.get('host') || '';
  const host = HOST_RE.test(rawHost) ? rawHost : '';
  return host ? `${proto}://${host}` : '';
}

/**
 * The public origin for links this instance mints, without a trailing slash.
 * Returns '' when PUBLIC_BASE_URL is unset AND the request carries no usable
 * host — callers decide whether to emit a relative link or refuse.
 */
export function publicOrigin(req: Request): string {
  const configured = (process.env.PUBLIC_BASE_URL ?? '').trim();
  return (configured || requestOrigin(req)).replace(/\/+$/, '');
}
