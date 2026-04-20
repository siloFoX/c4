import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GitMerge,
  Minus,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Input,
  Label,
} from './ui';
import { cn } from '../lib/cn';

interface WorkerDetailProps {
  workerName: string;
}

type Tab = 'screen' | 'scrollback';

interface ReadResponse {
  content?: string;
  error?: string;
  status?: string;
  lines?: number;
  totalScrollback?: number;
}

interface ResizeResponse {
  success?: boolean;
  cols?: number;
  rows?: number;
  error?: string;
}

interface ActionResponse {
  error?: string;
  [key: string]: unknown;
}

// 8.13: UI bounds mirror the server-side clamp (src/pty-manager.js
// _clampResizeDims defaults). Keep them in sync if the server defaults change.
const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 5;
const MAX_ROWS = 200;
const MIN_FONT = 9;
const MAX_FONT = 24;
const DEFAULT_FONT = 12;
const DEFAULT_ROWS = 48;

const FONT_STORAGE_KEY = 'c4.term.fontSize';
const FIT_STORAGE_KEY = 'c4.term.autoFit';
const COLS_STORAGE_KEY = 'c4.term.cols';

// 8.22: flip VITE_AUTOFIT_DEBUG=1 in web/.env.local to log every auto-fit
// recompute + the POST /api/resize it produces. Toggle stays wired so future
// terminal auto-fit regressions can be diagnosed without code changes.
const AUTOFIT_DEBUG: boolean = (() => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const v = env?.VITE_AUTOFIT_DEBUG;
    return v === '1' || v === 'true' || v === true;
  } catch {
    return false;
  }
})();

async function postJson(url: string, body: unknown): Promise<ActionResponse> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ActionResponse;
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function readNumberStorage(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readBoolStorage(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === '1' || raw === 'true';
}

export default function WorkerDetail({ workerName }: WorkerDetailProps) {
  const [tab, setTab] = useState<Tab>('screen');
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // Terminal presentation state (8.13).
  const [fontSize, setFontSize] = useState<number>(() =>
    clamp(readNumberStorage(FONT_STORAGE_KEY, DEFAULT_FONT), MIN_FONT, MAX_FONT)
  );
  const [autoFit, setAutoFit] = useState<boolean>(() => readBoolStorage(FIT_STORAGE_KEY, true));
  const [cols, setCols] = useState<number>(() =>
    clamp(readNumberStorage(COLS_STORAGE_KEY, 120), MIN_COLS, MAX_COLS)
  );
  const [serverDims, setServerDims] = useState<{ cols: number; rows: number } | null>(null);

  const preRef = useRef<HTMLPreElement | null>(null);
  const rulerRef = useRef<HTMLSpanElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastRequestedRef = useRef<{ cols: number; rows: number } | null>(null);

  const fetchContent = useCallback(async () => {
    try {
      const url =
        tab === 'screen'
          ? `/api/read-now?name=${encodeURIComponent(workerName)}`
          : `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=200`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReadResponse;
      if (data.error) {
        setError(data.error);
        setContent('');
      } else {
        setContent(typeof data.content === 'string' ? data.content : '');
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, workerName]);

  useEffect(() => {
    setContent('');
    setError(null);
    setActionMsg(null);
    fetchContent();
    const interval = setInterval(fetchContent, 3000);
    return () => clearInterval(interval);
  }, [fetchContent]);

  // Persist presentation prefs.
  useEffect(() => {
    try {
      window.localStorage.setItem(FONT_STORAGE_KEY, String(fontSize));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [fontSize]);
  useEffect(() => {
    try {
      window.localStorage.setItem(FIT_STORAGE_KEY, autoFit ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [autoFit]);
  useEffect(() => {
    try {
      window.localStorage.setItem(COLS_STORAGE_KEY, String(cols));
    } catch {
      /* ignore */
    }
  }, [cols]);

  const requestResize = useCallback(
    async (nextCols: number, nextRows: number) => {
      const c = clamp(nextCols, MIN_COLS, MAX_COLS);
      const r = clamp(nextRows, MIN_ROWS, MAX_ROWS);
      const last = lastRequestedRef.current;
      if (last && last.cols === c && last.rows === r) return;
      lastRequestedRef.current = { cols: c, rows: r };
      if (AUTOFIT_DEBUG) {
        // eslint-disable-next-line no-console
        console.debug('[autofit] cols=%d rows=%d -> POST /api/resize', c, r);
      }
      try {
        const res = await apiFetch('/api/resize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workerName, cols: c, rows: r }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ResizeResponse;
        if (data.error) {
          setActionMsg(`resize failed: ${data.error}`);
          return;
        }
        if (typeof data.cols === 'number' && typeof data.rows === 'number') {
          setServerDims({ cols: data.cols, rows: data.rows });
        }
      } catch (e) {
        setActionMsg(`resize failed: ${(e as Error).message}`);
      }
    },
    [workerName]
  );

  // Measure char width and compute fit cols. setCols uses functional form so
  // this callback stays stable across cols changes -- otherwise the observers
  // below would tear down and re-attach on every fit cycle.
  const recomputeFit = useCallback(() => {
    if (!autoFit) return;
    const pre = preRef.current;
    const ruler = rulerRef.current;
    if (!pre || !ruler) return;
    const charW = ruler.getBoundingClientRect().width;
    if (charW <= 0) return;
    const style = window.getComputedStyle(pre);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const inner = pre.clientWidth - padL - padR;
    if (inner <= 0) return;
    const raw = Math.floor(inner / charW);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const nextCols = clamp(raw, MIN_COLS, MAX_COLS);
    if (AUTOFIT_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(
        '[autofit] measured cols=%d (inner=%d, charW=%f, font=%d)',
        nextCols,
        inner,
        charW,
        fontSize,
      );
    }
    setCols((prev) => (prev === nextCols ? prev : nextCols));
    requestResize(nextCols, DEFAULT_ROWS);
  }, [autoFit, fontSize, requestResize]);

  // Shared 120ms debounce across window.resize + ResizeObserver so we never
  // issue two POST /api/resize calls for a single user gesture.
  const scheduleRecompute = useCallback(() => {
    if (!autoFit) return;
    if (resizeTimerRef.current != null) {
      window.clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      recomputeFit();
    }, 120);
  }, [autoFit, recomputeFit]);

  useLayoutEffect(() => {
    if (!autoFit) return;
    recomputeFit();
  }, [autoFit, fontSize, recomputeFit]);

  useEffect(() => {
    const onResize = () => scheduleRecompute();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimerRef.current != null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [scheduleRecompute]);

  // ResizeObserver on the <pre> catches layout shifts that do not fire a
  // window.resize (sidebar toggle, font-size changes, parent flex reflow).
  // Some mobile Safari builds do not deliver ResizeObserver on a flex child,
  // hence the window-resize listener above stays wired as a fallback.
  useEffect(() => {
    if (!autoFit) return;
    const pre = preRef.current;
    if (!pre) return;
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      scheduleRecompute();
    });
    obs.observe(pre);
    return () => {
      try {
        obs.disconnect();
      } catch {
        /* ignore teardown race */
      }
    };
  }, [autoFit, scheduleRecompute]);

  // When auto-fit is off, push the manual cols value to the server whenever
  // it changes. Debounced by React's batching alone -- requestResize itself
  // dedupes against the last-sent dims.
  useEffect(() => {
    if (autoFit) return;
    requestResize(cols, DEFAULT_ROWS);
  }, [autoFit, cols, requestResize]);

  const runAction = async (label: string, fn: () => Promise<ActionResponse>) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fn();
      if (res.error) {
        setActionMsg(`${label} failed: ${res.error}`);
      } else {
        setActionMsg(`${label} ok`);
        fetchContent();
      }
    } catch (e) {
      setActionMsg(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = () => {
    const text = inputText;
    if (!text) return;
    runAction('send', () => postJson('/api/send', { name: workerName, input: text })).then(() => {
      setInputText('');
    });
  };

  const handleEnter = () => {
    runAction('key Enter', () => postJson('/api/key', { name: workerName, key: 'Enter' }));
  };

  // (8.5) Key helpers. POST /key enforces a server-side allow-list --
  // calling with an unknown label is a 400. Labels here must stay in
  // sync with KEY_ALLOWLIST in src/daemon.js.
  const sendKey = (key: string) => {
    runAction(`key ${key}`, () => postJson('/api/key', { name: workerName, key }));
  };

  const handleMerge = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Merge worker "${workerName}" into main?\n\nThis runs the pre-merge checks and performs git merge --no-ff.`
      );
      if (!ok) return;
    }
    runAction('merge', () => postJson('/api/merge', { name: workerName }));
  };

  const handleClose = () => {
    runAction('close', () => postJson('/api/close', { name: workerName }));
  };

  const bumpFont = (delta: number) => {
    setFontSize((prev) => clamp(prev + delta, MIN_FONT, MAX_FONT));
  };

  const manualCols = (next: number) => {
    const c = clamp(next, MIN_COLS, MAX_COLS);
    setCols(c);
    if (autoFit) setAutoFit(false);
  };

  const lineHeight = useMemo(() => Math.round(fontSize * 1.25 * 100) / 100, [fontSize]);
  const dimsLabel = serverDims
    ? `${serverDims.cols} x ${serverDims.rows}`
    : `${cols} x ${DEFAULT_ROWS}`;

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{workerName}</CardTitle>
            <CardDescription>
              Terminal session - dims {dimsLabel}
            </CardDescription>
          </div>
          <div
            role="tablist"
            aria-label="Terminal view"
            className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-sm"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={tab === 'screen'}
              variant={tab === 'screen' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab('screen')}
            >
              Screen
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={tab === 'scrollback'}
              variant={tab === 'scrollback' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab('scrollback')}
            >
              Scrollback
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <div
            className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1"
            aria-label="Font size"
          >
            <IconButton
              aria-label="Decrease font size"
              className="h-7 w-7"
              onClick={() => bumpFont(-1)}
              icon={<Minus className="h-3.5 w-3.5" />}
            />
            <span className="min-w-[2.5rem] text-center font-mono text-foreground">
              {fontSize}px
            </span>
            <IconButton
              aria-label="Increase font size"
              className="h-7 w-7"
              onClick={() => bumpFont(1)}
              icon={<Plus className="h-3.5 w-3.5" />}
            />
          </div>
          <Label className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-normal text-muted-foreground">
            <input
              type="checkbox"
              checked={autoFit}
              onChange={(e) => setAutoFit(e.target.checked)}
            />
            <span>Auto-fit</span>
          </Label>
          <Label className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-normal text-muted-foreground">
            <span>cols</span>
            <Input
              type="number"
              min={MIN_COLS}
              max={MAX_COLS}
              value={cols}
              onChange={(e) => manualCols(Number(e.target.value))}
              className="h-6 w-16 rounded-md bg-background px-1 py-0 text-right text-xs"
              disabled={autoFit}
            />
          </Label>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <span
          ref={rulerRef}
          aria-hidden="true"
          className="pointer-events-none absolute font-mono opacity-0"
          style={{ fontSize, lineHeight: `${lineHeight}px`, visibility: 'hidden' }}
        >
          0
        </span>

        <pre
          ref={preRef}
          className={cn(
            'min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre rounded-md border border-border bg-background p-3 font-mono text-foreground md:p-4'
          )}
          style={{ fontSize, lineHeight: `${lineHeight}px` }}
        >
          {content || <span className="text-muted-foreground">(empty)</span>}
        </pre>

        {actionMsg && (
          <div className="text-xs text-muted-foreground">{actionMsg}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Send text to worker..."
            className="h-9 min-w-0 flex-1"
            disabled={busy}
          />
          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label="Send text"
            onClick={handleSend}
            disabled={busy || !inputText.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleEnter}
            disabled={busy}
          >
            Enter
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleMerge}
            disabled={busy}
            title="Run pre-merge checks and merge this worker's branch into main"
          >
            <GitMerge className="h-4 w-4" />
            <span>Merge</span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleClose}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            <span>Close</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Keys</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('Escape')}
            disabled={busy}
          >
            Esc
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('C-c')}
            disabled={busy}
          >
            Ctrl-C
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('C-d')}
            disabled={busy}
          >
            Ctrl-D
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('Tab')}
            disabled={busy}
          >
            Tab
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Arrow Up"
            onClick={() => sendKey('Up')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Arrow Down"
            onClick={() => sendKey('Down')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Arrow Left"
            onClick={() => sendKey('Left')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Arrow Right"
            onClick={() => sendKey('Right')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
