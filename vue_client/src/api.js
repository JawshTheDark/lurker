export async function api(url, { method = 'GET', body, headers } = {}) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = text; }
  }
  if (!res.ok) {
    const message = (data && data.error) || res.statusText || 'request failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// XHR-backed multipart upload so callers get real upload-progress events.
// fetch() can't expose request-side progress in any browser today, hence the
// XHR fallback. Returns a Promise that resolves to the parsed JSON body.
export function apiMultipart(url, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      const text = xhr.responseText || '';
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch (_) { data = text; } }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const message = (data && data.error) || xhr.statusText || 'upload failed';
        const err = new Error(message);
        err.status = xhr.status;
        err.data = data;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.onabort = () => reject(new Error('upload aborted'));
    xhr.send(formData);
  });
}
