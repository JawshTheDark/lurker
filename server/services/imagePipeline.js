import sharp from 'sharp';

const THUMB_SIZE = 128;

// Map sharp's `format` name to a canonical mime + filename extension. Used so
// the provider gets a filename whose extension matches the bytes regardless of
// what the client claimed in the multipart upload.
const FORMAT_INFO = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
  avif: { mime: 'image/avif', ext: 'avif' },
  heif: { mime: 'image/heif', ext: 'heic' },
  tiff: { mime: 'image/tiff', ext: 'tiff' },
  svg: { mime: 'image/svg+xml', ext: 'svg' },
};

export function extensionFor(mime, fallback = 'bin') {
  const entry = Object.values(FORMAT_INFO).find((v) => v.mime === mime);
  return entry?.ext || fallback;
}

// Optimize a static image (resize longest edge to maxDim, re-encode JPEG).
// Animated images (sharp.metadata.pages > 1) bypass the resize/re-encode and
// are returned verbatim, which is a hard requirement so reaction GIFs / animated
// WebP / APNG don't lose animation on the way through Lurker.
export async function optimize(buffer, { maxDim, quality }) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch (cause) {
    const err = new Error(`unable to read image: ${cause.message || cause}`);
    err.code = 'UNSUPPORTED_FORMAT';
    throw err;
  }
  const fmt = FORMAT_INFO[meta.format];
  if (!fmt) {
    const err = new Error(`unsupported image format: ${meta.format || 'unknown'}`);
    err.code = 'UNSUPPORTED_FORMAT';
    throw err;
  }

  const animated = (meta.pages || 1) > 1;
  if (animated) {
    return {
      buffer,
      mime: fmt.mime,
      ext: fmt.ext,
      width: meta.width || null,
      height: meta.height || null,
      byteSize: buffer.length,
      animated: true,
    };
  }

  // SVG is a static vector — we pass it through unchanged. sharp can rasterize
  // it but doing so silently strips interactivity and inflates the byte size.
  if (meta.format === 'svg') {
    return {
      buffer,
      mime: fmt.mime,
      ext: fmt.ext,
      width: meta.width || null,
      height: meta.height || null,
      byteSize: buffer.length,
      animated: false,
    };
  }

  const out = await sharp(buffer)
    .rotate()
    .resize({
      width: maxDim,
      height: maxDim,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out.data,
    mime: 'image/jpeg',
    ext: 'jpg',
    width: out.info.width,
    height: out.info.height,
    byteSize: out.data.length,
    animated: false,
  };
}

export async function thumbnail(buffer) {
  // Force first frame for animated inputs; cover-crop to a square JPEG.
  return sharp(buffer, { animated: false })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80 })
    .toBuffer();
}
