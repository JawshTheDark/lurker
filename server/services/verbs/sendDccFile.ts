// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import fs from 'fs';
import path from 'path';
import { registerVerb } from '../verbRegistry.js';
import ircManager from '../ircManager.js';
import { fserveRoot } from '../fserveConfig.js';

interface VerbContext {
  userId: number;
  scope: string;
}

registerVerb({
  name: 'send_dcc_file',
  description:
    'Offer a file to a peer over DCC SEND. For safety the file must live inside your configured ' +
    'fserve archive (LURKER_FSERVE_DIR): `path` is resolved relative to that root and rejected if ' +
    'it escapes — an agent cannot exfiltrate arbitrary server files. Requires DCC enabled and an ' +
    'fserve root configured. Returns { ok: true, transferId } on success, or an error: ' +
    '"no-fserve-root", "path-outside-archive", "no-such-file", "not-a-file", or "not-connected".',
  scope: 'read-write',
  input: {
    type: 'object',
    properties: {
      networkId: { type: 'integer' },
      nick: { type: 'string', description: 'Peer to send the file to.' },
      path: {
        type: 'string',
        description: 'File path relative to the fserve archive root, e.g. "docs/readme.txt".',
      },
    },
    required: ['networkId', 'nick', 'path'],
    additionalProperties: false,
  },
  handler(ctx: VerbContext, input: Record<string, unknown>) {
    const networkId = Number(input.networkId);
    const nick = typeof input.nick === 'string' ? input.nick.trim() : '';
    const rel = typeof input.path === 'string' ? input.path.trim() : '';
    if (!nick || !rel) return { ok: false, error: 'empty-nick-or-path' };

    const root = fserveRoot();
    if (!root) return { ok: false, error: 'no-fserve-root' };

    // Resolve within the archive, then realpath both sides so a symlink can't
    // escape the sandbox. Reject anything not strictly under the root.
    const resolved = path.resolve(root, rel.replace(/^\/+/, ''));
    let real: string;
    try {
      real = fs.realpathSync(resolved);
    } catch {
      return { ok: false, error: 'no-such-file' };
    }
    const rootSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (real !== root && !real.startsWith(rootSep)) {
      return { ok: false, error: 'path-outside-archive' };
    }
    let st: fs.Stats;
    try {
      st = fs.statSync(real);
    } catch {
      return { ok: false, error: 'no-such-file' };
    }
    if (!st.isFile()) return { ok: false, error: 'not-a-file' };

    const id = ircManager.sendDccFile(
      ctx.userId,
      networkId,
      nick,
      real,
      path.basename(real),
      st.size,
    );
    return id != null ? { ok: true, transferId: id } : { ok: false, error: 'not-connected' };
  },
});
