import type { RouteLoader } from './route-prefetch';
import type { TopView } from '../components/layout/TopTabs';

// (v1.11.246, TODO 11.228) Single source of truth for the
// top-level view loaders. Both the `React.lazy(...)` boundaries
// in App.tsx and the hover / focus prefetch path in TopTabs +
// AccountMenu read the same function reference, so warming a
// chunk on hover guarantees the lazy boundary picks up the
// already-resolved promise on click.
//
// Why a typed map instead of inlining the loaders at every call
// site: the `RouteLoader` cache in `route-prefetch.ts` is keyed by
// function identity, so a freshly-defined arrow inside a render
// (`() => import('./WikiView')`) would defeat the cache after
// every render and re-fire the network request on every hover.
// Exporting the loaders once at module scope gives a stable
// identity per route, which is the whole point of the cache.

export const TOP_VIEW_LOADERS: Record<Extract<TopView, 'workers' | 'history' | 'sessions' | 'meetings' | 'specialists' | 'wiki' | 'autonomous' | 'chat' | 'workflows' | 'settings'>, RouteLoader> = {
  workers: () => import('../components/WorkerDetail'),
  history: () => import('../components/HistoryView'),
  sessions: () => import('../components/SessionsView'),
  meetings: () => import('../components/MeetingsView'),
  specialists: () => import('../components/SpecialistsView'),
  wiki: () => import('../components/WikiView'),
  autonomous: () => import('../components/AutonomousView'),
  chat: () => import('../components/Chat'),
  workflows: () => import('../components/WorkflowEditor'),
  settings: () => import('../components/SettingsView'),
};

// `workers` and `features` share the "default workers/detail
// triple" that ships with the main bundle (WorkerDetail +
// ChatView + ControlPanel), so prefetching `workers` is the
// closest we can get from a TopTabs hover. `features` is a tree
// that lives inside its own chunk (FeatureView); export that
// loader separately for the Sidebar / TopTabs adapter.
export const FEATURES_LOADER: RouteLoader = () =>
  import('../components/layout/FeatureView');

// AccountMenu Preferences -> SettingsView. Re-exported as a named
// constant so AccountMenu does not have to know about the map shape.
export const SETTINGS_LOADER: RouteLoader = TOP_VIEW_LOADERS.settings;

// Convenience accessor: returns the loader for a TopView, or
// undefined when the view ships in the main bundle (workers /
// features are intentionally absent because they do not have a
// dedicated lazy chunk -- prefetching them is a no-op).
export function getTopViewLoader(view: TopView): RouteLoader | undefined {
  if (view === 'features') return FEATURES_LOADER;
  return (TOP_VIEW_LOADERS as Record<string, RouteLoader | undefined>)[view];
}
