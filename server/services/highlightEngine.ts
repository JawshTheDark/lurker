// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import { buildTextTest, stripUrls, type TextKind } from './textMatch.js';

const ELIGIBLE_TYPES = new Set(['message', 'action']);

interface HighlightRule {
  id: number;
  enabled: boolean;
  pattern: string;
  kind: string;
  case_sensitive: boolean;
}

export interface CompiledRule {
  id: number;
  test: (text: string) => boolean;
}

interface MatchableEvent {
  type: string;
  self?: boolean;
  text?: string | null;
}

// Highlight rules use the 'plain' | 'glob' | 'regex' kinds (no 'substr'); an
// unknown kind falls through to whole-word 'plain', matching prior behavior.
function buildTest(rule: HighlightRule): ((text: string) => boolean) | null {
  const kind: TextKind = rule.kind === 'regex' || rule.kind === 'glob' ? rule.kind : 'plain';
  return buildTextTest(rule.pattern, kind, rule.case_sensitive);
}

export function compileRules(rules: HighlightRule[]): CompiledRule[] {
  const compiled: CompiledRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.pattern) continue;
    const test = buildTest(rule);
    if (!test) continue;
    compiled.push({ id: rule.id, test });
  }
  return compiled;
}

export function matchEvent(
  event: MatchableEvent | null | undefined,
  compiled: CompiledRule[],
): { matched: boolean; ruleId: number | null } {
  // Cheapest guard first: with no rules there is nothing to match, so skip
  // the eligibility checks and URL-stripping work entirely.
  if (compiled.length === 0) return { matched: false, ruleId: null };
  if (!event || !ELIGIBLE_TYPES.has(event.type)) return { matched: false, ruleId: null };
  if (event.self) return { matched: false, ruleId: null };
  const text = event.text || '';
  if (!text) return { matched: false, ruleId: null };
  const cleaned = stripUrls(text);
  for (const { id, test } of compiled) {
    if (test(cleaned)) return { matched: true, ruleId: id };
  }
  return { matched: false, ruleId: null };
}
