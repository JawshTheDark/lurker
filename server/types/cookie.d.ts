// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Minimal ambient declaration for the `cookie` npm package (no @types/cookie).
// Only the parse() function is used in this project.
declare module 'cookie' {
  export function parse(str: string, options?: Record<string, unknown>): Record<string, string>;
  export function serialize(name: string, val: string, options?: Record<string, unknown>): string;
}
