// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

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
  text?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegexSource(pattern: string): string {
  let out = '';
  for (const ch of pattern) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += escapeRegex(ch);
  }
  return out;
}

function buildTest(rule: HighlightRule): ((text: string) => boolean) | null {
  const flags = rule.case_sensitive ? '' : 'i';
  let source: string;
  if (rule.kind === 'regex') {
    source = rule.pattern;
  } else if (rule.kind === 'glob') {
    source = `(?:^|\\W)(?:${globToRegexSource(rule.pattern)})(?=\\W|$)`;
  } else {
    source = `(?:^|\\W)(?:${escapeRegex(rule.pattern)})(?=\\W|$)`;
  }
  try {
    const re = new RegExp(source, flags);
    return (text: string) => re.test(text);
  } catch {
    return null;
  }
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
  if (!event || !ELIGIBLE_TYPES.has(event.type)) return { matched: false, ruleId: null };
  if (event.self) return { matched: false, ruleId: null };
  const text = event.text || '';
  if (!text) return { matched: false, ruleId: null };
  for (const { id, test } of compiled) {
    if (test(text)) return { matched: true, ruleId: id };
  }
  return { matched: false, ruleId: null };
}
