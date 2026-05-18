// (v1.11.362, TODO 11.344) Service worker
// registration helper.
//
// Call `registerServiceWorker()` once from
// `main.tsx` after the document has parsed. The
// helper:
//
//   - Skips registration in dev (Vite hot-reloads
//     don't compose with SW caching).
//   - Skips registration when the browser does not
//     expose `navigator.serviceWorker` (Safari
//     private windows, locked-down browsers).
//   - Returns the registration object so callers
//     can observe `updatefound` and prompt the user
//     to reload.
//   - Catches registration errors so a broken SW
//     never breaks the app boot. Errors are
//     reported through the optional `onError`
//     callback.
//
// The helper is idempotent: a second call returns
// the same promise so multiple App mounts (HMR,
// tests, multiple bootstraps) do not register the
// worker twice.

export interface RegisterServiceWorkerOptions {
  /**
   * Public URL the browser fetches the SW from.
   * Defaults to `/sw.js` -- Vite copies the built
   * SW to the site root via the build step.
   */
  scriptUrl?: string;
  /**
   * SW scope. Defaults to `/` so the worker
   * controls every navigation.
   */
  scope?: string;
  /**
   * Skip registration entirely (used in dev /
   * tests). Defaults to `false`.
   */
  disabled?: boolean;
  /**
   * Called when an updated SW has installed and is
   * waiting to take over. Hosts typically use this
   * to show an "App update available" banner.
   */
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  /**
   * Called when the registration call rejects or
   * the script fails to install. Defaults to a
   * silent no-op so a broken SW does not break the
   * app boot.
   */
  onError?: (error: unknown) => void;
}

export interface RegisterServiceWorkerResult {
  registered: boolean;
  reason?:
    | 'no-navigator'
    | 'unsupported'
    | 'disabled'
    | 'error'
    | 'already-registered';
  registration?: ServiceWorkerRegistration;
}

let inFlight: Promise<RegisterServiceWorkerResult> | null = null;

export function registerServiceWorker(
  options: RegisterServiceWorkerOptions = {},
): Promise<RegisterServiceWorkerResult> {
  if (inFlight) return inFlight;
  inFlight = doRegister(options);
  return inFlight;
}

export function resetServiceWorkerRegistrationForTests(): void {
  inFlight = null;
}

async function doRegister(
  options: RegisterServiceWorkerOptions,
): Promise<RegisterServiceWorkerResult> {
  const {
    scriptUrl = '/sw.js',
    scope = '/',
    disabled = false,
    onUpdateAvailable,
    onError,
  } = options;

  if (disabled) {
    return { registered: false, reason: 'disabled' };
  }

  if (typeof navigator === 'undefined') {
    return { registered: false, reason: 'no-navigator' };
  }
  const swContainer = (navigator as Navigator).serviceWorker as
    | ServiceWorkerContainer
    | undefined;
  if (!swContainer) {
    return { registered: false, reason: 'unsupported' };
  }

  try {
    const registration = await swContainer.register(scriptUrl, { scope });
    if (onUpdateAvailable) {
      attachUpdateListener(registration, onUpdateAvailable);
    }
    return { registered: true, registration };
  } catch (err) {
    if (onError) {
      try {
        onError(err);
      } catch {
        // Suppress secondary errors from the host
        // callback; we already failed the main
        // registration.
      }
    }
    return { registered: false, reason: 'error' };
  }
}

export function attachUpdateListener(
  registration: ServiceWorkerRegistration,
  onUpdateAvailable: (registration: ServiceWorkerRegistration) => void,
): void {
  const handle = (worker: ServiceWorker | null): void => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker?.controller) {
        onUpdateAvailable(registration);
      }
    });
  };
  handle(registration.installing);
  registration.addEventListener('updatefound', () => {
    handle(registration.installing);
  });
}

// Sends a message to a waiting SW asking it to call
// `skipWaiting()` so the new version takes control
// without a full reload of the user-facing app.
// Pair with `onUpdateAvailable` to wire an "Update
// now" button.
export function activateWaitingServiceWorker(
  registration: ServiceWorkerRegistration,
): boolean {
  const waiting = registration.waiting;
  if (!waiting) return false;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}
