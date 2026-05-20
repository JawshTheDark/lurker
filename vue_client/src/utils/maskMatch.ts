// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Client-side ignore matching. Two flavors:
//
//   - "plain nick" entry — no '!' or '@' — matches the sender's nick
//     case-insensitively. Equivalent to /ignore bozo on IRCCloud.
//
//   - "hostmask" entry — contains '!' or '@' — interpreted as nick!user@host
//     with '*' wildcards (and '?' for single-char, mirroring IRC convention).
//     Missing parts default to '*' so /ignore @host or /ignore nick! still
//     resolve to a sensible three-part pattern. Nick segment is matched
//     case-insensitively; user and host are case-sensitive (RFC convention,
//     and the case the user typed is the case they meant).
//
// Compiled regexes are cached per mask string so we don't recompile on every
// render pass. The cache is keyed by raw mask, not by network — masks are
// short strings and the same one might appear on multiple networks.

interface NickMask {
  kind: 'nick';
  test(nick: string | null | undefined): boolean;
}

interface HostMask {
  kind: 'host';
  test(nick: string | null | undefined, userhost: string | null | undefined): boolean;
}

type CompiledMask = NickMask | HostMask;

const compiledCache = new Map<string, CompiledMask>();

function isHostmaskEntry(mask: string): boolean {
  return mask.includes('!') || mask.includes('@');
}

function splitMask(mask: string): { nick: string; user: string; host: string } {
  // Accept partial forms: 'nick', 'nick!user', 'user@host', 'nick!user@host'.
  // Normalize to a three-part tuple with '*' filling unspecified segments.
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
    // user@host form (no nick segment)
    user = pre || '*';
  } else {
    // bare token but no '@' / '!' — treat as nick (caller should've routed
    // this to the plain-nick path, but handle defensively).
    nick = pre || '*';
  }
  return { nick, user, host };
}

function globToRegex(pattern: string, { caseInsensitive }: { caseInsensitive: boolean }): RegExp {
  // Escape regex metas, then turn IRC glob wildcards back into regex.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$', caseInsensitive ? 'i' : '');
}

export function compileMask(mask: string): CompiledMask {
  const cached = compiledCache.get(mask);
  if (cached) return cached;

  let compiled: CompiledMask;
  if (!isHostmaskEntry(mask)) {
    const lower = mask.toLowerCase();
    compiled = {
      kind: 'nick',
      test(nick: string | null | undefined): boolean {
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
      test(nickArg: string | null | undefined, userhost: string | null | undefined): boolean {
        // Hostmask entries with a non-trivial host/user can't match anything
        // until we have a userhost. Pre-upgrade backlog rows have userhost=
        // null; those simply don't match, which matches IRCCloud behavior.
        if (!nickArg) return false;
        if (!nickRe.test(nickArg)) return false;
        // Parse userhost into user@host. Format from the server is
        // nick!user@host; if absent, only a fully-wildcarded mask can match.
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
  userhost: string | null | undefined,
): boolean {
  if (!masks || masks.length === 0 || !nick) return false;
  for (const mask of masks) {
    const m = typeof mask === 'string' ? mask : mask?.mask;
    if (!m) continue;
    if (compileMask(m).test(nick, userhost)) return true;
  }
  return false;
}
