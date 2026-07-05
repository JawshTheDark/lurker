// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Chibisafe provider — self-hosted file host
// (https://github.com/chibisafe/chibisafe). Authenticates with the user's API
// key in the `x-api-key` header (generated under Credentials in the Chibisafe
// dashboard). A plain single multipart POST with field `file[]` is the same
// shape Chibisafe's own generated ShareX config uses; the chunked-upload
// protocol (chibi-chunk-* headers) only matters past the server's chunk size
// and Lurker's uploads sit far below it. The response is
// `{ name, uuid, url, … }` where `url` is the public link.
//
// SECURITY: `url` is a per-user setting, so the server POSTs to a user-chosen
// host (SSRF surface inherent to bring-your-own-host uploads — same as the
// hoarder/s3 providers). Accepted on a trusted-user instance; unguarded here.
// The api key is a `secret` setting, sent only to that host, never logged.

import { USER_AGENT } from '../../utils/userAgent.js';

export const id = 'chibisafe';
export const requiresSecrets = true;

export async function upload(
  buffer: Buffer,
  { filename, mime }: { filename: string; mime: string; kind?: string },
  secrets: { url?: string; api_key?: string } = {},
): Promise<{ url: string }> {
  if (!secrets.url) {
    throw Object.assign(new Error('chibisafe provider requires uploads.chibisafe.url'), {
      code: 'PROVIDER_CONFIG',
    });
  }
  if (!secrets.api_key) {
    throw Object.assign(new Error('chibisafe provider requires uploads.chibisafe.api_key'), {
      code: 'PROVIDER_CONFIG',
    });
  }

  const base = secrets.url.replace(/\/+$/, '');
  const form = new FormData();
  form.append('file[]', new Blob([new Uint8Array(buffer)], { type: mime }), filename);

  const resp = await fetch(`${base}/api/upload`, {
    method: 'POST',
    headers: {
      'x-api-key': secrets.api_key,
      'User-Agent': USER_AGENT,
    },
    body: form,
  });

  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 200);
    throw Object.assign(new Error(`chibisafe upload failed: ${resp.status} ${text}`), {
      code: resp.status === 401 || resp.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_ERROR',
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await resp.json().catch(() => null)) as any;
  if (!body || typeof body.url !== 'string' || !body.url) {
    throw Object.assign(new Error('chibisafe returned no url'), { code: 'PROVIDER_ERROR' });
  }
  return { url: body.url as string };
}
