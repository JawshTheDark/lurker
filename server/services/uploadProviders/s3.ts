// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// S3-compatible provider — uploads straight to an object-storage bucket
// (Cloudflare R2, MinIO, Garage, AWS S3, …) and returns a link under the
// bucket's public base URL. AWS Signature V4 is implemented here with node
// crypto rather than pulling in @aws-sdk/client-s3: one signed PUT is ~70
// lines, and the SDK is a heavyweight dependency for exactly that.
//
// Requests are always PATH-STYLE ({endpoint}/{bucket}/{key}). Virtual-host
// style needs wildcard DNS that self-hosted MinIO setups rarely have, and
// every S3-compatible store — including R2 and AWS — still accepts
// path-style, so it's the lowest-friction default.
//
// The uploading bucket endpoint and the PUBLIC base URL are separate settings
// because they usually differ: R2's storage endpoint is never public (you
// front the bucket with a public bucket domain or a CDN), and a MinIO bucket
// is typically published through a reverse proxy. Serving objects is the
// bucket's job, not Lurker's.
//
// SECURITY (reviewed):
// - Credentials: the access key + secret are per-user `secret` settings (as at
//   rest, and readable back by the owning authenticated session — same as every
//   other provider's secret). Give Lurker a credential scoped to the one upload
//   bucket, NOT an account/root key: a leak is then contained to public blobs.
// - SSRF: `endpoint`/`public_base_url` are user-configured, so the server issues
//   a signed PUT to a user-chosen host. This is inherent to the bring-your-own
//   -host provider design (hoarder does the same) and is an accepted risk on a
//   trusted-user instance; it is NOT guarded here. Don't expose upload settings
//   to untrusted users without adding a private-address guard (cf. dccConfig).
// - Object keys are 48 bits of randomness (unguessable) and built only from a
//   safe alphabet with dot-only segments dropped, so a proxy serving the bucket
//   can't be walked with `..`. The secret is used only in the HMAC ladder — it
//   never reaches a URL, header, log, or error string.
// - Content-type is whatever the caller passes; the upload route constrains it
//   to a sharp-detected image allowlist (+ text/plain), so it can't be forced
//   to an executable type here. SVG passthrough (standalone) is the one active
//   type and rides on the serving origin, not chat's.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { USER_AGENT } from '../../utils/userAgent.js';

export const id = 's3';
export const requiresSecrets = true;

export interface S3Secrets {
  endpoint?: string;
  region?: string;
  bucket?: string;
  access_key_id?: string;
  secret_access_key?: string;
  public_base_url?: string;
  key_prefix?: string;
}

function sha256hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

// Keys are built strictly from URL-unreserved characters ([A-Za-z0-9._~-]
// plus '/' separators), so neither the canonical request nor the public URL
// ever needs percent-encoding — that sidesteps the classic SigV4 mismatch
// bugs around encoding. User-supplied prefixes are sanitized to the same
// alphabet.
function sanitizeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
}

export function buildObjectKey(
  filename: string,
  { kind, prefix }: { kind?: string; prefix?: string } = {},
): string {
  const dotIdx = filename.lastIndexOf('.');
  const rawExt = dotIdx > 0 ? filename.slice(dotIdx + 1).toLowerCase() : '';
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : 'bin';
  const idPart = randomBytes(6).toString('base64url');
  const segments: string[] = [];
  // Dot-only segments ('.', '..') are dropped outright: S3 stores keys
  // opaquely, but the reverse proxy that later SERVES the bucket may
  // normalize '..' — a traversal risk no object key needs to carry.
  const pushClean = (part: string) => {
    const clean = sanitizeSegment(part);
    if (clean && !/^\.+$/.test(clean)) segments.push(clean);
  };
  if (prefix) for (const part of prefix.split('/')) pushClean(part);
  if (kind) pushClean(kind);
  segments.push(`${idPart}.${ext}`);
  return segments.join('/');
}

export interface SignedPut {
  url: string;
  headers: Record<string, string>;
}

/**
 * Build a SigV4-signed PUT for one object. Pure given `now`, so tests can
 * pin the clock and assert determinism.
 */
export function signPutObject(
  {
    endpoint,
    bucket,
    key,
    payload,
    contentType,
    region,
    accessKeyId,
    secretAccessKey,
  }: {
    endpoint: string;
    bucket: string;
    key: string;
    payload: Buffer;
    contentType: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
  now: Date = new Date(),
): SignedPut {
  const base = endpoint.replace(/\/+$/, '');
  const url = new URL(`${base}/${bucket}/${key}`);
  const host = url.host;
  const path = url.pathname;

  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const payloadHash = sha256hex(payload);

  // Signed headers, sorted by lowercase name. Everything we send that the
  // server may validate is signed — including cache-control, so a store
  // can't reject it as an unsigned x-amz-adjacent header surprise.
  const headers: Record<string, string> = {
    'cache-control': 'public, max-age=31536000, immutable',
    'content-type': contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h].trim()}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    'PUT',
    path,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: url.toString(),
    headers: {
      ...headers,
      authorization,
      'User-Agent': USER_AGENT,
    },
  };
}

function requireSecret(secrets: S3Secrets, field: keyof S3Secrets): string {
  const value = (secrets[field] || '').trim();
  if (!value) {
    throw Object.assign(new Error(`s3 provider requires uploads.s3.${field}`), {
      code: 'PROVIDER_CONFIG',
    });
  }
  return value;
}

export async function upload(
  buffer: Buffer,
  { filename, mime, kind }: { filename: string; mime: string; kind?: string },
  secrets: S3Secrets = {},
): Promise<{ url: string }> {
  const endpoint = requireSecret(secrets, 'endpoint');
  const bucket = requireSecret(secrets, 'bucket');
  const accessKeyId = requireSecret(secrets, 'access_key_id');
  const secretAccessKey = requireSecret(secrets, 'secret_access_key');
  const publicBase = requireSecret(secrets, 'public_base_url');
  // R2 wants literally "auto"; MinIO accepts any region string. Defaulting
  // here keeps the setting optional for both.
  const region = (secrets.region || '').trim() || 'auto';

  const key = buildObjectKey(filename, { kind, prefix: secrets.key_prefix });
  const signed = signPutObject({
    endpoint,
    bucket,
    key,
    payload: buffer,
    contentType: mime,
    region,
    accessKeyId,
    secretAccessKey,
  });

  const resp = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: new Uint8Array(buffer),
  });

  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 200);
    throw Object.assign(new Error(`s3 upload failed: ${resp.status} ${text}`), {
      code: resp.status === 401 || resp.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_ERROR',
    });
  }
  return { url: `${publicBase.replace(/\/+$/, '')}/${key}` };
}
