// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// MUST be first — redirect DATABASE_PATH before db/index opens the real DB.
import '../test-utils/isolateDb.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { createUser } from '../db/users.js';
import svc, { validateAlias } from './aliasesService.js';

describe('validateAlias', () => {
  it('normalizes name (lowercase, strips leading slash) + trims expansion', () => {
    expect(validateAlias('/J', '  join $1  ')).toEqual({
      ok: true,
      name: 'j',
      expansion: 'join $1',
    });
  });
  it('rejects empty name/expansion and multi-word names', () => {
    expect(validateAlias('', 'x').ok).toBe(false);
    expect(validateAlias('j', '').ok).toBe(false);
    expect(validateAlias('two words', 'x').ok).toBe(false);
  });
  it('enforces length caps', () => {
    expect(validateAlias('x'.repeat(33), 'y').ok).toBe(false);
    expect(validateAlias('x', 'y'.repeat(513)).ok).toBe(false);
  });
});

describe('AliasesService (persisted)', () => {
  let uid: number;
  beforeAll(() => {
    uid = createUser('alias-user').id;
  });

  it('add → list → update (upsert) → remove', () => {
    expect(svc.list(uid)).toEqual([]);
    const a = svc.add(uid, 'j', 'join $1');
    expect(a).toMatchObject({ ok: true, created: true });
    // re-add same name updates in place, not a second row
    const b = svc.add(uid, '/J', 'join $1 $2');
    expect(b).toMatchObject({ ok: true, created: false });
    const list = svc.list(uid);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'j', expansion: 'join $1 $2' });

    // a second alias, then name-sorted listing
    svc.add(uid, 'cs', 'msg ChanServ $*');
    expect(svc.list(uid).map((r) => r.name)).toEqual(['cs', 'j']);

    // remove by id + by name
    const jid = svc.list(uid).find((r) => r.name === 'j')!.id;
    expect(svc.removeById(uid, jid)).toBe(true);
    expect(svc.removeByName(uid, '/CS')).toBe(1);
    expect(svc.list(uid)).toEqual([]);
  });

  it('rejects an invalid add without persisting', () => {
    const r = svc.add(uid, 'bad name', 'x');
    expect(r.ok).toBe(false);
    expect(svc.list(uid)).toEqual([]);
  });
});
