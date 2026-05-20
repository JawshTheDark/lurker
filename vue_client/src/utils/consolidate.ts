// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Client-side wrapper around the shared consolidation algorithm. Pure
// re-export today; we keep the wrapper so future client-only conveniences
// (e.g. a Vue-friendly memoization helper) have a place to live without
// touching the shared module.

export {
  consolidateRows,
  consolidateMessages,
  CONSOLIDATABLE_TYPES,
} from '../../../shared/consolidate.js';
