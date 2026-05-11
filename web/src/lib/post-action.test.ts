import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { postAction } from './post-action';

beforeEach(() => {
  window.localStorage.clear();
});

describe('postAction', () => {
  it('returns { ok: true } on a 2xx response with no error field', async () => {
    server.use(
      http.post('/api/control/pause', () => HttpResponse.json({ paused: true })),
    );
    const r = await postAction('/api/control/pause', { name: 'w1' });
    expect(r).toEqual({ ok: true });
  });

  it('forwards the body as JSON', async () => {
    let received: unknown = null;
    server.use(
      http.post('/api/control/pause', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await postAction('/api/control/pause', { name: 'w1', force: true });
    expect(received).toEqual({ name: 'w1', force: true });
  });

  it('reports HTTP non-2xx with the parsed JSON error field', async () => {
    server.use(
      http.post('/api/control/pause', () =>
        HttpResponse.json({ error: 'already paused' }, { status: 409 }),
      ),
    );
    const r = await postAction('/api/control/pause', {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already paused');
  });

  it('falls back to "HTTP <status>" when the error body is not JSON-shaped', async () => {
    server.use(
      http.post('/api/control/pause', () =>
        HttpResponse.text('plain failure', { status: 503 }),
      ),
    );
    const r = await postAction('/api/control/pause', {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('HTTP 503');
  });

  it('treats a 200 + payload.error as failure (daemon no-op convention)', async () => {
    server.use(
      http.post('/api/control/pause', () =>
        HttpResponse.json({ error: 'noop: already paused' }),
      ),
    );
    const r = await postAction('/api/control/pause', {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('noop: already paused');
  });

  it('reports network errors with the thrown Error.message', async () => {
    server.use(
      http.post('/api/control/pause', () => HttpResponse.error()),
    );
    const r = await postAction('/api/control/pause', {});
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error).toBeTruthy();
  });

  it('ignores a 2xx response with no body without flipping ok=false', async () => {
    server.use(
      http.post('/api/control/pause', () => new HttpResponse(null, { status: 204 })),
    );
    const r = await postAction('/api/control/pause', {});
    expect(r).toEqual({ ok: true });
  });
});
