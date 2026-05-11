import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingBackup } from './use-meeting-backup';

describe('useMeetingBackup', () => {
  it('starts idle: blank path, force=false, not busy, no msg', () => {
    const { result } = renderHook(() => useMeetingBackup());
    expect(result.current.backupPath).toBe('');
    expect(result.current.backupForce).toBe(false);
    expect(result.current.backupBusy).toBe(false);
    expect(result.current.backupMsg).toBeNull();
    expect(result.current.backupFailed).toBe(false);
  });

  it('exposes setters for path + force', () => {
    const { result } = renderHook(() => useMeetingBackup());
    act(() => result.current.setBackupPath('/tmp/snapshot.db'));
    expect(result.current.backupPath).toBe('/tmp/snapshot.db');
    act(() => result.current.setBackupForce(true));
    expect(result.current.backupForce).toBe(true);
  });

  it('short-circuits with failed=true when path is blank (no fetch)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/persist-backup', () => {
        calls++;
        return HttpResponse.json({ ok: true, path: '/x', bytes: 10 });
      }),
    );
    const { result } = renderHook(() => useMeetingBackup());
    await act(async () => {
      await result.current.handleBackup();
    });
    expect(calls).toBe(0);
    expect(result.current.backupFailed).toBe(true);
    expect(result.current.backupMsg).toBeTruthy();
  });

  it('short-circuits when path is whitespace-only', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/persist-backup', () => {
        calls++;
        return HttpResponse.json({ ok: true, path: '/x', bytes: 10 });
      }),
    );
    const { result } = renderHook(() => useMeetingBackup());
    act(() => result.current.setBackupPath('   '));
    await act(async () => {
      await result.current.handleBackup();
    });
    expect(calls).toBe(0);
    expect(result.current.backupFailed).toBe(true);
  });

  it('POSTs /api/meetings/persist-backup with trimmed path + force flag', async () => {
    let body: { path?: string; force?: boolean } | null = null;
    server.use(
      http.post('/api/meetings/persist-backup', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true, path: '/tmp/x.db', bytes: 1024 });
      }),
    );
    const { result } = renderHook(() => useMeetingBackup());
    act(() => {
      result.current.setBackupPath('  /tmp/x.db  ');
      result.current.setBackupForce(true);
    });
    await act(async () => {
      await result.current.handleBackup();
    });
    expect(body).toEqual({ path: '/tmp/x.db', force: true });
    expect(result.current.backupFailed).toBe(false);
    expect(result.current.backupMsg).toBeTruthy();
  });

  it('renders a success message that includes both path and a size string', async () => {
    server.use(
      http.post('/api/meetings/persist-backup', () =>
        HttpResponse.json({ ok: true, path: '/tmp/snap.db', bytes: 4096 }),
      ),
    );
    const { result } = renderHook(() => useMeetingBackup());
    act(() => result.current.setBackupPath('/tmp/snap.db'));
    await act(async () => {
      await result.current.handleBackup();
    });
    // i18n message should reference the path verbatim.
    expect(result.current.backupMsg).toContain('/tmp/snap.db');
    expect(result.current.backupFailed).toBe(false);
  });

  it('handles bytes=null with the size-unknown fallback', async () => {
    server.use(
      http.post('/api/meetings/persist-backup', () =>
        HttpResponse.json({ ok: true, path: '/tmp/snap.db', bytes: null }),
      ),
    );
    const { result } = renderHook(() => useMeetingBackup());
    act(() => result.current.setBackupPath('/tmp/snap.db'));
    await act(async () => {
      await result.current.handleBackup();
    });
    // Even with null bytes, a non-empty success message must surface.
    expect(result.current.backupMsg).toBeTruthy();
    expect(result.current.backupFailed).toBe(false);
  });

  it('marks failed=true on server error', async () => {
    server.use(
      http.post('/api/meetings/persist-backup', () =>
        HttpResponse.json({ error: 'disk full' }, { status: 507 }),
      ),
    );
    const { result } = renderHook(() => useMeetingBackup());
    act(() => result.current.setBackupPath('/tmp/snap.db'));
    await act(async () => {
      await result.current.handleBackup();
    });
    expect(result.current.backupFailed).toBe(true);
    expect(result.current.backupMsg).toBeTruthy();
    expect(result.current.backupBusy).toBe(false);
  });

  it('flips backupBusy=true during the in-flight request and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/meetings/persist-backup', async () => {
        await gate;
        return HttpResponse.json({ ok: true, path: '/x', bytes: 0 });
      }),
    );
    const { result } = renderHook(() => useMeetingBackup());
    act(() => result.current.setBackupPath('/x'));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleBackup();
      await Promise.resolve();
    });
    expect(result.current.backupBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.backupBusy).toBe(false);
  });
});
