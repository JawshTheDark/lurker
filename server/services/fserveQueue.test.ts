// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect } from 'vitest';
import { FserveQueue, type FserveQueueLimits } from './fserveQueue.js';

const fixedLimits =
  (l: FserveQueueLimits): (() => FserveQueueLimits) =>
  () =>
    l;

const req = (q: FserveQueue, nick: string, name: string, size = 100) =>
  q.request(nick, `/root/${name}`, name, size);

describe('FserveQueue — slots + queueing', () => {
  it('sends immediately while a send slot is free', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 2, maxQueue: 5 }));
    const a = req(q, 'alice', 'a.bin');
    const b = req(q, 'bob', 'b.bin');
    expect(a.status).toBe('send');
    expect(b.status).toBe('send');
    expect(q.activeCount()).toBe(2);
    expect(q.queuedCount()).toBe(0);
  });

  it('queues once send slots are full, reporting 1-based position', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 5 }));
    expect(req(q, 'alice', 'a').status).toBe('send');
    const b = req(q, 'bob', 'b');
    const c = req(q, 'carol', 'c');
    expect(b).toMatchObject({ status: 'queued', position: 1 });
    expect(c).toMatchObject({ status: 'queued', position: 2 });
    expect(q.activeCount()).toBe(1);
    expect(q.queuedCount()).toBe(2);
  });

  it('rejects with full when the queue is at capacity', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 1 }));
    req(q, 'a', '1'); // active
    req(q, 'b', '2'); // queued (slot 1)
    const third = req(q, 'c', '3');
    expect(third).toEqual({ status: 'full', maxQueue: 1 });
    expect(q.queuedCount()).toBe(1);
  });

  it('settle frees a slot and promotes the next waiter in FIFO order', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 5 }));
    const a = req(q, 'a', 'a') as { item: { id: number } };
    const b = req(q, 'b', 'b') as { item: { id: number } };
    req(q, 'c', 'c');
    // finishing a promotes b (the first waiter)
    const promoted = q.settle(a.item.id);
    expect(promoted?.nick).toBe('b');
    expect(promoted?.id).toBe(b.item.id);
    expect(q.activeCount()).toBe(1);
    expect(q.queuedCount()).toBe(1);
    // c is now next
    expect(q.queued()[0].nick).toBe('c');
  });

  it('settle promotes nothing when the queue is empty', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 5 }));
    const a = req(q, 'a', 'a') as { item: { id: number } };
    expect(q.settle(a.item.id)).toBeNull();
    expect(q.activeCount()).toBe(0);
  });

  it('settle is idempotent / safe for unknown ids', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 5 }));
    expect(q.settle(999)).toBeNull();
    expect(q.activeCount()).toBe(0);
  });

  it('respects a live maxSends increase on the next settle', () => {
    let limits: FserveQueueLimits = { maxSends: 1, maxQueue: 5 };
    const q = new FserveQueue(() => limits);
    const a = req(q, 'a', 'a') as { item: { id: number } };
    req(q, 'b', 'b');
    req(q, 'c', 'c');
    // Raise the cap; each settle still promotes exactly one.
    limits = { maxSends: 3, maxQueue: 5 };
    const p = q.settle(a.item.id);
    expect(p?.nick).toBe('b');
    expect(q.activeCount()).toBe(1); // a gone, b active
  });
});

describe('FserveQueue — clearing', () => {
  it('clr_queue removes only the caller’s waiting items (case-insensitive)', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 10 }));
    req(q, 'owner', 'x'); // active
    req(q, 'Bob', 'b1');
    req(q, 'carol', 'c1');
    req(q, 'bob', 'b2');
    const dropped = q.clearFor('BOB');
    expect(dropped).toBe(2);
    expect(q.queued().map((i) => i.nick)).toEqual(['carol']);
  });

  it('clr_queues drops every waiter but leaves active sends running', () => {
    const q = new FserveQueue(fixedLimits({ maxSends: 1, maxQueue: 10 }));
    req(q, 'a', 'x'); // active
    req(q, 'b', 'y');
    req(q, 'c', 'z');
    expect(q.clearAll()).toBe(2);
    expect(q.queuedCount()).toBe(0);
    expect(q.activeCount()).toBe(1);
  });
});
