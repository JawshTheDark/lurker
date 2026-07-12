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
import type { ConfigField, DriverCapabilities, UploadMeta, UploadResult } from './types.js';

const ENDPOINT = 'https://catbox.moe/user/api.php';
const TIMEOUT_MS = 60_000;

export const driver = 'catbox';
export const label = 'catbox.moe';
export const capabilities: DriverCapabilities = {
  creatable: true,
  storesRemotely: true,
  // Deletable only for uploads made with a userhash — upload() signals that per
  // upload by returning a ref only when one was used. Anonymous uploads are
  // permanently undeletable on catbox's side, so they carry no ref and the row
  // never offers delete.
  supportsDelete: true,
  mintsKeys: false,
  acceptsContentClasses: ['image', 'text'],
};
export const configSchema: ConfigField[] = [
  {
    key: 'userhash',
    label: 'Catbox userhash',
    type: 'secret',
    required: false,
    default: '',
    description:
      'Optional catbox.moe account hash. Uploads made with a userhash can be ' +
      'managed from your catbox account; without one they are anonymous.',
  },
];

export async function upload(
  buffer: Buffer,
  { filename, mime }: UploadMeta,
  config: { userhash?: string } = {},
): Promise<UploadResult> {
  const parts: MultipartPart[] = [{ name: 'reqtype', value: 'fileupload' }];
  if (config.userhash) parts.push({ name: 'userhash', value: config.userhash });
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
  // The delete handle is the served filename (the deletefiles API addresses
  // files by name) — but only a userhash upload can ever be deleted, so an
  // anonymous upload gets no ref and its row never offers delete.
  const name = config.userhash ? text.split('/').pop() : undefined;
  return { url: text, ...(name ? { ref: name } : {}) };
}

/** Delete a file by the served filename upload() captured. Catbox answers 200
 *  with a plain-text body for both outcomes, so success is sniffed from the
 *  text; "doesn't exist" counts as already-gone. Requires the userhash the
 *  upload was made with — if the config no longer has one, the delete fails
 *  loudly rather than pretending. */
async function deleteFile(ref: string, config: { userhash?: string } = {}): Promise<void> {
  if (!config.userhash) {
    throw Object.assign(new Error('catbox delete requires the uploader’s userhash'), {
      code: 'PROVIDER_CONFIG',
    });
  }
  const { body, contentType } = buildMultipart([
    { name: 'reqtype', value: 'deletefiles' },
    { name: 'userhash', value: config.userhash },
    { name: 'files', value: ref },
  ]);

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
    const c = cause as NodeJS.ErrnoException;
    const detail = c.code || c.message || 'unknown error';
    throw Object.assign(new Error(`catbox delete failed: ${detail}`), {
      code: 'PROVIDER_ERROR',
      cause,
    });
  }

  const text = (resp.text || '').trim();
  // Already gone is the outcome the caller wanted.
  if (/doesn'?t exist/i.test(text)) return;
  if (resp.status < 200 || resp.status >= 300 || !/successful/i.test(text)) {
    throw Object.assign(new Error(`catbox delete failed: ${text.slice(0, 200) || resp.status}`), {
      code: 'PROVIDER_ERROR',
    });
  }
}

export { deleteFile as delete };
