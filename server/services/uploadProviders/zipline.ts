// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Zipline provider — self-hosted ShareX-style file host
// (https://github.com/diced/zipline). Authenticates with the user's Zipline
// token sent RAW in the `authorization` header (no "Bearer" prefix — Zipline's
// userMiddleware passes the header value straight to its token decryptor).
// The v4 upload route responds `{ files: [{ id, name, type, url, … }] }`;
// v3 instances respond `{ files: ["https://…"] }` — both shapes are accepted
// since the difference is one line and v3 servers are still common.

import { USER_AGENT } from '../../utils/userAgent.js';

export const id = 'zipline';
export const requiresSecrets = true;

export async function upload(
  buffer: Buffer,
  { filename, mime }: { filename: string; mime: string; kind?: string },
  secrets: { url?: string; token?: string } = {},
): Promise<{ url: string }> {
  if (!secrets.url) {
    throw Object.assign(new Error('zipline provider requires uploads.zipline.url'), {
      code: 'PROVIDER_CONFIG',
    });
  }
  if (!secrets.token) {
    throw Object.assign(new Error('zipline provider requires uploads.zipline.token'), {
      code: 'PROVIDER_CONFIG',
    });
  }

  const base = secrets.url.replace(/\/+$/, '');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);

  const resp = await fetch(`${base}/api/upload`, {
    method: 'POST',
    headers: {
      authorization: secrets.token,
      'User-Agent': USER_AGENT,
    },
    body: form,
  });

  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 200);
    throw Object.assign(new Error(`zipline upload failed: ${resp.status} ${text}`), {
      code: resp.status === 401 || resp.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_ERROR',
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await resp.json().catch(() => null)) as any;
  const first = body?.files?.[0];
  // v4: files is an array of objects with `url`; v3: an array of URL strings.
  const url = typeof first === 'string' ? first : first?.url;
  if (typeof url !== 'string' || !url) {
    throw Object.assign(new Error('zipline returned no url'), { code: 'PROVIDER_ERROR' });
  }
  return { url };
}
