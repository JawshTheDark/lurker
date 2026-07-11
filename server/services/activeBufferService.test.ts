// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { describe, it, expect, beforeEach } from 'vitest';
import svc from './activeBufferService.js';

beforeEach(() => svc.clear());

describe('activeBufferService', () => {
  it('returns null when the user has no connection on that network', () => {
    expect(svc.activeTarget(1, 10)).toBeNull();
    svc.setActive(100, 1, 10, '#foo', true);
    expect(svc.activeTarget(1, 99)).toBeNull(); // different network
    expect(svc.activeTarget(2, 10)).toBeNull(); // different user
  });

  it('reports a single connection’s focused buffer', () => {
    svc.setActive(100, 1, 10, '#foo', true);
    expect(svc.activeTarget(1, 10)).toBe('#foo');
  });

  it('prefers a VISIBLE tab over a hidden one regardless of recency', () => {
    svc.setActive(100, 1, 10, '#visible', true);
    svc.setActive(101, 1, 10, '#hidden-but-newer', false);
    expect(svc.activeTarget(1, 10)).toBe('#visible');
  });

  it('among visible tabs, the most recently focused wins', () => {
    svc.setActive(100, 1, 10, '#old', true);
    svc.setActive(101, 1, 10, '#new', true);
    expect(svc.activeTarget(1, 10)).toBe('#new');
    // refocus the first tab → it becomes most recent
    svc.setActive(100, 1, 10, '#old-refocused', true);
    expect(svc.activeTarget(1, 10)).toBe('#old-refocused');
  });

  it('falls back to a hidden tab when none are visible', () => {
    svc.setActive(100, 1, 10, '#a', false);
    svc.setActive(101, 1, 10, '#b', false);
    expect(svc.activeTarget(1, 10)).toBe('#b'); // most recent hidden
  });

  it('setVisible flips selection without reordering recency', () => {
    svc.setActive(100, 1, 10, '#a', true);
    svc.setActive(101, 1, 10, '#b', true);
    expect(svc.activeTarget(1, 10)).toBe('#b');
    svc.setVisible(101, false); // b hidden → a (still visible) wins
    expect(svc.activeTarget(1, 10)).toBe('#a');
  });

  it('drop removes a connection so a closed tab never wins', () => {
    svc.setActive(100, 1, 10, '#a', true);
    svc.setActive(101, 1, 10, '#b', true);
    svc.drop(101);
    expect(svc.activeTarget(1, 10)).toBe('#a');
    svc.drop(100);
    expect(svc.activeTarget(1, 10)).toBeNull();
  });

  it('scopes by network — a buffer on network A never routes a network B event', () => {
    svc.setActive(100, 1, 10, '#on-ten', true);
    svc.setActive(101, 1, 20, 'dmnick', true);
    expect(svc.activeTarget(1, 10)).toBe('#on-ten');
    expect(svc.activeTarget(1, 20)).toBe('dmnick');
  });

  it('a virtual buffer (networkId null) is never a network routing target', () => {
    svc.setActive(100, 1, null, ':system:', true);
    expect(svc.activeTarget(1, 10)).toBeNull();
  });
});
