import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '../lib/api';

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

  // Measure char width and compute fit cols. Debounced via rAF + timer.
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
    const nextCols = clamp(Math.floor(inner / charW), MIN_COLS, MAX_COLS);
    if (nextCols !== cols) {
      setCols(nextCols);
    }
    requestResize(nextCols, DEFAULT_ROWS);
  }, [autoFit, cols, requestResize]);

  useLayoutEffect(() => {
    if (!autoFit) return;
    recomputeFit();
  }, [autoFit, fontSize, recomputeFit]);

  useEffect(() => {
    const onResize = () => {
      if (!autoFit) return;
      if (resizeTimerRef.current != null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(() => {
        recomputeFit();
      }, 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimerRef.current != null) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, [autoFit, recomputeFit]);

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
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-semibold text-gray-100 md:text-lg">
          {workerName}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-800 p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab('screen')}
              className={`rounded px-3 py-1 transition ${
                tab === 'screen'
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Screen
            </button>
            <button
              type="button"
              onClick={() => setTab('scrollback')}
              className={`rounded px-3 py-1 transition ${
                tab === 'scrollback'
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Scrollback
            </button>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span className="font-mono text-gray-500">dims: {dimsLabel}</span>
        <div className="flex items-center gap-1 rounded bg-gray-800 p-1">
          <button
            type="button"
            onClick={() => bumpFont(-1)}
            className="rounded px-2 py-0.5 hover:bg-gray-700"
            aria-label="Decrease font size"
          >
            A-
          </button>
          <span className="min-w-[2.5rem] text-center font-mono text-gray-300">
            {fontSize}px
          </span>
          <button
            type="button"
            onClick={() => bumpFont(1)}
            className="rounded px-2 py-0.5 hover:bg-gray-700"
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>
        <label className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1">
          <input
            type="checkbox"
            checked={autoFit}
            onChange={(e) => setAutoFit(e.target.checked)}
          />
          <span>Auto-fit</span>
        </label>
        <label className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1">
          <span>cols</span>
          <input
            type="number"
            min={MIN_COLS}
            max={MAX_COLS}
            value={cols}
            onChange={(e) => manualCols(Number(e.target.value))}
            className="w-16 rounded bg-gray-900 px-1 py-0.5 text-right text-gray-100 focus:outline-none"
            disabled={autoFit}
          />
        </label>
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">
          {error}
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
        className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre rounded bg-gray-950 p-3 font-mono text-gray-200 md:p-4"
        style={{ fontSize, lineHeight: `${lineHeight}px` }}
      >
        {content || <span className="text-gray-600">(empty)</span>}
      </pre>

      {actionMsg && (
        <div className="mt-2 text-xs text-gray-400">{actionMsg}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
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
          className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          disabled={busy}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={busy || !inputText.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
        <button
          type="button"
          onClick={handleEnter}
          disabled={busy}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-100 hover:bg-gray-600 disabled:opacity-50"
        >
          Enter
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
