// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// catbox.moe provider — anonymous, optional userhash for "logged-in" uploads
// that can later be deleted via the user's account. The response body is the
// bare URL on success or an error string on failure (200 in both cases for
// anonymous uploads, so we sniff the prefix).
//
// We use Node's built-in https module rather than native fetch (undici). Two
// observed issues with undici against catbox:
//   1. WHATWG FormData defaults to chunked Transfer-Encoding, which catbox's
//      PHP backend stalls reading.
//   2. Even with a hand-built body and explicit Content-Length, undici
//      occasionally surfaces a generic "fetch failed" with no useful cause,
//      while the same bytes via https.request succeed.
// Both go away when we hand the body off to https.request directly.

import { buildMultipart, postBuffer } from './multipart.js';
import type { MultipartPart } from './multipart.js';
import { USER_AGENT } from '../../utils/userAgent.js';

const ENDPOINT = 'https://catbox.moe/user/api.php';
const TIMEOUT_MS = 60_000;

export const id = 'catbox';
export const requiresSecrets = false;

export async function upload(
  buffer: Buffer,
  { filename, mime }: { filename: string; mime: string },
  secrets: { userhash?: string } = {},
): Promise<{ url: string }> {
  const parts: MultipartPart[] = [{ name: 'reqtype', value: 'fileupload' }];
  if (secrets.userhash) parts.push({ name: 'userhash', value: secrets.userhash });
  parts.push({
    name: 'fileToUpload',
    filename,
    contentType: mime,
    value: buffer,
  });
  const { body, contentType } = buildMultipart(parts);

  let resp;
  try {
    resp = await postBuffer(ENDPOINT, body, {
      headers: {
        'Content-Type': contentType,
        'User-Agent': USER_AGENT,
        Accept: '*/*',
      },
      timeoutMs: TIMEOUT_MS,
    });
  } catch (cause) {
    const c = cause as NodeJS.ErrnoException; // eslint-disable-line @typescript-eslint/no-explicit-any
    const detail = c.code || c.message || 'unknown error';
    const err = Object.assign(new Error(`catbox upload failed: ${detail}`), {
      code: 'PROVIDER_ERROR',
      cause,
    });
    throw err;
  }

  const text = (resp.text || '').trim();
  if (resp.status < 200 || resp.status >= 300) {
    throw Object.assign(new Error(`catbox upload failed: ${resp.status} ${text.slice(0, 200)}`), {
      code: 'PROVIDER_ERROR',
    });
  }
  if (!/^https?:\/\//.test(text)) {
    throw Object.assign(new Error(`catbox refused upload: ${text.slice(0, 200)}`), {
      code: 'PROVIDER_ERROR',
    });
  }
  return { url: text };
}
