// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

import * as x0 from './x0.js';
import * as catbox from './catbox.js';
import * as hoarder from './hoarder.js';
import * as zipline from './zipline.js';
import * as chibisafe from './chibisafe.js';
import * as s3 from './s3.js';

/** Shared shape every upload provider must satisfy. */
export interface UploadProvider {
  id: string;
  requiresSecrets: boolean;
  upload(
    buffer: Buffer,
    // `kind` is an optional hint forwarded to the in-house dropper so a thumbnail
    // lands under a `thumbs/` prefix. Hosts that don't understand it ignore the
    // extra form field.
    meta: { filename: string; mime: string; kind?: string },
    secrets?: Record<string, string>,
  ): Promise<{ url: string }>;
}

const PROVIDERS: Record<string, UploadProvider> = {
  [x0.id]: x0,
  [catbox.id]: catbox,
  [hoarder.id]: hoarder,
  [zipline.id]: zipline,
  [chibisafe.id]: chibisafe,
  [s3.id]: s3,
};

export const providerIds = Object.keys(PROVIDERS);

export function getProvider(id: string): UploadProvider | null {
  return PROVIDERS[id] ?? null;
}

// Lift the relevant per-user settings into a flat secrets object for the
// chosen provider. The router calls this rather than passing the raw settings
// object so each provider only sees what it needs.
export function secretsForProvider(
  id: string,
  userSettings: Record<string, string>,
): Record<string, string> {
  switch (id) {
    case 'catbox':
      return { userhash: userSettings['uploads.catbox.userhash'] || '' };
    case 'hoarder':
      return {
        url: userSettings['uploads.hoarder.url'] || '',
        api_key: userSettings['uploads.hoarder.api_key'] || '',
      };
    case 'zipline':
      return {
        url: userSettings['uploads.zipline.url'] || '',
        token: userSettings['uploads.zipline.token'] || '',
      };
    case 'chibisafe':
      return {
        url: userSettings['uploads.chibisafe.url'] || '',
        api_key: userSettings['uploads.chibisafe.api_key'] || '',
      };
    case 's3':
      return {
        endpoint: userSettings['uploads.s3.endpoint'] || '',
        region: userSettings['uploads.s3.region'] || '',
        bucket: userSettings['uploads.s3.bucket'] || '',
        access_key_id: userSettings['uploads.s3.access_key_id'] || '',
        secret_access_key: userSettings['uploads.s3.secret_access_key'] || '',
        public_base_url: userSettings['uploads.s3.public_base_url'] || '',
        key_prefix: userSettings['uploads.s3.key_prefix'] || '',
      };
    default:
      return {};
  }
}
