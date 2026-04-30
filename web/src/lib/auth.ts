// 10.1 Web UI auth glue.
// - Stores JWT-like token in localStorage.
// - Wraps `fetch` so every Web UI request adds Authorization: Bearer <token>.
// - Detects 401 globally and clears the token (forcing the login screen).

const TOKEN_KEY = 'c4.token';
const ROLE_KEY  = 'c4.role';
const USER_KEY  = 'c4.user';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getRole(): string | null {
  try { return localStorage.getItem(ROLE_KEY); } catch { return null; }
}

export function getUser(): string | null {
  try { return localStorage.getItem(USER_KEY); } catch { return null; }
}

export function setSession(token: string, role: string, user: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
    localStorage.setItem(USER_KEY, user);
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

// Replace global fetch once at app boot. Idempotent.
let installed = false;
const onUnauthorizedSubs: Array<() => void> = [];

export function installAuthFetch() {
  if (installed) return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const token = getToken();
    if (!token) return orig(input, init);
    const headers = new Headers(init.headers || {});
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    const res = await orig(input, { ...init, headers });
    if (res.status === 401) {
      clearSession();
      onUnauthorizedSubs.forEach((fn) => { try { fn(); } catch {} });
    }
    return res;
  };
}

export function onUnauthorized(fn: () => void): () => void {
  onUnauthorizedSubs.push(fn);
  return () => {
    const i = onUnauthorizedSubs.indexOf(fn);
    if (i >= 0) onUnauthorizedSubs.splice(i, 1);
  };
}

export async function login(username: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) return { error: data.error || `HTTP ${res.status}` };
  if (data.token) setSession(data.token, data.role || 'viewer', username);
  return data;
}

export async function whoami() {
  try {
    const res = await fetch('/api/auth/whoami');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Probe if auth is enabled by trying a privileged GET; 401 → login required.
export async function authEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/list', { method: 'GET' });
    return res.status === 401;
  } catch { return false; }
}
