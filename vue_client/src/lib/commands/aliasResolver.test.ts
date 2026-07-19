// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import { resolveAlias, expandTemplate } from './aliasResolver.js';

describe('expandTemplate', () => {
  it('appends args when the template has no $-params', () => {
    expect(expandTemplate('join', '#chan')).toBe('join #chan');
    expect(expandTemplate('join', '')).toBe('join');
  });

  it('substitutes positional $1..$9', () => {
    expect(expandTemplate('mode $chan +o $1', 'alice', { target: '#room' })).toBe(
      'mode #room +o alice',
    );
    expect(expandTemplate('kick $1 $2', 'bob spammer')).toBe('kick bob spammer');
  });

  it('$N- takes the Nth arg onward; $* is all args verbatim', () => {
    expect(expandTemplate('kick $1 :$2-', 'bob go away now')).toBe('kick bob :go away now');
    expect(expandTemplate('say $*', 'hello   world')).toBe('say hello   world');
  });

  it('$me and $chan resolve from context', () => {
    expect(expandTemplate('msg $chan $me is here', 'x', { nick: 'jawsh', target: '#c' })).toBe(
      'msg #c jawsh is here',
    );
  });

  it('a used-param template does NOT also append args', () => {
    expect(expandTemplate('msg NickServ identify $1', 'secret extra')).toBe(
      'msg NickServ identify secret',
    );
  });
});

describe('resolveAlias', () => {
  it('resolves built-in shortcuts', () => {
    expect(resolveAlias('j', '#chan')).toBe('join #chan');
    expect(resolveAlias('q', 'bob')).toBe('query bob');
    expect(resolveAlias('wii', 'bob')).toBe('whois bob');
    expect(resolveAlias('ms', 'send memo')).toBe('msg MemoServ send memo');
  });

  it('returns null for a non-alias verb', () => {
    expect(resolveAlias('join', '#chan')).toBeNull();
    expect(resolveAlias('nope', '')).toBeNull();
  });

  it('user aliases override built-ins and are case-insensitive', () => {
    const ctx = { userAliases: { j: 'jump', op: 'mode $chan +o $1' }, target: '#r' };
    expect(resolveAlias('J', 'high', ctx)).toBe('jump high');
    expect(resolveAlias('op', 'bob', ctx)).toBe('mode #r +o bob');
  });

  it('is single-pass (an alias expanding to another alias is not re-resolved)', () => {
    // resolveAlias returns the expansion; the caller does not feed it back in.
    const ctx = { userAliases: { a: 'j #x' } };
    expect(resolveAlias('a', '', ctx)).toBe('j #x'); // stays "j", not "join"
  });
});
