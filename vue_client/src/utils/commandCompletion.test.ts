// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import { buildCommandCandidates, isCommandToken } from './commandCompletion.js';

describe('buildCommandCandidates', () => {
  it('matches known commands by prefix, slash-prefixed and sorted', () => {
    const r = buildCommandCandidates('/j');
    expect(r).toContain('/join');
    expect(r).toContain('/jitsi');
    expect(r).toContain('/j'); // the built-in alias itself
    expect(r).toEqual([...r].sort());
  });

  it('is case-insensitive and includes user alias names', () => {
    const r = buildCommandCandidates('/GR', ['grab', 'grump']);
    expect(r).toEqual(['/grab', '/grump']);
  });

  it('empty prefix (just "/") returns everything', () => {
    expect(buildCommandCandidates('/').length).toBeGreaterThan(30);
  });

  it('no matches → empty', () => {
    expect(buildCommandCandidates('/zzzzz')).toEqual([]);
  });
});

describe('isCommandToken', () => {
  it('true for a leading /word at line start', () => {
    expect(isCommandToken('/joi', '/joi', 0)).toBe(true);
    expect(isCommandToken('  /joi', '/joi', 2)).toBe(true);
    expect(isCommandToken('line one\n/joi', '/joi', 9)).toBe(true);
  });

  it('false for // escape, mid-line, or a channel token', () => {
    expect(isCommandToken('//lit', '//lit', 0)).toBe(false);
    expect(isCommandToken('hey /joi', '/joi', 4)).toBe(false);
    expect(isCommandToken('#chan', '#chan', 0)).toBe(false);
  });
});
