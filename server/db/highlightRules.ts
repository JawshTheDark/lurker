// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import db from './index.js';

/** A raw row from the `highlight_rules` table. */
interface HighlightRuleRow {
  id: number;
  user_id: number;
  pattern: string;
  kind: string;
  case_sensitive: number;
  enabled: number;
  auto_managed: number;
  created_at: string;
}

/** The public rule shape returned to callers (booleans coerced from SQLite integers). */
export interface HighlightRule {
  id: number;
  user_id: number;
  pattern: string;
  kind: string;
  case_sensitive: boolean;
  enabled: boolean;
  auto_managed: boolean;
  created_at: string;
}

/** Fields accepted by createRule / updateRule. */
export interface RuleFields {
  pattern?: string;
  kind?: string;
  case_sensitive?: boolean;
  enabled?: boolean;
}

function rowToRule(row: HighlightRuleRow | undefined): HighlightRule | null {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    pattern: row.pattern,
    kind: row.kind,
    case_sensitive: !!row.case_sensitive,
    enabled: !!row.enabled,
    auto_managed: !!row.auto_managed,
    created_at: row.created_at,
  };
}

export function listRules(userId: number): HighlightRule[] {
  const rows = db
    .prepare('SELECT * FROM highlight_rules WHERE user_id = ? ORDER BY id')
    .all(userId) as HighlightRuleRow[];
  return rows.map(rowToRule).filter((r): r is HighlightRule => r !== null);
}

export function getRule(id: number | bigint, userId: number): HighlightRule | null {
  const row = db
    .prepare('SELECT * FROM highlight_rules WHERE id = ? AND user_id = ?')
    .get(id, userId) as HighlightRuleRow | undefined;
  return rowToRule(row);
}

export function createRule(userId: number, fields: RuleFields): HighlightRule | null {
  const { pattern, kind = 'plain', case_sensitive = false, enabled = true } = fields;
  const result = db
    .prepare(
      `
      INSERT INTO highlight_rules (user_id, pattern, kind, case_sensitive, enabled)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .run(userId, pattern, kind, case_sensitive ? 1 : 0, enabled ? 1 : 0);
  return getRule(result.lastInsertRowid, userId);
}

export function updateRule(id: number, userId: number, fields: RuleFields): HighlightRule | null {
  const allowed = ['pattern', 'kind', 'case_sensitive', 'enabled'] as const;
  const setClauses: string[] = [];
  const params: (string | number)[] = [];
  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = ?`);
      const raw = fields[key];
      const value = key === 'case_sensitive' || key === 'enabled' ? (raw ? 1 : 0) : (raw as string);
      params.push(value);
    }
  }
  if (!setClauses.length) return getRule(id, userId);
  params.push(id, userId);
  db.prepare(
    `UPDATE highlight_rules SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
  ).run(...params);
  return getRule(id, userId);
}

export function deleteRule(id: number, userId: number): void {
  db.prepare('DELETE FROM highlight_rules WHERE id = ? AND user_id = ?').run(id, userId);
}

// Auto-nick rules are shared across every network that currently uses the same
// nick. We detach the network from any prior auto rule, find-or-create one for
// the new nick, attach the network, then sweep any auto rule that no longer
// has any networks attached. A manual rule matching the same nick (same
// pattern + plain/case-insensitive) suppresses auto-creation, since the
// manual rule already covers the highlight.
const findExistingStmt = db.prepare(`
  SELECT id, auto_managed FROM highlight_rules
  WHERE user_id = ? AND pattern = ? AND kind = 'plain' AND case_sensitive = 0
  LIMIT 1
`);
const detachNetworkStmt = db.prepare(`
  DELETE FROM highlight_rule_networks
  WHERE network_id = ?
    AND rule_id IN (SELECT id FROM highlight_rules
                    WHERE user_id = ? AND auto_managed = 1)
`);
const attachNetworkStmt = db.prepare(`
  INSERT OR IGNORE INTO highlight_rule_networks (rule_id, network_id) VALUES (?, ?)
`);
const insertAutoRuleStmt = db.prepare(`
  INSERT INTO highlight_rules (user_id, pattern, kind, case_sensitive, enabled, auto_managed)
  VALUES (?, ?, 'plain', 0, 1, 1)
`);
const sweepOrphanedAutoStmt = db.prepare(`
  DELETE FROM highlight_rules
  WHERE user_id = ? AND auto_managed = 1
    AND id NOT IN (SELECT rule_id FROM highlight_rule_networks)
`);

const upsertAutoNickRuleTx = db.transaction(
  (userId: number, networkId: number, nick: string): number | bigint | null => {
    detachNetworkStmt.run(networkId, userId);
    const existing = findExistingStmt.get(userId, nick) as
      | { id: number; auto_managed: number }
      | undefined;
    let ruleId: number | bigint | null = null;
    if (existing) {
      if (existing.auto_managed) {
        attachNetworkStmt.run(existing.id, networkId);
        ruleId = existing.id;
      }
      // Manual rule with the same triple already covers this nick — skip
      // auto-creation. If the user later deletes their manual rule, the next
      // reconnect / nick change will re-create the auto.
    } else {
      const result = insertAutoRuleStmt.run(userId, nick);
      ruleId = result.lastInsertRowid;
      attachNetworkStmt.run(ruleId, networkId);
    }
    sweepOrphanedAutoStmt.run(userId);
    return ruleId;
  },
);

export function upsertAutoNickRule(
  userId: number,
  networkId: number,
  nick: string,
): HighlightRule | null {
  if (!nick) return null;
  const ruleId = upsertAutoNickRuleTx(userId, networkId, nick);
  return ruleId ? getRule(ruleId, userId) : null;
}
