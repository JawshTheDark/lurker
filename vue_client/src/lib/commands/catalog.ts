// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// The canonical slash-command catalog: every command name Lurker recognises
// (including its existing aliases like /query, /hop, /net), plus a set of
// built-in mIRC-style short aliases that expand to a full command before
// dispatch. Powers command tab-completion and alias resolution — the two both
// need a single source of truth for "what commands exist".
//
// KNOWN_COMMANDS is used for completion only; it does not drive dispatch (the
// switch in MessageInput.handleCommand still owns that). Keep it in sync when
// adding a command — completion is the only thing that reads it.

// Built-in short aliases (mIRC/other-client muscle memory). Each expands to a
// command line; the resolver appends the caller's args when the template has no
// $-parameters. These are NEW shortcuts only — names that don't already have a
// case in handleCommand — so resolving them can never change existing behavior.
// A user-defined alias with the same name overrides the built-in.
export const BUILTIN_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  j: 'join',
  p: 'part',
  q: 'query',
  k: 'kick',
  kb: 'kickban',
  t: 'topic',
  n: 'names',
  wii: 'whois',
  ms: 'msg MemoServ',
  os: 'msg OperServ',
  bs: 'msg BotServ',
  hs: 'msg HostServ',
});

// Every recognised command name (canonical + existing aliases). Sorted + unique.
// Completion offers these; dispatch is unaffected.
export const KNOWN_COMMANDS: readonly string[] = Object.freeze(
  [
    // messaging / channel
    'me',
    'slap',
    'msg',
    'query',
    'notice',
    'ns',
    'cs',
    'join',
    'part',
    'leave',
    'close',
    'clear',
    'invite',
    'topic',
    'nick',
    'cycle',
    'hop',
    // moderation
    'kick',
    'kickban',
    'op',
    'deop',
    'voice',
    'devoice',
    'halfop',
    'dehalfop',
    'ban',
    'unban',
    'quiet',
    'unquiet',
    'mode',
    // presence / connection
    'away',
    'back',
    'quit',
    'reconnect',
    'nick',
    // info / queries
    'whois',
    'whowas',
    'who',
    'userhost',
    'ison',
    'names',
    'ctcp',
    'ping',
    'list',
    'motd',
    'version',
    'time',
    'admin',
    'info',
    'lusers',
    'links',
    'map',
    'stats',
    'help',
    // features
    'jitsi',
    'talk',
    'ignore',
    'unignore',
    'highlight',
    'hilight',
    'unhighlight',
    'dehilight',
    'relay',
    'network',
    'net',
    'dcc',
    'set',
    'get',
    'raw',
    'quote',
    'e2e',
    'commands',
    'alias',
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort(),
);
