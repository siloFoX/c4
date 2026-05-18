import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateWaitingServiceWorker,
  attachUpdateListener,
  registerServiceWorker,
  resetServiceWorkerRegistrationForTests,
} from './sw-register';

interface FakeWorker {
  state: ServiceWorker['state'];
  listeners: Record<string, ((ev: Event) => void)[]>;
  addEventListener: (type: string, cb: (ev: Event) => void) => void;
  postMessage: ReturnType<typeof vi.fn>;
  setState: (next: ServiceWorker['state']) => void;
}

function makeWorker(state: ServiceWorker['state'] = 'installing'): FakeWorker {
  const listeners: Record<string, ((ev: Event) => void)[]> = {};
  return {
    state,
    listeners,
    addEventListener(type: string, cb: (ev: Event) => void) {
      (listeners[type] ??= []).push(cb);
    },
    postMessage: vi.fn(),
    setState(next: ServiceWorker['state']) {
      this.state = next;
      for (const fn of listeners['statechange'] ?? []) {
        fn(new Event('statechange'));
      }
    },
  };
}

interface FakeRegistration {
  installing: FakeWorker | null;
  waiting: FakeWorker | null;
  listeners: Record<string, ((ev: Event) => void)[]>;
  addEventListener: (type: string, cb: (ev: Event) => void) => void;
  fireUpdateFound: () => void;
}

function makeRegistration(): FakeRegistration {
  const listeners: Record<string, ((ev: Event) => void)[]> = {};
  return {
    installing: null,
    waiting: null,
    listeners,
    addEventListener(type: string, cb: (ev: Event) => void) {
      (listeners[type] ??= []).push(cb);
    },
    fireUpdateFound() {
      for (const fn of listeners['updatefound'] ?? []) fn(new Event('updatefound'));
    },
  };
}

afterEach(() => {
  resetServiceWorkerRegistrationForTests();
  vi.unstubAllGlobals();
});

describe('registerServiceWorker', () => {
  it('skips registration when disabled is true', async () => {
    const result = await registerServiceWorker({ disabled: true });
    expect(result.registered).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('returns unsupported when navigator.serviceWorker is missing', async () => {
    const fakeNavigator = {} as Navigator;
    vi.stubGlobal('navigator', fakeNavigator);
    const result = await registerServiceWorker();
    expect(result.registered).toBe(false);
    expect(result.reason).toBe('unsupported');
  });

  it('registers when the SW container is present', async () => {
    const registration = makeRegistration();
    const register = vi.fn().mockResolvedValue(registration);
    const fakeNavigator = {
      serviceWorker: { register, controller: null },
    } as unknown as Navigator;
    vi.stubGlobal('navigator', fakeNavigator);
    const result = await registerServiceWorker({ scriptUrl: '/sw.js', scope: '/' });
    expect(result.registered).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(result.registration).toBe(registration);
  });

  it('is idempotent: a second call returns the same in-flight result', async () => {
    const registration = makeRegistration();
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal('navigator', {
      serviceWorker: { register, controller: null },
    } as unknown as Navigator);
    const a = registerServiceWorker();
    const b = registerServiceWorker();
    const [ra, rb] = await Promise.all([a, b]);
    expect(register).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
  });

  it('reports the error via onError and returns reason=error', async () => {
    const onError = vi.fn();
    const err = new Error('install rejected');
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: vi.fn().mockRejectedValue(err),
        controller: null,
      },
    } as unknown as Navigator);
    const result = await registerServiceWorker({ onError });
    expect(result.registered).toBe(false);
    expect(result.reason).toBe('error');
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('suppresses errors thrown by the host onError callback', async () => {
    const onError = vi.fn().mockImplementation(() => {
      throw new Error('boom-in-host');
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: vi.fn().mockRejectedValue(new Error('reg-err')),
        controller: null,
      },
    } as unknown as Navigator);
    const result = await registerServiceWorker({ onError });
    expect(result.registered).toBe(false);
    expect(result.reason).toBe('error');
  });
});

describe('attachUpdateListener', () => {
  it('fires when an installing worker reaches "installed" and a controller exists', () => {
    const registration = makeRegistration();
    const worker = makeWorker('installing');
    registration.installing = worker;
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: { state: 'activated' } },
    } as unknown as Navigator);
    const onUpdate = vi.fn();
    attachUpdateListener(
      registration as unknown as ServiceWorkerRegistration,
      onUpdate,
    );
    worker.setState('installed');
    expect(onUpdate).toHaveBeenCalledWith(registration);
  });

  it('does NOT fire on first install (no existing controller)', () => {
    const registration = makeRegistration();
    const worker = makeWorker('installing');
    registration.installing = worker;
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: null },
    } as unknown as Navigator);
    const onUpdate = vi.fn();
    attachUpdateListener(
      registration as unknown as ServiceWorkerRegistration,
      onUpdate,
    );
    worker.setState('installed');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reattaches to a new installing worker via updatefound', () => {
    const registration = makeRegistration();
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: { state: 'activated' } },
    } as unknown as Navigator);
    const onUpdate = vi.fn();
    attachUpdateListener(
      registration as unknown as ServiceWorkerRegistration,
      onUpdate,
    );
    const next = makeWorker('installing');
    registration.installing = next;
    registration.fireUpdateFound();
    next.setState('installed');
    expect(onUpdate).toHaveBeenCalled();
  });

  it('skips when there is no installing worker yet', () => {
    const registration = makeRegistration();
    const onUpdate = vi.fn();
    expect(() =>
      attachUpdateListener(
        registration as unknown as ServiceWorkerRegistration,
        onUpdate,
      ),
    ).not.toThrow();
  });
});

describe('activateWaitingServiceWorker', () => {
  it('posts SKIP_WAITING to a waiting worker', () => {
    const registration = makeRegistration();
    const waiting = makeWorker('installed');
    registration.waiting = waiting;
    const fired = activateWaitingServiceWorker(
      registration as unknown as ServiceWorkerRegistration,
    );
    expect(fired).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('returns false when no worker is waiting', () => {
    const registration = makeRegistration();
    expect(
      activateWaitingServiceWorker(
        registration as unknown as ServiceWorkerRegistration,
      ),
    ).toBe(false);
  });
});
