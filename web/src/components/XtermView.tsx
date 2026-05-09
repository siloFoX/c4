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
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import XtermStatusBar from './XtermStatusBar';
import { buildXtermTheme } from '../lib/xterm-theme';
import { useXtermThemeTracking } from '../lib/use-xterm-theme-tracking';
import { useTerminalSseStream } from '../lib/use-terminal-sse-stream';
import { useXtermAutofit } from '../lib/use-xterm-autofit';

interface XtermViewProps {
  workerName: string;
  fontSize: number;
  // When false the parent (WorkerDetail) is showing a different tab. We
  // stay mounted (CSS visibility: hidden) so fit() keeps working across
  // tab switches -- the original 8.27 bug was a remount that dropped the
  // ResizeObserver wiring.
  visible?: boolean;
}

// (v1.10.571) b64decode moved to lib/chat-helpers.ts — was a
// duplicate of ChatView's. Imported below.
// (v1.10.645) buildXtermTheme moved to lib/xterm-theme.ts so
// the theme-tracking hook can share it.

// (v1.10.672) FIT_DEBOUNCE_MS / clamp constants / clampInt /
// AUTOFIT_DEBUG / runFit / scheduleFit moved to lib/use-xterm-autofit.

export default function XtermView({ workerName, fontSize, visible = true }: XtermViewProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [altScreen, setAltScreen] = useState(false);

  // (v1.10.672) Fit + POST /api/resize loop moved to hook.
  const { fitTimerRef, lastResizeRef, scheduleFit } = useXtermAutofit({ termRef, fitRef, workerName });

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

  // (v1.10.645) Theme tracking moved to lib/use-xterm-theme-tracking.
  useXtermThemeTracking({ termRef, workerName });

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

  // (v1.10.646) SSE watch moved to lib/use-terminal-sse-stream.
  const { sseConnected } = useTerminalSseStream({
    termRef,
    workerName,
    onError: setError,
  });

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
      aria-label={t('xterm.terminal.label')}
    >
      {error && (
        <div
          role="alert"
          className="m-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/* (v1.10.589) Status bar + search panel extracted to
          ./XtermStatusBar.tsx. */}
      <XtermStatusBar
        statusLabel={statusLabel}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((o) => !o)}
        searchQuery={searchQuery}
        onSearchQuery={setSearchQuery}
        onRunSearch={runSearch}
        onCloseSearch={() => setSearchOpen(false)}
      />

      <div
        ref={containerRef}
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-hidden p-2"
      />
    </div>
  );
}
