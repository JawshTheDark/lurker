// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Slash-command alias resolution. Runs once at the top of handleCommand: a
// leading command word is looked up against the user's own aliases first, then
// the built-in mIRC-style shortcuts. A match expands to a full command line
// (still without the leading slash) which the dispatcher then parses as usual.
//
// Expansion supports mIRC-flavored parameters in the template:
//   $1 … $9   the Nth whitespace arg the user typed
//   $2-       the 2nd arg onward (joined with spaces)
//   $*        all args, verbatim
//   $me       your current nick        $chan   the current buffer's target
// If the template uses NO $-parameter, the user's args are appended — so a
// plain `j → join` turns `/j #x` into `join #x`. Resolution is single-pass (an
// expansion is NOT re-aliased) so aliases can never loop.

import { BUILTIN_ALIASES } from './catalog.js';

export interface AliasContext {
  /** Your current nick on the active network (for $me). */
  nick?: string;
  /** The active buffer's target — channel or DM nick (for $chan). */
  target?: string;
  /** User-defined aliases, keyed by lowercased name → expansion template. */
  userAliases?: Record<string, string>;
}

/** Substitute $-parameters in a template against the caller's arg line. */
export function expandTemplate(template: string, argLine: string, ctx: AliasContext = {}): string {
  const args = argLine.length ? argLine.split(/\s+/) : [];
  let usedParam = false;
  const out = template.replace(/\$(\*|me|chan|\d+-?)/gi, (_m, tokRaw: string) => {
    usedParam = true;
    const tok = tokRaw.toLowerCase();
    if (tok === '*') return argLine;
    if (tok === 'me') return ctx.nick ?? '';
    if (tok === 'chan') return ctx.target ?? '';
    if (tok.endsWith('-')) return args.slice(parseInt(tok, 10) - 1).join(' ');
    return args[parseInt(tok, 10) - 1] ?? '';
  });
  const expanded = out.trim();
  // No explicit params → append the original args (plain-shortcut behavior).
  if (!usedParam && argLine) return `${expanded} ${argLine}`.trim();
  return expanded;
}

/**
 * Resolve `verb` (the lowercased command word) to an expanded command line, or
 * null when it's not an alias. User aliases win over built-ins.
 */
export function resolveAlias(verb: string, argLine: string, ctx: AliasContext = {}): string | null {
  const key = verb.toLowerCase();
  const template = ctx.userAliases?.[key] ?? BUILTIN_ALIASES[key];
  if (template == null) return null;
  return expandTemplate(template, argLine, ctx);
}
