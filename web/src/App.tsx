import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Login from './components/Login';
import { LoadingSkeleton } from './pages/PageFrame';
import { useToggle } from './lib/use-toggle';
import { useViewportSize } from './hooks/use-viewport-size';
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from './components/ui/command-palette';
import type { Command } from './components/ui/command-palette';
// (v1.10.509) Top-level views are lazy-loaded so the main bundle
// only carries Login + AppHeader + Sidebar + the default
// WorkerDetail / ChatView / ControlPanel triple. The rest pull
// their own chunk on first navigation. Cuts main from ~992KB to
// ~600KB on initial paint.
const WorkerDetail = lazy(() => import('./components/WorkerDetail'));
const ChatView = lazy(() => import('./components/ChatView'));
const ControlPanel = lazy(() => import('./components/ControlPanel'));
const HistoryView = lazy(() => import('./components/HistoryView'));
const SessionsView = lazy(() => import('./components/SessionsView'));
const MeetingsView = lazy(() => import('./components/MeetingsView'));
const SpecialistsView = lazy(() => import('./components/SpecialistsView'));
const WikiView = lazy(() => import('./components/WikiView'));
const AutonomousView = lazy(() => import('./components/AutonomousView'));
const Chat = lazy(() => import('./components/Chat'));
const WorkflowEditor = lazy(() => import('./components/WorkflowEditor'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const ChartLineGallery = lazy(() => import('./components/ChartLineGallery'));
import PageTransition from './components/PageTransition';
import AppHeader from './components/layout/AppHeader';
import { AppShell } from './components/layout/AppShell';
import { UIErrorBoundary } from './components/ui/error-boundary';
import { initWebVitals } from './lib/web-vitals';
import { useWindowScrollRestore } from './lib/scroll-restore';
import Sidebar from './components/layout/Sidebar';
import DetailTabs from './components/layout/DetailTabs';
import EmptyState from './components/layout/EmptyState';
import FeatureView from './components/layout/FeatureView';
import HelpUIRoot, { openShortcutsModal } from './components/HelpUIRoot';
import { buildShortcutCommands, mergePaletteCommands } from './lib/palette-commands';
import AnnounceRegion from './components/AnnounceRegion';
import MetricsBar from './components/MetricsBar';
import AutonomousStatusBanner from './components/AutonomousStatusBanner';
import GridDebugOverlay from './components/dev/GridDebugOverlay';
import RouteProgressBar from './components/RouteProgressBar';
import { logout } from './lib/api';
import { useAuthState } from './lib/use-auth-state';
import { useSidebarShortcut } from './lib/use-sidebar-shortcut';
import { useShortcutSequence } from './hooks/use-shortcut-sequence';
import { useTheme } from './lib/use-theme';
import { useUiPreferences } from './lib/use-ui-preferences';
import {
  DEFAULT_DETAIL_MODE,
  DEFAULT_SIDEBAR_COLLAPSED,
  DEFAULT_SIDEBAR_MODE,
  DEFAULT_THEME,
  readTheme,
} from './lib/preferences';

export default function App() {
  // (v1.11.359, TODO 11.341) Core Web Vitals reporter
  // bootstrap. Registers LCP / FID / INP / CLS / TTFB
  // listeners once per page load. Dev builds log each
  // metric to the devtools console; production builds
  // stay quiet unless a host wires `onReport`. The
  // hook is idempotent, so HMR-induced re-mounts do
  // not double-register.
  useEffect(() => {
    initWebVitals();
  }, []);

  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  // (v1.10.669) Auth state machine + AUTH_EVENT listener moved to
  // lib/use-auth-state.
  const { authState, setAuthed, setAnon } = useAuthState();
  // (v1.11.240, TODO 11.222) Centralised viewport hook supersedes the
  // ad-hoc matchMedia('(min-width: 768px)') call sites. `!isMobile`
  // preserves the legacy ">= 768px" semantics for the initial
  // sidebar-open default.
  const viewport = useViewportSize();
  const [sidebarOpen, toggleSidebarOpen, setSidebarOpen] = useToggle(
    () => !viewport.isMobile,
  );
  // (v1.10.671) Theme state + write+apply + OS-theme listener moved to
  // lib/use-theme.
  const { theme, setTheme } = useTheme();
  // (v1.10.732) Sidebar/detail/topView preferences + persistence + cross-
  // tab storage sync moved to lib/use-ui-preferences. Theme participates
  // in the storage sync via the onCrossTabSync callback.
  const onCrossTabSync = useCallback(() => {
    setTheme(readTheme());
  }, [setTheme]);
  const {
    sidebarMode, setSidebarMode,
    sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed,
    detailMode, setDetailMode,
    topView, setTopView,
  } = useUiPreferences({ onCrossTabSync });

  // (v1.11.366, TODO 11.348) Per-route scroll
  // restoration. Each `topView` value gets its own
  // sessionStorage slot so a sidebar tab switch lands
  // the operator back at the same scroll position
  // they left. Defaults to 'forward' navigation
  // semantics (clear + scroll to 0 on first entry)
  // and switches to 'pop' (restore) when the browser
  // history pops -- the popstate listener flips a
  // ref that is read once per topView change.
  const popRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = (): void => {
      popRef.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigationType = popRef.current ? 'pop' : 'forward';
  useEffect(() => {
    popRef.current = false;
  }, [topView]);
  useWindowScrollRestore({
    routeKey: `topView:${topView}`,
    navigationType,
  });

  // (v1.10.670) Ctrl+B / Cmd+B sidebar shortcut moved to hook.
  useSidebarShortcut({
    onToggleCollapsed: toggleSidebarCollapsed,
    onToggleOpen: toggleSidebarOpen,
  });

  // (v1.11.295, TODO 11.277) Command palette open state +
  // Cmd+K / Ctrl+K shortcut. Commands are defined inline below
  // so they close over the current setTopView / setSelectedWorker
  // / dispatch helpers.
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const togglePalette = useCallback(
    () => setPaletteOpen((v) => !v),
    [],
  );
  useCommandPaletteShortcut(togglePalette);

  const paletteCommands = useMemo<Command[]>(
    () => [
      {
        id: 'go.workers',
        label: 'Go to Workers',
        group: 'Navigate',
        shortcut: 'g w',
        keywords: ['home', 'list'],
        action: () => {
          setTopView('workers');
          setSelectedWorker(null);
        },
      },
      {
        id: 'go.history',
        label: 'Go to History',
        group: 'Navigate',
        action: () => setTopView('history'),
      },
      {
        id: 'go.sessions',
        label: 'Go to Sessions',
        group: 'Navigate',
        action: () => setTopView('sessions'),
      },
      {
        id: 'go.meetings',
        label: 'Go to Meetings',
        group: 'Navigate',
        action: () => setTopView('meetings'),
      },
      {
        id: 'go.specialists',
        label: 'Go to Specialists',
        group: 'Navigate',
        action: () => setTopView('specialists'),
      },
      {
        id: 'go.wiki',
        label: 'Go to Wiki',
        group: 'Navigate',
        action: () => setTopView('wiki'),
      },
      {
        id: 'go.chat',
        label: 'Go to Chat',
        group: 'Navigate',
        action: () => setTopView('chat'),
      },
      {
        id: 'go.workflows',
        label: 'Go to Workflows',
        group: 'Navigate',
        action: () => setTopView('workflows'),
      },
      {
        id: 'go.autonomous',
        label: 'Go to Autonomous',
        group: 'Navigate',
        action: () => setTopView('autonomous'),
      },
      {
        id: 'go.features',
        label: 'Go to Features',
        group: 'Navigate',
        action: () => setTopView('features'),
      },
      {
        id: 'go.gallery',
        label: 'Go to Gallery',
        group: 'Navigate',
        keywords: ['charts', 'chart-line', 'showcase', 'primitives'],
        action: () => setTopView('gallery'),
      },
      {
        id: 'app.settings',
        label: 'Open Settings',
        group: 'App',
        keywords: ['preferences', 'config', 'theme'],
        action: () => setTopView('settings'),
      },
      {
        id: 'app.toggle-sidebar',
        label: 'Toggle Sidebar',
        group: 'App',
        shortcut: 'Ctrl+B',
        keywords: ['hide', 'show'],
        action: toggleSidebarCollapsed,
      },
      {
        id: 'app.focus-search',
        label: 'Focus Search',
        group: 'App',
        keywords: ['find', 'filter'],
        action: () => {
          if (typeof document === 'undefined') return;
          const search =
            document.querySelector<HTMLElement>(
              '[data-section="search-bar"] input',
            ) ??
            document.querySelector<HTMLElement>('input[type="search"]');
          if (search) search.focus();
        },
      },
      {
        id: 'app.logout',
        label: 'Logout',
        group: 'App',
        keywords: ['sign out'],
        action: () => {
          void logout().then(() => setAnon());
        },
      },
    ],
    [setTopView, setSelectedWorker, toggleSidebarCollapsed, setAnon],
  );

  // (v1.11.369, TODO 11.351) Shortcut registry
  // integration. SHORTCUT_ROWS in
  // KeyboardShortcutsModal is the canonical
  // documented-shortcuts list; surfacing it
  // through the palette lets an operator
  // fuzzy-search 'Ctrl+F' or 'sidebar' and land
  // on the matching binding. Selecting a row
  // opens the help modal so the binding sits in
  // context (related shortcuts visible, no
  // surprise side-effect from firing the chord
  // programmatically).
  const shortcutCommands = useMemo<Command[]>(
    () =>
      buildShortcutCommands({
        onSelect: () => openShortcutsModal(),
      }),
    [],
  );
  const mergedCommands = useMemo<Command[]>(
    () => mergePaletteCommands(paletteCommands, shortcutCommands),
    [paletteCommands, shortcutCommands],
  );

  // (v1.11.250, TODO 11.232) Multi-key chord shortcuts.
  //   gg  -> scroll the current view to the top
  //   gh  -> "home" = workers tab + clear the selected worker
  //   gw  -> jump straight to the workers tab
  // The hook drops the chord while focus sits on a text input so
  // typing the letter g in the chat composer does not navigate.
  useShortcutSequence({
    gg: () => {
      if (typeof window === 'undefined') return;
      window.scrollTo({ top: 0, behavior: 'auto' });
      // Scroll any active scroll surface (FeatureView /
      // ChatMessageLog / WikiView) back to the top -- those mount
      // their own overflow container, so a window scroll is not
      // enough. Cheapest portable path: dispatch a custom event
      // that surfaces can listen to. Future surfaces can opt in
      // by adding a `c4:scroll-to-top` listener.
      window.dispatchEvent(new CustomEvent('c4:scroll-to-top'));
    },
    gh: () => {
      setTopView('workers');
      setSelectedWorker(null);
    },
    gw: () => {
      setTopView('workers');
    },
  });

  if (authState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (authState === 'anon') {
    return <Login onSuccess={setAuthed} />;
  }

  const handleLogout = async () => {
    await logout();
    setAnon();
  };

  const handleSelect = (name: string | null) => {
    setSelectedWorker(name);
    if (viewport.isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <AnnounceRegion>
    <HelpUIRoot onNavigateTopView={setTopView} />
    {/* (v1.11.295, TODO 11.277) Cmd+K command palette. The
        shortcut hook is registered above; this mount renders
        the modal portal when paletteOpen flips true. The
        palette is a portal-based modal -- mounting it
        outside AppShell keeps the shell's <main> landmark
        free of modal content. */}
    <CommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      commands={mergedCommands}
    />
    {/* (v1.11.350, TODO 11.332) AppShell adoption. The outer
        flex column + h-screen + bg-background rhythm now flows
        through the AppShell primitive so the header + main
        landmarks come from one source. mainScroll="inherit"
        preserves the existing per-view scroll discipline (each
        topView branch manages its own `overflow-hidden` and
        `min-h-0` chain). headerClassName overrides AppShell's
        default border-b + bg-card/40 so the v1.11.134 gradient
        backdrop survives unchanged. */}
    <AppShell
      mainScroll="inherit"
      headerClassName="p-0 border-0 bg-gradient-to-b from-[hsl(220_18%_8%)] to-[hsl(220_15%_12%)]"
      header={
        <div
          className="flex w-full"
          data-testid="app-top-bar-gradient"
        >
          <AppHeader
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            topView={topView}
            onTopViewChange={setTopView}
            authed={authState === 'authed' || authState === 'disabled'}
            onLogout={handleLogout}
            onOpenPreferences={() => setTopView('settings')}
          />
        </div>
      }
    >
      {/* MetricsBar polls /api/metrics every 5s and renders a thin strip
          of daemon RSS/heap/loadavg + worker CPU/RSS totals just below
          the header. Component returns null until the first response,
          so it doesn't introduce layout jumps when the daemon is
          unreachable or auth-gated. */}
      <MetricsBar />
      <AutonomousStatusBanner />
      {/* (v1.11.202 / patch 11.184) Slim top-of-page progress bar that
          auto-runs a start->done cycle whenever `topView` changes. */}
      <RouteProgressBar routeKey={topView} />
      {/* (v1.11.201 / patch 11.183) Dev-only grid debug overlay.
          Self-gates on import.meta.env.PROD so production builds
          render null. Toggle via Cmd/Ctrl+Shift+G. */}
      <GridDebugOverlay />
      <Suspense fallback={
        <div className="flex min-h-0 flex-1 overflow-auto p-6">
          <LoadingSkeleton rows={6} />
        </div>
      }>
      {/* (v1.11.175 / patch 11.157) PageTransition wraps the top-view
          switcher so route changes get a unified slide+fade crossfade
          instead of each branch animating its own enter. The wrapper
          keys off `topView` so it only fires on top-level navigation;
          per-branch keys (key={topView}) inside continue to drive
          their existing motion-safe animate-in classes for nested
          state changes (e.g., detailMode within the worker view). */}
      {/* (v1.11.352, TODO 11.334) UIErrorBoundary wraps every
          page route in one place. resetKeys={[topView]} clears
          the error state when the operator navigates away from
          a crashed view so the next route mounts clean. The
          top-level <ErrorBoundary> in main.tsx remains the
          safety net for crashes outside the page tree (header,
          shell, sidebar). */}
      <UIErrorBoundary
        resetKeys={[topView]}
        title="This view crashed"
        description="The page below failed to render. Retry to re-mount, or navigate away."
      >
      <PageTransition routeKey={topView} className="flex min-h-0 flex-1">
      {topView === 'history' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <HistoryView />
        </div>
      ) : topView === 'sessions' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <SessionsView />
        </div>
      ) : topView === 'meetings' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <MeetingsView />
        </div>
      ) : topView === 'specialists' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <SpecialistsView />
        </div>
      ) : topView === 'wiki' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <WikiView />
        </div>
      ) : topView === 'chat' ? (
        // (v1.11.1113, TODO 11.1095) Center the chat in a readable
        // max-w-3xl column that fills the view height. Previously the
        // wrapper let the Chat card sit content-sized at the top-left
        // of a vast empty area at 1440. `mx-auto max-w-3xl w-full`
        // caps + centers the column (full width on mobile); `h-full
        // flex-1 flex-col` fills the height so the transcript + composer
        // get room.
        <div key={topView} className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden p-3 md:p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <Chat />
        </div>
      ) : topView === 'workflows' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <WorkflowEditor />
        </div>
      ) : topView === 'autonomous' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <AutonomousView />
        </div>
      ) : topView === 'features' ? (
        <div key={topView} className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <FeatureView sidebarOpen={sidebarOpen} />
        </div>
      ) : topView === 'gallery' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <ChartLineGallery />
        </div>
      ) : topView === 'settings' ? (
        <div key={topView} className="flex min-h-0 flex-1 overflow-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <SettingsView
            theme={theme}
            onThemeChange={setTheme}
            sidebarMode={sidebarMode}
            onSidebarModeChange={setSidebarMode}
            detailMode={detailMode}
            onDetailModeChange={setDetailMode}
            onReset={() => {
              setTheme(DEFAULT_THEME);
              setSidebarMode(DEFAULT_SIDEBAR_MODE);
              setSidebarCollapsed(DEFAULT_SIDEBAR_COLLAPSED);
              setDetailMode(DEFAULT_DETAIL_MODE);
            }}
          />
        </div>
      ) : (
        <div key={topView} className="flex min-h-0 flex-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <Sidebar
            open={sidebarOpen}
            mode={sidebarMode}
            onModeChange={setSidebarMode}
            selectedWorker={selectedWorker}
            onSelect={handleSelect}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
            onLogout={handleLogout}
            onOpenPreferences={() => setTopView('settings')}
            theme={theme}
            onThemeChange={setTheme}
          />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
            {selectedWorker ? (
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                <div className="mb-3 flex justify-end">
                  <DetailTabs value={detailMode} onChange={setDetailMode} />
                </div>
                <div key={detailMode} className="min-h-0 min-w-0 flex-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
                  {detailMode === 'chat' ? (
                    <ChatView key={`chat-${selectedWorker}`} workerName={selectedWorker} />
                  ) : detailMode === 'control' ? (
                    <ControlPanel key={`control-${selectedWorker}`} workerName={selectedWorker} />
                  ) : (
                    <WorkerDetail key={`term-${selectedWorker}`} workerName={selectedWorker} />
                  )}
                </div>
              </div>
            ) : (
              <EmptyState />
            )}
          </main>
        </div>
      )}
      </PageTransition>
      </UIErrorBoundary>
      </Suspense>
    </AppShell>
    </AnnounceRegion>
  );
}
