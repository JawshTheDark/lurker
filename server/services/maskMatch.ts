// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Server-side ignore matching. Mirrors vue_client/src/utils/maskMatch.js;
// kept in sync by hand because the client is the source of truth for the
// rendering filter and this server copy exists only to gate web-push
// dispatch (the one place a server-blind client filter wouldn't help: push
// fires while no client is open). Any matcher change must land in both
// files — the test data in vue_client/src/utils tests both shapes.

type CompiledMask =
  | { kind: 'nick'; test: (nick: string) => boolean }
  | { kind: 'host'; test: (nick: string, userhost?: string | null) => boolean };

const compiledCache = new Map<string, CompiledMask>();

function isHostmaskEntry(mask: string): boolean {
  return mask.includes('!') || mask.includes('@');
}

function splitMask(mask: string): { nick: string; user: string; host: string } {
  let nick = '*';
  let user = '*';
  let host = '*';
  const atIdx = mask.indexOf('@');
  let pre = mask;
  if (atIdx !== -1) {
    pre = mask.slice(0, atIdx);
    host = mask.slice(atIdx + 1) || '*';
  }
  const bangIdx = pre.indexOf('!');
  if (bangIdx !== -1) {
    nick = pre.slice(0, bangIdx) || '*';
    user = pre.slice(bangIdx + 1) || '*';
  } else if (atIdx !== -1) {
    user = pre || '*';
  } else {
    nick = pre || '*';
  }
  return { nick, user, host };
}

function globToRegex(pattern: string, { caseInsensitive }: { caseInsensitive: boolean }): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$', caseInsensitive ? 'i' : '');
}

function compileMask(mask: string): CompiledMask {
  const cached = compiledCache.get(mask);
  if (cached) return cached;

  let compiled: CompiledMask;
  if (!isHostmaskEntry(mask)) {
    const lower = mask.toLowerCase();
    compiled = {
      kind: 'nick',
      test(nick: string) {
        if (!nick) return false;
        return nick.toLowerCase() === lower;
      },
    };
  } else {
    const { nick, user, host } = splitMask(mask);
    const nickRe = globToRegex(nick, { caseInsensitive: true });
    const userRe = globToRegex(user, { caseInsensitive: false });
    const hostRe = globToRegex(host, { caseInsensitive: false });
    compiled = {
      kind: 'host',
      test(nickArg: string, userhost?: string | null) {
        if (!nickArg) return false;
        if (!nickRe.test(nickArg)) return false;
        if (!userhost) {
          return user === '*' && host === '*';
        }
        const bang = userhost.indexOf('!');
        const at = userhost.indexOf('@', bang + 1);
        if (bang === -1 || at === -1) {
          return user === '*' && host === '*';
        }
        const u = userhost.slice(bang + 1, at);
        const h = userhost.slice(at + 1);
        return userRe.test(u) && hostRe.test(h);
      },
    };
  }
  compiledCache.set(mask, compiled);
  return compiled;
}

type MaskEntry = string | { mask?: string };

export function matchesAny(
  masks: MaskEntry[] | null | undefined,
  nick: string | null | undefined,
  userhost?: string | null,
): boolean {
  if (!masks || masks.length === 0 || !nick) return false;
  for (const mask of masks) {
    const m = typeof mask === 'string' ? mask : mask?.mask;
    if (!m) continue;
    if (compileMask(m).test(nick, userhost)) return true;
  }
  return false;
}
