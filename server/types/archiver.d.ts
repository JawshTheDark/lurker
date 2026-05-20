// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// archiver v8 ships no types of its own, and @types/archiver still describes
// the v7 CommonJS API (a single default factory function). v8 is ESM and
// exposes a per-format archive class as a named export. This declares the
// subset Lurker uses — the streaming zip archiver in services/exportService.ts.

declare module 'archiver' {
  import type { Readable, Transform } from 'stream';

  interface ZipArchiveOptions {
    zlib?: { level?: number };
    comment?: string;
    forceLocalTime?: boolean;
    forceZip64?: boolean;
    store?: boolean;
  }

  interface AppendOptions {
    name: string;
    date?: Date | string;
    mode?: number;
    prefix?: string;
  }

  /** A streaming zip archive — a Transform stream you pipe to a destination. */
  export class ZipArchive extends Transform {
    constructor(options?: ZipArchiveOptions);
    append(source: Buffer | Readable | string, options: AppendOptions): this;
    finalize(): Promise<void>;
  }
}
