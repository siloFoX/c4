// Session auth client (8.14).
//
// Stores the JWT in localStorage, attaches it to every /api/* request as
// Authorization: Bearer <token>, and redirects to the login page on 401.
// All components should import apiFetch / apiPost / apiGet from here
// instead of calling fetch directly so the token is attached consistently
// and 401 handling stays in one place.

const TOKEN_KEY = 'c4.authToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private-mode browsers may throw — nothing to do.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// Emitted when a request comes back 401 so App.tsx can flip to the
// login screen without prop-drilling through every component.
export const AUTH_EVENT = 'c4:auth-expired';

function notifyAuthExpired(): void {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    notifyAuthExpired();
  }
  return res;
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Builds an EventSource URL with the token attached as ?token=... since
// EventSource cannot set custom headers.
export function eventSourceUrl(path: string): string {
  const token = getToken();
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

export interface LoginResponse {
  token?: string;
  user?: string;
  error?: string;
}

export async function login(user: string, password: string): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  const data = (await res.json().catch(() => ({}))) as LoginResponse;
  if (res.ok && data.token) {
    setToken(data.token);
    return data;
  }
  return { error: data.error || `HTTP ${res.status}` };
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Stateless JWT logout — ignore network error.
  }
  clearToken();
  notifyAuthExpired();
}

export interface AuthStatus {
  enabled: boolean;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch('/api/auth/status');
    if (!res.ok) return { enabled: false };
    const data = (await res.json()) as AuthStatus;
    return { enabled: Boolean(data.enabled) };
  } catch {
    return { enabled: false };
  }
}
