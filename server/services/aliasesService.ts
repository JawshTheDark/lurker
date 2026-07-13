// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Thin service over the user_aliases table: validates + persists per-user custom
// slash-command aliases and hands the list back for WS sync. Aliases are global
// (no network scope) and interpreted entirely client-side, so there's no cache
// or IRC involvement here — just validation and storage. The validator is pure
// and unit-tested.

import {
  listAliases,
  upsertAlias,
  removeAliasById,
  removeAliasByName,
  type AliasRow,
} from '../db/aliases.js';

const MAX_NAME = 32;
const MAX_EXPANSION = 512;
// One word: no whitespace, and (after stripping a leading slash) can't start
// with another slash. Everything else (symbols, digits) is allowed, mIRC-style.
const NAME_RE = /^[^\s/][^\s]*$/;

export type AliasValidation =
  | { ok: false; error: string }
  | { ok: true; name: string; expansion: string };

/** Normalize + validate an alias name/expansion. Names are lowercased and have a
 *  leading slash stripped, so `/J` and `j` are the same alias. */
export function validateAlias(nameRaw: unknown, expansionRaw: unknown): AliasValidation {
  const name = String(nameRaw ?? '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
  const expansion = String(expansionRaw ?? '').trim();
  if (!name) return { ok: false, error: 'alias name is required' };
  if (name.length > MAX_NAME) return { ok: false, error: `alias name too long (max ${MAX_NAME})` };
  if (!NAME_RE.test(name)) {
    return { ok: false, error: 'alias name must be a single word with no spaces' };
  }
  if (!expansion) return { ok: false, error: 'alias expansion is required' };
  if (expansion.length > MAX_EXPANSION) {
    return { ok: false, error: `alias expansion too long (max ${MAX_EXPANSION})` };
  }
  return { ok: true, name, expansion };
}

class AliasesService {
  list(userId: number): AliasRow[] {
    return listAliases(userId);
  }

  add(
    userId: number,
    name: unknown,
    expansion: unknown,
  ): { ok: false; error: string } | { ok: true; id: number; created: boolean } {
    const v = validateAlias(name, expansion);
    if (!v.ok) return v;
    const { id, created } = upsertAlias(userId, v.name, v.expansion);
    return { ok: true, id, created };
  }

  removeById(userId: number, id: number): boolean {
    return removeAliasById(userId, id);
  }

  removeByName(userId: number, name: string): number {
    return removeAliasByName(userId, String(name).trim().replace(/^\/+/, '').toLowerCase());
  }
}

const aliasesService = new AliasesService();
export default aliasesService;
export type { AliasRow };
