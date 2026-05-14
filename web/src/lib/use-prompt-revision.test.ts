import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { usePromptRevision, type ApplyResult } from './use-prompt-revision';

// usePromptRevision owns the two-step revision flow for a specialist:
//   1. handleSuggest POSTs /api/specialists/:id/suggest-prompt and surfaces
//      a read-only revision + rationale.
//   2. handleApply POSTs /api/specialists/:id/prompt-apply behind a
//      window.confirm and replaces the systemPrompt on accepted consensus.
// Specialist id change resets all four result fields so stale results from
// specialist A do not leak into B. Busy flags gate concurrent clicks.

afterEach(() => {
  vi.restoreAllMocks();
});

function makeApplyResult(overrides: Partial<ApplyResult> = {}): ApplyResult {
  return {
    specialistId: 'spec-1',
    meetingId: 'm-9',
    decision: {
      accepted: true,
      accepts: ['a', 'b'],
      objects: [],
      missing: [],
      reason: null,
    },
    applied: true,
    suggestion: { revision: 'r', rationale: 'why' },
    sessionStatus: 'committed',
    ...overrides,
  };
}

describe('usePromptRevision', () => {
  it('starts idle: all flags false, all panels null', () => {
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    expect(result.current.suggestBusy).toBe(false);
    expect(result.current.suggestion).toBeNull();
    expect(result.current.suggestError).toBeNull();
    expect(result.current.applyBusy).toBe(false);
    expect(result.current.applyResult).toBeNull();
    expect(result.current.applyError).toBeNull();
    expect(typeof result.current.handleSuggest).toBe('function');
    expect(typeof result.current.handleApply).toBe('function');
  });

  it('handleSuggest POSTs to the encoded specialist URL with brain=mock and stores revision/rationale', async () => {
    let capturedBody: unknown = null;
    let capturedUrl = '';
    server.use(
      http.post(
        '/api/specialists/:id/suggest-prompt',
        async ({ request }) => {
          capturedUrl = new URL(request.url).pathname;
          capturedBody = await request.json();
          return HttpResponse.json({
            revision: 'You are a careful reviewer.',
            rationale: 'Tone was off.',
          });
        },
      ),
    );
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec/with space' }),
    );
    await act(async () => {
      await result.current.handleSuggest();
    });
    expect(capturedUrl).toBe('/api/specialists/spec%2Fwith%20space/suggest-prompt');
    expect(capturedBody).toEqual({ brain: 'mock' });
    expect(result.current.suggestion).toEqual({
      revision: 'You are a careful reviewer.',
      rationale: 'Tone was off.',
    });
    expect(result.current.suggestError).toBeNull();
    expect(result.current.suggestBusy).toBe(false);
  });

  it('handleSuggest flips suggestBusy true while inflight and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/specialists/:id/suggest-prompt', async () => {
        await gate;
        return HttpResponse.json({ revision: 'r', rationale: 'why' });
      }),
    );
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.handleSuggest();
    });
    await waitFor(() => {
      expect(result.current.suggestBusy).toBe(true);
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.suggestBusy).toBe(false);
  });

  it('handleSuggest error path: surfaces error message and suggestion stays null', async () => {
    server.use(
      http.post('/api/specialists/:id/suggest-prompt', () =>
        HttpResponse.json({ error: 'brain dead' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleSuggest();
    });
    expect(result.current.suggestion).toBeNull();
    expect(result.current.suggestError).toMatch(/HTTP 500/);
    expect(result.current.suggestBusy).toBe(false);
  });

  it('handleSuggest with an empty error message falls back to the common.suggestFailed i18n key', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error(''));
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleSuggest();
    });
    expect(result.current.suggestError).toBe('Suggest failed');
    spy.mockRestore();
  });

  it('handleApply short-circuits when window.confirm returns false (no POST, applyBusy stays false)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/specialists/:id/prompt-apply', () => {
        calls++;
        return HttpResponse.json(makeApplyResult());
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleApply();
    });
    expect(calls).toBe(0);
    expect(result.current.applyBusy).toBe(false);
    expect(result.current.applyResult).toBeNull();
    expect(result.current.applyError).toBeNull();
  });

  it('handleApply happy path POSTs brain=mock + autoApply=true and stores the ApplyResult', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(
        '/api/specialists/:id/prompt-apply',
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(makeApplyResult({ applied: true }));
        },
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleApply();
    });
    expect(capturedBody).toEqual({ brain: 'mock', autoApply: true });
    expect(result.current.applyResult?.applied).toBe(true);
    expect(result.current.applyResult?.specialistId).toBe('spec-1');
    expect(result.current.applyError).toBeNull();
    expect(result.current.applyBusy).toBe(false);
  });

  it('handleApply flips applyBusy true while inflight and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/specialists/:id/prompt-apply', async () => {
        await gate;
        return HttpResponse.json(makeApplyResult());
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.handleApply();
    });
    await waitFor(() => {
      expect(result.current.applyBusy).toBe(true);
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.applyBusy).toBe(false);
  });

  it('handleApply error path: surfaces error message and applyResult stays null', async () => {
    server.use(
      http.post('/api/specialists/:id/prompt-apply', () =>
        HttpResponse.json({ error: 'no consensus' }, { status: 422 }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleApply();
    });
    expect(result.current.applyResult).toBeNull();
    expect(result.current.applyError).toMatch(/HTTP 422/);
    expect(result.current.applyBusy).toBe(false);
  });

  it('handleApply with an empty error message falls back to the common.applyFailed i18n key', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error(''));
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleApply();
    });
    expect(result.current.applyError).toBe('Apply failed');
    spy.mockRestore();
  });

  it('specialistId change resets all four result panels (suggestion, suggestError, applyResult, applyError)', async () => {
    server.use(
      http.post('/api/specialists/:id/suggest-prompt', () =>
        HttpResponse.json({ revision: 'r', rationale: 'why' }),
      ),
      http.post('/api/specialists/:id/prompt-apply', () =>
        HttpResponse.json(makeApplyResult()),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result, rerender } = renderHook(
      ({ specialistId }: { specialistId: string }) =>
        usePromptRevision({ specialistId }),
      { initialProps: { specialistId: 'spec-A' } },
    );
    await act(async () => {
      await result.current.handleSuggest();
    });
    await act(async () => {
      await result.current.handleApply();
    });
    expect(result.current.suggestion).not.toBeNull();
    expect(result.current.applyResult).not.toBeNull();
    rerender({ specialistId: 'spec-B' });
    expect(result.current.suggestion).toBeNull();
    expect(result.current.suggestError).toBeNull();
    expect(result.current.applyResult).toBeNull();
    expect(result.current.applyError).toBeNull();
  });

  it('handleSuggest clears previous suggestError on the next call (re-enter happy path)', async () => {
    let attempt = 0;
    server.use(
      http.post('/api/specialists/:id/suggest-prompt', () => {
        attempt++;
        if (attempt === 1) {
          return HttpResponse.json({ error: 'oops' }, { status: 500 });
        }
        return HttpResponse.json({ revision: 'r2', rationale: 'why2' });
      }),
    );
    const { result } = renderHook(() =>
      usePromptRevision({ specialistId: 'spec-1' }),
    );
    await act(async () => {
      await result.current.handleSuggest();
    });
    expect(result.current.suggestError).toMatch(/HTTP 500/);
    await act(async () => {
      await result.current.handleSuggest();
    });
    expect(result.current.suggestError).toBeNull();
    expect(result.current.suggestion?.revision).toBe('r2');
  });

  it('callback identity is tied to specialistId: handleSuggest/handleApply change when specialistId changes', () => {
    const { result, rerender } = renderHook(
      ({ specialistId }: { specialistId: string }) =>
        usePromptRevision({ specialistId }),
      { initialProps: { specialistId: 'spec-1' } },
    );
    const firstSuggest = result.current.handleSuggest;
    const firstApply = result.current.handleApply;
    rerender({ specialistId: 'spec-1' });
    expect(result.current.handleSuggest).toBe(firstSuggest);
    expect(result.current.handleApply).toBe(firstApply);
    rerender({ specialistId: 'spec-2' });
    expect(result.current.handleSuggest).not.toBe(firstSuggest);
    expect(result.current.handleApply).not.toBe(firstApply);
  });
});
