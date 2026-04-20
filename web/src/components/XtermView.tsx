// 8.24 + 8.27 -- xterm.js terminal emulator for the WorkerDetail terminal
// pane. Replaces the append-only stripAnsi pre-block with a real terminal
// so Claude Code's in-place redraws (spinner, thinking box, alt-screen TUI)
// render correctly instead of piling up copies. Fits via @xterm/addon-fit +
// ResizeObserver; stays mounted across WorkerDetail tab switches so fit()
// keeps receiving size changes (8.27 auto-fit regression root-cause).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { apiFetch, eventSourceUrl } from '../lib/api';
import { cn } from '../lib/cn';

interface XtermViewProps {
  workerName: string;
  fontSize: number;
  // When false the parent (WorkerDetail) is showing a different tab. We
  // stay mounted (CSS visibility: hidden) so fit() keeps working across
  // tab switches -- the original 8.27 bug was a remount that dropped the
  // ResizeObserver wiring.
  visible?: boolean;
}

interface WatchEvent {
  type?: string;
  data?: string;
}

// Mirror of the base64 decoder used by ChatView -- xterm expects a string,
// not a Uint8Array.
function b64decode(b64: string): string {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

// Pull a shadcn CSS custom property off the document root and wrap it in
// hsl(...). The tokens are stored as bare "H S% L%" triples (see
// web/src/index.css) so xterm -- which wants a concrete CSS color -- needs
// the wrapper. Fallbacks cover SSR + very old browsers.
function readShadcnColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return fallback;
  return `hsl(${raw})`;
}

// Map shadcn's palette to the xterm ITheme shape. The ANSI 16 entries come
// from a neutral light/dark pair; shadcn's semantic tokens (primary, muted,
// destructive) drive the chrome (cursor / selection) so the terminal tracks
// the rest of the UI.
function buildXtermTheme(): ITheme {
  const background = readShadcnColor('--background', '#ffffff');
  const foreground = readShadcnColor('--foreground', '#0a0a0a');
  const mutedForeground = readShadcnColor('--muted-foreground', '#737373');
  const primary = readShadcnColor('--primary', '#0a0a0a');
  const accent = readShadcnColor('--accent', '#f4f4f5');
  const destructive = readShadcnColor('--destructive', '#ef4444');
  return {
    background,
    foreground,
    cursor: primary,
    cursorAccent: background,
    selectionBackground: accent,
    selectionForeground: foreground,
    // ANSI 16 palette -- balanced against shadcn neutrals so Claude Code's
    // coloured output (green "done", red error, etc) stays legible on both
    // light and dark.
    black: '#1f2937',
    red: destructive,
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#c026d3',
    cyan: '#0891b2',
    white: mutedForeground,
    brightBlack: '#4b5563',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#e879f9',
    brightCyan: '#22d3ee',
    brightWhite: foreground,
  };
}

// 8.27 debounce shared across window.resize + ResizeObserver to avoid firing
// two fit()/POST-resize pairs for one gesture.
const FIT_DEBOUNCE_MS = 120;

// Lower/upper cols clamp mirrors the daemon-side clamp in
// src/pty-manager.js _clampResizeDims so the UI never asks for something the
// daemon will reject. xterm's fit-addon can return any positive integer, so
// the clamp stays as a safety belt.
const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 5;
const MAX_ROWS = 200;

// 8.22-era debug toggle carried over so operators can still observe the
// fit -> POST /api/resize loop via web/.env.local. Setting
// VITE_AUTOFIT_DEBUG=1 prints one console.debug per recompute.
const AUTOFIT_DEBUG: boolean = (() => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const v = env?.VITE_AUTOFIT_DEBUG;
    return v === '1' || v === 'true' || v === true;
  } catch {
    return false;
  }
})();

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

export default function XtermView({ workerName, fontSize, visible = true }: XtermViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const fitTimerRef = useRef<number | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [altScreen, setAltScreen] = useState(false);

  // Fit + POST /api/resize. Uses lastResizeRef to drop no-op requests so
  // the daemon PTY only sees dimension changes.
  const runFit = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
    } catch {
      // fit throws if the container is 0x0 (tab hidden). Bail -- next
      // resize event will retry once the terminal is visible.
      return;
    }
    const rawCols = term.cols;
    const rawRows = term.rows;
    if (!Number.isFinite(rawCols) || !Number.isFinite(rawRows) || rawCols <= 0 || rawRows <= 0) return;
    const cols = clampInt(rawCols, MIN_COLS, MAX_COLS);
    const rows = clampInt(rawRows, MIN_ROWS, MAX_ROWS);
    const last = lastResizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    lastResizeRef.current = { cols, rows };
    if (AUTOFIT_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[autofit] cols=%d rows=%d -> POST /api/resize', cols, rows);
    }
    void apiFetch('/api/resize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: workerName, cols, rows }),
    }).catch(() => {
      // Resize is best-effort; the daemon already clamps via
      // _clampResizeDims and a failed POST just means the next fit tries
      // again. Swallow so we do not page on transient HTTP hiccups.
    });
  }, [workerName]);

  const scheduleFit = useCallback(() => {
    if (fitTimerRef.current != null) {
      window.clearTimeout(fitTimerRef.current);
    }
    fitTimerRef.current = window.setTimeout(() => {
      fitTimerRef.current = null;
      runFit();
    }, FIT_DEBOUNCE_MS);
  }, [runFit]);

  // Mount the terminal once per workerName. Remounting on every prop change
  // would drop scrollback + flicker, so only workerName is in the dep list.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize,
      lineHeight: 1.25,
      cursorBlink: false,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: false,
      allowProposedApi: true,
      theme: buildXtermTheme(),
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    const webLinks = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(webLinks);
    term.open(container);

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    // Alt-screen tracking. xterm already freezes scrollback when the buffer
    // flips to 'alternate', but we still need the flag to hide scroll-tail
    // UI bits (the footer reserves space) and for the auto-scroll branch.
    const onBufferChange = () => {
      const type = term.buffer.active.type;
      setAltScreen(type === 'alternate');
    };
    term.buffer.onBufferChange(onBufferChange);
    onBufferChange();

    try {
      fit.fit();
    } catch {
      // Container may be 0x0 on mount (tab hidden). ResizeObserver below
      // will trigger another fit once size is known.
    }

    return () => {
      try {
        term.dispose();
      } catch {
        // noop -- addons share disposal with the terminal
      }
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      lastResizeRef.current = null;
    };
  }, [workerName]);

  // Apply font-size without remounting (preserves scrollback).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    scheduleFit();
  }, [fontSize, scheduleFit]);

  // Theme tracking -- re-applied whenever the `<html>` dark class flips or
  // the user reloads. shadcn swaps --background / --foreground via a class,
  // so watching classList is enough.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const apply = () => {
      term.options.theme = buildXtermTheme();
    };
    apply();
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [workerName]);

  // 8.27 ResizeObserver. Attached for the lifetime of the mount regardless
  // of `visible`, so a sidebar-toggle or window-resize that happens while
  // the terminal tab is hidden still fits the moment the tab comes back.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      scheduleFit();
    });
    obs.observe(container);
    return () => {
      try {
        obs.disconnect();
      } catch {
        // ignore teardown race
      }
      if (fitTimerRef.current != null) {
        window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }
    };
  }, [scheduleFit]);

  // Extra window-level resize hook. Some browser builds debounce
  // ResizeObserver for off-screen elements, which defeats 8.27; window
  // resize still fires while hidden.
  useEffect(() => {
    const onResize = () => scheduleFit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scheduleFit]);

  // Re-fit whenever visibility flips on (tab activation).
  useLayoutEffect(() => {
    if (visible) scheduleFit();
  }, [visible, scheduleFit]);

  // SSE watch -- identical wire shape to ChatView. We write raw bytes
  // (no stripAnsi) straight into xterm so cursor controls, alt-screen
  // toggles, and OSC sequences all land.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const url = eventSourceUrl(`/api/watch?name=${encodeURIComponent(workerName)}`);
    let es: EventSource | null;
    try {
      es = new EventSource(url);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as WatchEvent;
        if (data.type === 'output' && typeof data.data === 'string') {
          term.write(b64decode(data.data));
        }
      } catch {
        // ignore non-JSON payloads
      }
    };
    return () => {
      es?.close();
    };
  }, [workerName]);

  // Ctrl+F opens the search overlay while focus is inside the terminal.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    container.addEventListener('keydown', onKey);
    return () => container.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const runSearch = useCallback(
    (direction: 'next' | 'prev') => {
      const search = searchRef.current;
      if (!search || !searchQuery) return;
      if (direction === 'next') {
        search.findNext(searchQuery);
      } else {
        search.findPrevious(searchQuery);
      }
    },
    [searchQuery]
  );

  const statusLabel = useMemo(() => {
    if (!sseConnected) return 'disconnected';
    return altScreen ? 'alt-screen' : 'normal';
  }, [sseConnected, altScreen]);

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 min-w-0 flex-col rounded-md border border-border bg-background',
        !visible && 'invisible'
      )}
      aria-label="Terminal"
    >
      {error && (
        <div
          role="alert"
          className="m-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{statusLabel}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Search in terminal"
          onClick={() => setSearchOpen((o) => !o)}
        >
          <SearchIcon className="h-3 w-3" aria-hidden="true" />
          <span>Search</span>
        </button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            autoFocus
            placeholder="Find in terminal (Enter = next, Shift+Enter = prev)"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch(e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
              }
            }}
          />
          <button
            type="button"
            aria-label="Close search"
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => setSearchOpen(false)}
          >
            <XIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-hidden p-2"
      />
    </div>
  );
}
