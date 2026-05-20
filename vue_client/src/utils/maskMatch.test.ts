// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import { matchesAny, compileMask } from './maskMatch.js';

describe('plain-nick masks', () => {
  it('matches case-insensitively', () => {
    expect(matchesAny(['bozo'], 'Bozo', null)).toBe(true);
    expect(matchesAny(['Bozo'], 'BOZO', null)).toBe(true);
  });

  it('does not match a different nick', () => {
    expect(matchesAny(['bozo'], 'clown', null)).toBe(false);
  });

  it('ignores userhost on plain-nick masks', () => {
    // A plain-nick mask must fire even when no userhost is known and must
    // not require a userhost to match.
    expect(matchesAny(['bozo'], 'bozo', null)).toBe(true);
    expect(matchesAny(['bozo'], 'bozo', 'bozo!u@h')).toBe(true);
  });
});

describe('hostmask masks', () => {
  it('matches *!user@host against a full userhost', () => {
    expect(matchesAny(['*!isaac@user/isaac'], 'AnyNick', 'AnyNick!isaac@user/isaac')).toBe(true);
  });

  it('respects user/host case sensitivity', () => {
    // user/host are case-sensitive (RFC convention); nick segment is not.
    expect(matchesAny(['*!isaac@user/isaac'], 'AnyNick', 'AnyNick!Isaac@user/isaac')).toBe(false);
    expect(matchesAny(['BOB!isaac@host'], 'bob', 'bob!isaac@host')).toBe(true);
  });

  it('honors * wildcards across segments', () => {
    expect(matchesAny(['nick!*@*'], 'nick', 'nick!alice@somewhere')).toBe(true);
    expect(matchesAny(['*!*@*.example.com'], 'anyone', 'anyone!user@host.example.com')).toBe(true);
    expect(matchesAny(['*!*@*.example.com'], 'anyone', 'anyone!user@elsewhere.net')).toBe(false);
  });

  it('honors ? for a single character', () => {
    expect(matchesAny(['n?ck!*@*'], 'nick', 'nick!u@h')).toBe(true);
    expect(matchesAny(['n?ck!*@*'], 'nicck', 'nicck!u@h')).toBe(false);
  });

  it('matches against null userhost only when both user and host are *', () => {
    // Pre-upgrade backlog rows have no userhost. A fully-wildcarded mask
    // (effectively a nick mask) still matches; a constrained mask does not.
    expect(matchesAny(['nick!*@*'], 'nick', null)).toBe(true);
    expect(matchesAny(['nick!user@*'], 'nick', null)).toBe(false);
    expect(matchesAny(['*!*@host'], 'nick', null)).toBe(false);
  });

  it('handles partial forms gracefully', () => {
    // user@host (no nick segment) → nick='*'
    expect(matchesAny(['isaac@user/isaac'], 'anyone', 'anyone!isaac@user/isaac')).toBe(true);
    // nick! (no user/host) → user='*', host='*'
    expect(matchesAny(['nick!'], 'nick', 'nick!u@h')).toBe(true);
  });
});

describe('matchesAny edge cases', () => {
  it('returns false for empty list / empty nick', () => {
    expect(matchesAny([], 'nick', null)).toBe(false);
    expect(matchesAny(['nick'], '', null)).toBe(false);
    expect(matchesAny(['nick'], null, null)).toBe(false);
  });

  it('accepts both string and {mask} entry shapes', () => {
    expect(matchesAny([{ mask: 'bozo' }], 'bozo', null)).toBe(true);
    expect(matchesAny([{ mask: '*!u@h' }], 'nick', 'nick!u@h')).toBe(true);
  });

  it('returns on first match without scanning the rest', () => {
    // Functional: many masks but only one matches.
    const masks = ['alpha', 'beta', 'gamma', 'bozo', 'delta'];
    expect(matchesAny(masks, 'bozo', null)).toBe(true);
  });
});

describe('compileMask', () => {
  it('classifies plain vs host entries', () => {
    expect(compileMask('bozo').kind).toBe('nick');
    expect(compileMask('bozo!*@*').kind).toBe('host');
    expect(compileMask('*@host').kind).toBe('host');
  });
});
