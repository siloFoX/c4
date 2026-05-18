// (v1.11.370, TODO 11.352) XHR-based file uploader.
//
// `fetch()` does not surface upload-progress events
// (the Streams-API extension is still
// implementation-specific), so the canonical pattern
// for "show the operator how far along the upload
// is" remains XMLHttpRequest. This module wraps the
// XHR boilerplate behind a typed `uploadFile()` /
// `uploadFiles()` surface so adopters (Snapshots
// upload, Templates import, future Specialists
// asset upload) all share one pipeline.
//
// Pairs with `components/ui/file-drop.tsx`
// (11.270 / 11.352 -- progress prop + thumbnails).
// The dropzone holds the file objects + emits
// `onAdd`; the host wires `onAdd` to this module
// and forwards the `onProgress` callback back into
// the dropzone's `progress` prop.

export interface UploadFileOptions {
  // POST endpoint. Caller resolves the path
  // (typically through `lib/api`).
  url: string;
  // The file to send. The body becomes a
  // FormData with the file under `field`.
  file: File;
  // FormData field name. Defaults to 'file'.
  field?: string;
  // HTTP method. Defaults to 'POST'.
  method?: 'POST' | 'PUT' | 'PATCH';
  // Extra request headers (e.g. Authorization).
  headers?: Record<string, string>;
  // Extra FormData entries appended alongside
  // the file. Use this for tags / labels /
  // upload metadata.
  fields?: Record<string, string>;
  // Progress callback. `loaded` / `total` track
  // bytes transferred; `progress` is 0..1 OR
  // `null` when `total` is unknown.
  onProgress?: (progress: UploadProgressEvent) => void;
  // Cancellation signal. Aborts the XHR when
  // fired.
  signal?: AbortSignal;
  // Per-attempt timeout in ms. 0 disables. The
  // XHR is aborted if no progress event lands in
  // this window. Default 0 (no timeout).
  timeoutMs?: number;
  // Optional response parser. Receives the raw
  // response text and returns either the parsed
  // payload or a thrown error. Defaults to
  // JSON.parse (returns null on empty body).
  parseResponse?: (raw: string, status: number) => unknown;
}

export interface UploadProgressEvent {
  loaded: number;
  total: number | null;
  progress: number | null;
}

export interface UploadResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

const ABORT_ERROR = 'aborted';
const TIMEOUT_ERROR = 'timeout';

function defaultParser(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function uploadFile<T = unknown>(
  options: UploadFileOptions,
): Promise<UploadResult<T>> {
  return new Promise<UploadResult<T>>((resolve) => {
    const {
      url,
      file,
      field = 'file',
      method = 'POST',
      headers = {},
      fields = {},
      onProgress,
      signal,
      timeoutMs = 0,
      parseResponse = defaultParser,
    } = options;

    const form = new FormData();
    form.append(field, file, file.name);
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }

    const xhr = new XMLHttpRequest();
    let settled = false;

    const finalize = (result: UploadResult<T>): void => {
      if (settled) return;
      settled = true;
      if (signal && abortListener) {
        try {
          signal.removeEventListener('abort', abortListener);
        } catch {
          // ignore
        }
      }
      resolve(result);
    };

    const abortListener = (): void => {
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      finalize({
        ok: false,
        status: 0,
        data: null,
        error: ABORT_ERROR,
      });
    };

    if (signal) {
      if (signal.aborted) {
        finalize({
          ok: false,
          status: 0,
          data: null,
          error: ABORT_ERROR,
        });
        return;
      }
      signal.addEventListener('abort', abortListener);
    }

    xhr.open(method, url, true);
    for (const [name, value] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(name, value);
      } catch {
        // setRequestHeader can throw on Forbidden
        // header names -- ignore so the rest of
        // the upload proceeds.
      }
    }

    if (timeoutMs > 0) {
      xhr.timeout = timeoutMs;
    }

    if (onProgress) {
      // The upload-side progress event reports
      // bytes sent; that is what the operator
      // wants to see while the network ship is
      // out.
      xhr.upload.addEventListener('progress', (evt) => {
        const total = evt.lengthComputable ? evt.total : null;
        const progress =
          total != null && total > 0
            ? Math.min(1, Math.max(0, evt.loaded / total))
            : null;
        onProgress({ loaded: evt.loaded, total, progress });
      });
    }

    xhr.addEventListener('load', () => {
      const status = xhr.status;
      const raw = xhr.responseText ?? '';
      let data: T | null = null;
      let error: string | null = null;
      try {
        data = parseResponse(raw, status) as T;
      } catch (e) {
        error = e instanceof Error ? e.message : 'parse-error';
      }
      const ok = status >= 200 && status < 300 && error == null;
      finalize({ ok, status, data: ok ? data : null, error: ok ? null : (error ?? `status ${status}`) });
    });

    xhr.addEventListener('error', () => {
      finalize({
        ok: false,
        status: xhr.status || 0,
        data: null,
        error: 'network-error',
      });
    });

    xhr.addEventListener('timeout', () => {
      finalize({
        ok: false,
        status: 0,
        data: null,
        error: TIMEOUT_ERROR,
      });
    });

    xhr.addEventListener('abort', () => {
      finalize({
        ok: false,
        status: 0,
        data: null,
        error: ABORT_ERROR,
      });
    });

    try {
      xhr.send(form);
    } catch (e) {
      finalize({
        ok: false,
        status: 0,
        data: null,
        error: e instanceof Error ? e.message : 'send-error',
      });
    }
  });
}

export interface UploadFilesOptions extends Omit<UploadFileOptions, 'file' | 'onProgress'> {
  files: readonly File[];
  // Per-file progress callback. Receives the
  // current file index alongside the standard
  // progress event.
  onProgress?: (
    progress: UploadProgressEvent & { index: number; file: File },
  ) => void;
  // Per-file completion callback. Useful for
  // appending each result to a UI list as the
  // batch progresses.
  onResult?: (result: UploadResult, index: number, file: File) => void;
  // Stop the batch on the first failure. Default
  // false -- the batch attempts every file and
  // returns all results, so the caller can
  // re-try the failures.
  stopOnError?: boolean;
}

export async function uploadFiles<T = unknown>(
  options: UploadFilesOptions,
): Promise<UploadResult<T>[]> {
  const { files, onProgress, onResult, stopOnError = false, ...rest } = options;
  const out: UploadResult<T>[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    const result = await uploadFile<T>({
      ...rest,
      file,
      ...(onProgress
        ? {
            onProgress: (evt) => {
              onProgress({ ...evt, index: i, file });
            },
          }
        : {}),
    });
    out.push(result);
    if (onResult) onResult(result, i, file);
    if (stopOnError && !result.ok) break;
  }
  return out;
}

// ---- Validation -------------------------------------------------

export interface ValidateFileOptions {
  // Comma-separated `accept` string (mirrors the
  // HTML input attribute). e.g.
  // `'.json,.zip,application/json'`.
  accept?: string;
  // Maximum byte size; null/undefined disables
  // the check.
  maxSize?: number | null;
}

export interface ValidateFileResult {
  ok: boolean;
  reason?: 'unaccepted-type' | 'too-large';
}

export function validateFile(
  file: File,
  options: ValidateFileOptions = {},
): ValidateFileResult {
  const { accept, maxSize } = options;
  if (accept) {
    const parts = accept
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length > 0) {
      const fileType = (file.type || '').toLowerCase();
      const fileName = file.name.toLowerCase();
      const matches = parts.some((p) => {
        if (p.startsWith('.')) return fileName.endsWith(p);
        if (p.endsWith('/*')) {
          const prefix = p.slice(0, -1);
          return fileType.startsWith(prefix);
        }
        return fileType === p;
      });
      if (!matches) return { ok: false, reason: 'unaccepted-type' };
    }
  }
  if (typeof maxSize === 'number' && maxSize > 0 && file.size > maxSize) {
    return { ok: false, reason: 'too-large' };
  }
  return { ok: true };
}
