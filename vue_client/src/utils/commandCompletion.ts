// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Command tab-completion candidates. When the token under the cursor is a
// leading `/word` at the start of a line, Tab completes it against the known
// command names, the built-in aliases, and the user's own alias names. Pure +
// unit-tested, mirroring channelCompletion / nickCompletion.

import { KNOWN_COMMANDS, BUILTIN_ALIASES } from '../lib/commands/catalog.js';

/**
 * Candidates for a `/prefix` token, each returned WITH a leading slash so it can
 * replace the token directly. Case-insensitive prefix match, sorted + unique.
 * `userAliasNames` are the user's custom alias names (without slash).
 */
export function buildCommandCandidates(token: string, userAliasNames: string[] = []): string[] {
  const stripped = token.replace(/^\/+/, '').toLowerCase();
  const names = new Set<string>([
    ...KNOWN_COMMANDS,
    ...Object.keys(BUILTIN_ALIASES),
    ...userAliasNames.map((n) => n.toLowerCase()),
  ]);
  return [...names]
    .filter((n) => n.startsWith(stripped))
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `/${n}`);
}

/** Whether `token` at position `start` in `value` is a command token (a leading
 *  `/word`, not `//escape`, at the start of a logical line). */
export function isCommandToken(value: string, token: string, start: number): boolean {
  if (!token.startsWith('/') || token.startsWith('//')) return false;
  return /(^|\n)\s*$/.test(value.slice(0, start));
}
