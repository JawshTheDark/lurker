// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Coerce an untrusted WS `rule` payload (or a bare legacy mask) into an
// IgnoreRuleInput. Returns null only when the shape is unusable. Field-level
// validity — regex compiles, levels are known, pattern length — is enforced by
// ignoreRulesService.add; this layer just normalizes types and trims strings.

import type { IgnoreRuleInput, IgnorePatternKind } from '../db/ignoredMasks.js';

const KINDS = new Set<IgnorePatternKind>(['substr', 'full', 'regex']);

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export function parseIgnoreInput(raw: unknown): IgnoreRuleInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // A bare '*' mask means "anyone" — normalize to null so the matcher has one
  // representation.
  let mask = strOrNull(r.mask);
  if (mask === '*') mask = null;

  let channels: string[] | null = null;
  if (Array.isArray(r.channels)) {
    const list = r.channels
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim().toLowerCase());
    channels = list.length ? list : null;
  }

  let levels: string[] = [];
  if (Array.isArray(r.levels)) {
    levels = r.levels.filter((l): l is string => typeof l === 'string');
  }
  if (levels.length === 0) levels = ['ALL'];

  const patternKind: IgnorePatternKind = KINDS.has(r.patternKind as IgnorePatternKind)
    ? (r.patternKind as IgnorePatternKind)
    : 'substr';

  return {
    mask,
    channels,
    pattern: strOrNull(r.pattern),
    patternKind,
    levels,
    isExcept: r.isExcept === true,
    expiresAt: strOrNull(r.expiresAt),
  };
}

// Build a default ALL-level rule from a bare mask string — the shape the
// quick-ignore modal (and the legacy add-ignore payload) sends.
export function maskToRuleInput(mask: string): IgnoreRuleInput | null {
  const m = strOrNull(mask);
  if (!m) return null;
  return {
    mask: m === '*' ? null : m,
    channels: null,
    pattern: null,
    patternKind: 'substr',
    levels: ['ALL'],
    isExcept: false,
    expiresAt: null,
  };
}
