import { apiFetch } from './api';

// (v1.10.740) Extracted from ControlPanel. Posts to
// any /api/<endpoint> with a JSON body and returns
// `{ ok, error? }` after handling three failure
// modes uniformly:
//   1. Network throw (offline, DNS, etc.) → ok=false
//      with the Error message.
//   2. HTTP non-2xx → ok=false. If the body parses
//      to JSON `{ error }`, surface that string;
//      otherwise fall back to `HTTP <status>`.
//   3. HTTP 2xx but body has `error` set → ok=false
//      with that message. The daemon emits 200+error
//      for some no-op cases (already-paused, etc.).
//
// Used by useControlPanelSingle + useWorkerSelection
// to keep the per-action and batch paths reading the
// same shape so the toast layer doesn't have to
// branch on which hook fired.

export interface PostActionResult {
  ok: boolean;
  error?: string;
}

export async function postAction(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<PostActionResult> {
  try {
    const res = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // ignore non-JSON response bodies; HTTP status still tells us ok
    }
    if (!res.ok) {
      const err =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      (payload as { error: unknown }).error
    ) {
      return { ok: false, error: String((payload as { error: unknown }).error) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
