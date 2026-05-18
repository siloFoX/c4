import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  uploadFile,
  uploadFiles,
  validateFile,
  type UploadFileOptions,
} from './file-upload';

// (v1.11.370, TODO 11.352) Mock XMLHttpRequest so
// the unit tests drive the lifecycle directly:
// open / setRequestHeader / send / abort, plus
// upload-progress, load, error, and timeout
// events.

interface FakeXhrEvent {
  type: string;
  loaded?: number;
  total?: number;
  lengthComputable?: boolean;
}

class FakeXhr {
  static last: FakeXhr | null = null;
  static instances: FakeXhr[] = [];
  method = 'GET';
  url = '';
  async_ = true;
  headers: Record<string, string> = {};
  status = 0;
  responseText = '';
  timeout = 0;
  upload = {
    listeners: new Map<string, ((e: FakeXhrEvent) => void)[]>(),
    addEventListener(type: string, cb: (e: FakeXhrEvent) => void) {
      const arr = this.listeners.get(type) ?? [];
      arr.push(cb);
      this.listeners.set(type, arr);
    },
    fire(type: string, e: FakeXhrEvent) {
      for (const cb of this.listeners.get(type) ?? []) cb(e);
    },
  };
  listeners = new Map<string, ((e?: FakeXhrEvent) => void)[]>();
  sent = false;
  aborted = false;
  body: unknown = null;

  constructor() {
    FakeXhr.last = this;
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string, async_ = true): void {
    this.method = method;
    this.url = url;
    this.async_ = async_;
  }
  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }
  addEventListener(type: string, cb: (e?: FakeXhrEvent) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  send(body: unknown): void {
    this.sent = true;
    this.body = body;
  }
  abort(): void {
    this.aborted = true;
    this.fire('abort');
  }

  // Test-only triggers.
  fireProgress(loaded: number, total: number, lengthComputable = true): void {
    this.upload.fire('progress', { type: 'progress', loaded, total, lengthComputable });
  }
  fireLoad(status: number, responseText: string): void {
    this.status = status;
    this.responseText = responseText;
    this.fire('load');
  }
  fireError(): void {
    this.fire('error');
  }
  fireTimeout(): void {
    this.fire('timeout');
  }
  fire(type: string): void {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }
}

beforeEach(() => {
  FakeXhr.last = null;
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeFile(name = 'a.txt', body = 'hello', type = 'text/plain'): File {
  return new File([body], name, { type });
}

function baseOptions(extra: Partial<UploadFileOptions> = {}): UploadFileOptions {
  return {
    url: '/api/upload',
    file: makeFile(),
    ...extra,
  };
}

describe('uploadFile', () => {
  it('opens a POST to the URL and sends a FormData body with the file', async () => {
    const promise = uploadFile(baseOptions());
    // Async fire-and-resolve: invoke the load
    // event on the mock to settle the promise.
    expect(FakeXhr.last).not.toBeNull();
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/upload');
    expect(xhr.sent).toBe(true);
    expect(xhr.body).toBeInstanceOf(FormData);
    xhr.fireLoad(200, '{"ok":true}');
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ ok: true });
  });

  it('reports upload progress through onProgress', async () => {
    const onProgress = vi.fn();
    const promise = uploadFile(baseOptions({ onProgress }));
    const xhr = FakeXhr.last as FakeXhr;
    xhr.fireProgress(50, 100, true);
    xhr.fireProgress(100, 100, true);
    xhr.fireLoad(200, '');
    await promise;
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      loaded: 50,
      total: 100,
      progress: 0.5,
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      loaded: 100,
      total: 100,
      progress: 1,
    });
  });

  it('reports progress=null when length is not computable', async () => {
    const onProgress = vi.fn();
    const promise = uploadFile(baseOptions({ onProgress }));
    const xhr = FakeXhr.last as FakeXhr;
    xhr.fireProgress(42, 0, false);
    xhr.fireLoad(200, '');
    await promise;
    const arg = onProgress.mock.calls[0]?.[0];
    expect(arg.total).toBeNull();
    expect(arg.progress).toBeNull();
  });

  it('returns ok=false with status when the server returns 5xx', async () => {
    const promise = uploadFile(baseOptions());
    const xhr = FakeXhr.last as FakeXhr;
    xhr.fireLoad(500, '{"error":"boom"}');
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBe('status 500');
    expect(result.data).toBeNull();
  });

  it('returns ok=false with network-error on transport failure', async () => {
    const promise = uploadFile(baseOptions());
    const xhr = FakeXhr.last as FakeXhr;
    xhr.fireError();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network-error');
  });

  it('aborts cleanly when the AbortSignal fires', async () => {
    const controller = new AbortController();
    const promise = uploadFile(baseOptions({ signal: controller.signal }));
    controller.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('aborted');
    expect((FakeXhr.last as FakeXhr).aborted).toBe(true);
  });

  it('resolves immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await uploadFile(
      baseOptions({ signal: controller.signal }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('aborted');
  });

  it('forwards custom headers + extra form fields', async () => {
    const promise = uploadFile(
      baseOptions({
        headers: { Authorization: 'Bearer x' },
        fields: { label: 'my-snapshot' },
      }),
    );
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.headers['Authorization']).toBe('Bearer x');
    const form = xhr.body as FormData;
    expect(form.get('label')).toBe('my-snapshot');
    xhr.fireLoad(200, '');
    await promise;
  });

  it('returns ok=false with timeout when the XHR times out', async () => {
    const promise = uploadFile(baseOptions({ timeoutMs: 5000 }));
    const xhr = FakeXhr.last as FakeXhr;
    expect(xhr.timeout).toBe(5000);
    xhr.fireTimeout();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout');
  });

  it('uses a custom parseResponse when supplied', async () => {
    const promise = uploadFile(
      baseOptions({
        parseResponse: (raw) => ({ raw }),
      }),
    );
    const xhr = FakeXhr.last as FakeXhr;
    xhr.fireLoad(200, 'pong');
    const result = await promise;
    expect(result.data).toEqual({ raw: 'pong' });
  });
});

describe('uploadFiles', () => {
  it('uploads each file sequentially and returns an array of results', async () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const promise = uploadFiles({ url: '/api/u', files });
    // Each iteration creates a fresh XHR; settle
    // them in order.
    for (let i = 0; i < files.length; i++) {
      // Wait a microtask so the next XHR mounts.
      await Promise.resolve();
      await Promise.resolve();
      const xhr = FakeXhr.last as FakeXhr;
      xhr.fireLoad(200, JSON.stringify({ i }));
    }
    const results = await promise;
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('annotates onProgress with the file index', async () => {
    const onProgress = vi.fn();
    const files = [makeFile('a'), makeFile('b')];
    const promise = uploadFiles({ url: '/api/u', files, onProgress });
    for (let i = 0; i < files.length; i++) {
      await Promise.resolve();
      await Promise.resolve();
      const xhr = FakeXhr.last as FakeXhr;
      xhr.fireProgress(10, 20, true);
      xhr.fireLoad(200, '');
    }
    await promise;
    const indices = onProgress.mock.calls.map((c) => c[0].index);
    expect(indices).toEqual([0, 1]);
  });

  it('stops on the first failure when stopOnError is true', async () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const promise = uploadFiles({
      url: '/api/u',
      files,
      stopOnError: true,
    });
    await Promise.resolve();
    await Promise.resolve();
    (FakeXhr.last as FakeXhr).fireLoad(500, '');
    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
  });
});

describe('validateFile', () => {
  const big = new File([new Uint8Array(100)], 'big.bin', {
    type: 'application/octet-stream',
  });

  it('accepts when there is no accept / maxSize', () => {
    expect(validateFile(big).ok).toBe(true);
  });

  it('rejects on size limit', () => {
    const r = validateFile(big, { maxSize: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-large');
  });

  it('accepts a matching extension', () => {
    expect(
      validateFile(big, { accept: '.bin,.zip' }).ok,
    ).toBe(true);
  });

  it('rejects a non-matching extension', () => {
    const r = validateFile(big, { accept: '.json' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unaccepted-type');
  });

  it('matches MIME with wildcards (image/*)', () => {
    const img = new File([new Uint8Array(1)], 'a.png', { type: 'image/png' });
    expect(validateFile(img, { accept: 'image/*' }).ok).toBe(true);
  });

  it('matches exact MIME (application/json)', () => {
    const j = new File([new Uint8Array(1)], 'a', { type: 'application/json' });
    expect(validateFile(j, { accept: 'application/json' }).ok).toBe(true);
  });

  it('skips size check when maxSize is null', () => {
    expect(validateFile(big, { maxSize: null }).ok).toBe(true);
  });
});
