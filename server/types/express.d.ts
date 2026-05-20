// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Ambient augmentation of Express's Request. The auth middleware
// (middleware/auth.ts) resolves the session cookie once and attaches the
// account + session here, so downstream route handlers behind requireAuth
// can read req.user / req.session directly. Both are optional at the type
// level because handlers in front of the middleware see a bare request.

import type { User } from '../db/users.js';
import type { Session } from '../db/sessions.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
      apiToken?: { id: number | bigint; scope: string };
    }
  }
}
