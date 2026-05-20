// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import type { DisplayRow } from './collapseDisplay.js';
import { collapseDisplay } from './collapseDisplay.js';

// Build a chat row with the same shape MessageList's renderRows emits.
function msg({
  id,
  nick,
  time,
  type = 'message',
  self = false,
}: {
  id: number;
  nick: string;
  time: string;
  type?: string;
  self?: boolean;
}): DisplayRow {
  return {
    m: { id, nick, time, type, self },
    key: id,
  };
}

function consolidation({ time, key = 'cons:k' }: { time: string; key?: string }): DisplayRow {
  return { consolidation: true, time, key };
}

function divider({
  kind = 'unread',
  key = 'd:k',
}: { kind?: string; key?: string } = {}): DisplayRow {
  return { divider: kind, key };
}

// Identity time formatter — turns ISO into the minute portion so we can
// exercise the "same displayed time" branch deterministically.
const minuteFormat = (iso: string | undefined): string => (iso ? iso.slice(11, 16) : '');

describe('collapseDisplay — author collapsing', () => {
  it('flags consecutive plain messages from the same nick', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:30Z' }),
      msg({ id: 3, nick: 'alice', time: '2026-05-16T10:01:00Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows[0].continuationAuthor).toBeUndefined();
    expect(rows[1].continuationAuthor).toBe(true);
    expect(rows[2].continuationAuthor).toBe(true);
  });

  it('does not collapse across different nicks', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'bob', time: '2026-05-16T10:00:30Z' }),
      msg({ id: 3, nick: 'alice', time: '2026-05-16T10:01:00Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows.every((r) => !r.continuationAuthor)).toBe(true);
  });

  it('does not collapse self vs. non-self messages from the same nick', () => {
    // Highly unusual — exists for completeness because the visual identity
    // (self color vs. hashed nick color) differs.
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z', self: false }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:10Z', self: true }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows[1].continuationAuthor).toBeUndefined();
  });

  it('breaks the run when the gap exceeds authorWindowMs', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:30:00Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows[1].continuationAuthor).toBeUndefined();
  });

  it('does not collapse action / notice rows even from the same nick', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z', type: 'action' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:10Z', type: 'action' }),
      msg({ id: 3, nick: 'alice', time: '2026-05-16T10:00:20Z', type: 'notice' }),
      msg({ id: 4, nick: 'alice', time: '2026-05-16T10:00:30Z', type: 'notice' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows.every((r) => !r.continuationAuthor)).toBe(true);
  });

  it('breaks the run on a system event between two messages', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'bob', time: '2026-05-16T10:00:05Z', type: 'join' }),
      msg({ id: 3, nick: 'alice', time: '2026-05-16T10:00:10Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows[2].continuationAuthor).toBeUndefined();
  });

  it('breaks the run on a divider', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      divider({ kind: 'unread' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:30Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows[2].continuationAuthor).toBeUndefined();
  });

  it('breaks the run on a consolidation summary row', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      consolidation({ time: '2026-05-16T10:00:10Z' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:20Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
    });
    expect(rows[2].continuationAuthor).toBeUndefined();
  });
});

describe('collapseDisplay — timestamp collapsing', () => {
  it('hides repeated formatted time strings across consecutive rows', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:05Z' }),
      msg({ id: 2, nick: 'bob', time: '2026-05-16T10:00:30Z' }),
      msg({ id: 3, nick: 'carol', time: '2026-05-16T10:00:55Z' }),
      msg({ id: 4, nick: 'dave', time: '2026-05-16T10:01:10Z' }),
    ];
    collapseDisplay(rows, {
      collapseTimestamps: true,
      formatTime: minuteFormat,
    });
    expect(rows[0].continuationTime).toBeUndefined();
    expect(rows[1].continuationTime).toBe(true);
    expect(rows[2].continuationTime).toBe(true);
    expect(rows[3].continuationTime).toBeUndefined();
  });

  it('also applies across system rows and consolidation rows', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'bob', time: '2026-05-16T10:00:10Z', type: 'join' }),
      consolidation({ time: '2026-05-16T10:00:30Z' }),
      msg({ id: 3, nick: 'carol', time: '2026-05-16T10:00:45Z' }),
    ];
    collapseDisplay(rows, {
      collapseTimestamps: true,
      formatTime: minuteFormat,
    });
    expect(rows[0].continuationTime).toBeUndefined();
    expect(rows[1].continuationTime).toBe(true);
    expect(rows[2].continuationTime).toBe(true);
    expect(rows[3].continuationTime).toBe(true);
  });

  it('resets on a divider so the next row re-shows its time', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      divider({ kind: 'unread' }),
      msg({ id: 2, nick: 'bob', time: '2026-05-16T10:00:10Z' }),
    ];
    collapseDisplay(rows, {
      collapseTimestamps: true,
      formatTime: minuteFormat,
    });
    expect(rows[2].continuationTime).toBeUndefined();
  });

  it('does not flag when the format string is empty (time column hidden)', () => {
    // look.buffer.time_format='' → formatTime returns '', which would otherwise
    // make every adjacent row "match"; the empty-string guard prevents the
    // collapse flag from firing in that case.
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'bob', time: '2026-05-16T10:00:10Z' }),
    ];
    collapseDisplay(rows, {
      collapseTimestamps: true,
      formatTime: () => '',
    });
    expect(rows.every((r) => !r.continuationTime)).toBe(true);
  });
});

describe('collapseDisplay — compact-mode time-chain skip', () => {
  it('skips hidden continuation message rows when tracking the time chain', () => {
    // In compact mode the second message hides its head (continuationAuthor=true
    // for same nick within window), so its time isn't displayed. The third row
    // is from a different nick — its time should compare against row 0's time
    // (still displayed), not row 1's hidden time. With the same minute key for
    // all three, the third row collapses against row 0 ⇒ continuationTime.
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:30Z' }),
      msg({ id: 3, nick: 'bob', time: '2026-05-16T10:00:45Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
      collapseTimestamps: true,
      compactMode: true,
      formatTime: minuteFormat,
    });
    expect(rows[0].continuationAuthor).toBeUndefined();
    expect(rows[1].continuationAuthor).toBe(true);
    expect(rows[2].continuationAuthor).toBeUndefined();
    // Time chain: row 0 set baseline, row 1 skipped (hidden head),
    // row 2 displayed time matches row 0 → continuationTime.
    expect(rows[0].continuationTime).toBeUndefined();
    expect(rows[1].continuationTime).toBeUndefined();
    expect(rows[2].continuationTime).toBe(true);
  });

  it('without compactMode the same scenario tracks the hidden row in the chain', () => {
    // Regression guard: in standard mode the continuation row still occupies
    // the .time cell as an empty span; the util treats it as "would display
    // empty" — but timeStr is the formatted string, not '' — so prevTimeStr
    // gets updated. Row 2's continuationTime is set against row 1's tracked
    // time (which equals row 0's, so still true here — but the chain went
    // through row 1, exercising the non-compact path).
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:30Z' }),
      msg({ id: 3, nick: 'bob', time: '2026-05-16T10:00:45Z' }),
    ];
    collapseDisplay(rows, {
      collapseAuthors: true,
      authorWindowMs: 5 * 60_000,
      collapseTimestamps: true,
      compactMode: false,
      formatTime: minuteFormat,
    });
    expect(rows[1].continuationAuthor).toBe(true);
    expect(rows[1].continuationTime).toBe(true);
    expect(rows[2].continuationTime).toBe(true);
  });
});

describe('collapseDisplay — bypass', () => {
  it('returns rows unchanged when both flags are off', () => {
    const rows = [
      msg({ id: 1, nick: 'alice', time: '2026-05-16T10:00:00Z' }),
      msg({ id: 2, nick: 'alice', time: '2026-05-16T10:00:10Z' }),
    ];
    const result = collapseDisplay(rows, {});
    expect(result).toBe(rows);
    expect(rows.every((r) => !r.continuationAuthor && !r.continuationTime)).toBe(true);
  });
});
