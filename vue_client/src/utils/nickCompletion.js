// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: Elastic-2.0

// Shared candidate builder for nick completion — used by both Tab-completion in
// MessageInput and the @-triggered NickPicker. Returns nicks matching `prefix`
// (case-insensitive), with `recent: true` marking entries that come from the
// speakers map (reverse-chronological) and `recent: false` marking remaining
// channel members (alphabetical). The caller's own nick is excluded.
//
// Membership filter: when the buffer has a members list, speakers that are no
// longer in the channel (parted/quit) are dropped, so completion only surfaces
// people who can still see the message. DM buffers don't carry a members list,
// so the filter is skipped there and the peer remains completable.
// Optional `isIgnored` predicate (passed `(nick, userhost)`) lets callers
// strip ignored nicks from completion without this util reaching into Pinia
// directly. Member userhost is computed from the member object when
// available; speakers only carry a nick so userhost is null for them
// (hostmask-only entries can't suppress speaker candidates).
export function buildNickCandidates(buf, selfNick, prefix, isIgnored) {
  if (!buf) return [];
  const lower = (prefix || '').toLowerCase();
  const seen = new Set();
  if (selfNick) seen.add(selfNick.toLowerCase());

  const memberNames = (buf.members || [])
    .map((m) => (typeof m === 'string' ? m : m.nick))
    .filter(Boolean);
  const memberLcSet = new Set(memberNames.map((n) => n.toLowerCase()));
  const filterSpeakersByMembership = memberLcSet.size > 0;
  const memberByLc = new Map();
  for (const m of (buf.members || [])) {
    const nick = typeof m === 'string' ? m : m?.nick;
    if (nick) memberByLc.set(nick.toLowerCase(), m);
  }

  function memberUserhost(nick) {
    const m = memberByLc.get(nick.toLowerCase());
    if (!m || typeof m !== 'object' || !m.user || !m.host) return null;
    return `${nick}!${m.user}@${m.host}`;
  }

  const out = [];

  const speakers = Object.values(buf.speakers || {})
    .sort((a, b) => b.lastTime - a.lastTime);
  for (const s of speakers) {
    const lc = s.nick.toLowerCase();
    if (seen.has(lc)) continue;
    if (!lc.startsWith(lower)) continue;
    if (filterSpeakersByMembership && !memberLcSet.has(lc)) continue;
    if (isIgnored && isIgnored(s.nick, memberUserhost(s.nick))) continue;
    seen.add(lc);
    out.push({ nick: s.nick, recent: true });
  }

  const sortedMembers = memberNames.slice().sort((a, b) => a.localeCompare(b));
  for (const n of sortedMembers) {
    const lc = n.toLowerCase();
    if (seen.has(lc)) continue;
    if (!lc.startsWith(lower)) continue;
    if (isIgnored && isIgnored(n, memberUserhost(n))) continue;
    seen.add(lc);
    out.push({ nick: n, recent: false });
  }

  return out;
}
