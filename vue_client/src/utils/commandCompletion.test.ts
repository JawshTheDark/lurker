// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import {
  buildCommandCandidates,
  isCommandToken,
  buildSettingKeyCandidates,
  isSettingKeyArg,
} from './commandCompletion.js';

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

describe('isSettingKeyArg', () => {
  it('true only when the token follows /set or /get at line start', () => {
    expect(isSettingKeyArg('/set ')).toBe(true);
    expect(isSettingKeyArg('/get ')).toBe(true);
    expect(isSettingKeyArg('/SET ')).toBe(true);
    expect(isSettingKeyArg('/set foo ')).toBe(false); // second arg
    expect(isSettingKeyArg('/join ')).toBe(false);
    expect(isSettingKeyArg('hi /set ')).toBe(false);
  });
});

describe('buildSettingKeyCandidates', () => {
  it('lists real registry keys under a prefix like "chat."', () => {
    const r = buildSettingKeyCandidates('chat.');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.key.startsWith('chat.'))).toBe(true);
    expect(r[0]).toHaveProperty('label');
    expect(r[0]).toHaveProperty('type');
  });

  it('empty query returns EVERY setting (not just the first/largest category)', () => {
    const all = buildSettingKeyCandidates('');
    const prefixes = new Set(all.map((m) => m.key.split('.')[0]));
    // Must reach past look.* into the other top-level groups.
    expect(prefixes.has('look')).toBe(true);
    expect(prefixes.has('chat')).toBe(true);
    expect(prefixes.size).toBeGreaterThan(2);
    // Sorted alphabetically by key (same comparator the builder uses).
    const keys = all.map((m) => m.key);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  it('honors an explicit cap', () => {
    expect(buildSettingKeyCandidates('', 10)).toHaveLength(10);
  });

  it('falls back to substring matches when nothing starts with the query', () => {
    const r = buildSettingKeyCandidates('zzznotreal');
    expect(r).toEqual([]);
  });
});
