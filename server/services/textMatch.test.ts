// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import { buildTextTest } from './textMatch.js';

describe('buildTextTest — substr', () => {
  it('matches case-insensitive substring by default', () => {
    const test = buildTextTest('word', 'substr', false)!;
    expect(test('a WORD here')).toBe(true);
    expect(test('keyword inside')).toBe(true); // substring, not whole-word
    expect(test('nothing')).toBe(false);
  });

  it('honors case sensitivity', () => {
    const test = buildTextTest('Word', 'substr', true)!;
    expect(test('a Word here')).toBe(true);
    expect(test('a word here')).toBe(false);
  });
});

describe('buildTextTest — plain/glob/regex parity', () => {
  it('plain is whole-word anchored', () => {
    const test = buildTextTest('user', 'plain', false)!;
    expect(test('hi user')).toBe(true);
    expect(test('username')).toBe(false);
  });

  it('glob translates wildcards with word boundaries', () => {
    const test = buildTextTest('ami*os', 'glob', false)!;
    expect(test('hey amiantos!')).toBe(true);
    expect(test('random')).toBe(false);
  });

  it('regex is raw and returns null on invalid', () => {
    expect(buildTextTest('^hi', 'regex', false)!('hi there')).toBe(true);
    expect(buildTextTest('(unclosed', 'regex', false)).toBeNull();
  });
});
