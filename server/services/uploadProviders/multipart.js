import { randomBytes } from 'crypto';
import https from 'https';
import http from 'http';

// Manual multipart/form-data encoder that produces a single Buffer with a
// known Content-Length. The browser-style WHATWG FormData + native fetch
// combination sends the body with chunked transfer encoding, which catbox's
// PHP backend silently stalls on. Pre-serialising the body sidesteps that.

const CRLF = '\r\n';

export function buildMultipart(parts) {
  const boundary = `----LurkerBoundary${randomBytes(16).toString('hex')}`;
  const chunks = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));
    if (part.filename) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${encodeFilename(part.filename)}"${CRLF}` +
        `Content-Type: ${part.contentType || 'application/octet-stream'}${CRLF}${CRLF}`,
      ));
      chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    } else {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"${CRLF}${CRLF}` +
        String(part.value),
      ));
    }
    chunks.push(Buffer.from(CRLF));
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// RFC 7578: backslashes and quotes in filenames need to be escaped. Most
// servers also accept percent-encoded bytes, which sidesteps quirky encodings
// when filenames contain non-ASCII.
function encodeFilename(name) {
  return name.replace(/["\\]/g, (c) => `\\${c}`);
}

// Direct https/http POST that bypasses undici. Node's native fetch wraps
// undici, which has historically been finicky with picky servers (catbox's
// PHP backend in particular wedges on the combination of HTTP/1.1 keepalive
// and the recomputed Content-Length undici emits). Using https.request keeps
// us closer to the axios/form-data path that's known to work end-to-end.
//
// Returns { status, headers, text }. The body is buffered fully — every
// provider response we care about is small (a URL or a tiny JSON object).
export function postBuffer(urlString, body, { headers = {}, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlString); } catch (err) { return reject(err); }
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Length': String(body.length),
        'Connection': 'close',
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error(`request timed out after ${timeoutMs}ms`), { code: 'ETIMEDOUT' }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
