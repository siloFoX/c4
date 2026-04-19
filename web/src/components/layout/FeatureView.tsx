import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from 'react';
import FeatureSidebar from './FeatureSidebar';
import {
  FEATURES,
  findFeature,
  type FeatureDef,
} from '../../pages/registry';
import PageFrame, { LoadingSkeleton } from '../../pages/PageFrame';

const FEATURE_KEY = 'c4.features.selected';
const HASH_PREFIX = '#/feature/';

function readInitialFeature(): string {
  if (typeof window === 'undefined') return FEATURES[0].id;
  const hash = window.location.hash || '';
  if (hash.startsWith(HASH_PREFIX)) {
    const id = hash.slice(HASH_PREFIX.length);
    if (findFeature(id)) return id;
  }
  try {
    const v = window.localStorage.getItem(FEATURE_KEY);
    if (v && findFeature(v)) return v;
  } catch {
    // private mode
  }
  return FEATURES[0].id;
}

function writeHash(id: string): void {
  if (typeof window === 'undefined') return;
  const next = `${HASH_PREFIX}${id}`;
  if (window.location.hash === next) return;
  // Use replaceState so the top-level browser back stack is not polluted
  // when operators click around between features in rapid succession.
  try {
    const url = `${window.location.pathname}${window.location.search}${next}`;
    window.history.replaceState(null, '', url);
  } catch {
    window.location.hash = next;
  }
}

const pageCache = new Map<string, ComponentType>();

function getPageComponent(feat: FeatureDef): ComponentType {
  const cached = pageCache.get(feat.id);
  if (cached) return cached;
  const Lazy = lazy(feat.load);
  pageCache.set(feat.id, Lazy);
  return Lazy;
}

interface FeatureViewProps {
  sidebarOpen: boolean;
}

export default function FeatureView({ sidebarOpen }: FeatureViewProps) {
  const [selectedId, setSelectedId] = useState<string>(readInitialFeature);

  useEffect(() => {
    try {
      window.localStorage.setItem(FEATURE_KEY, selectedId);
    } catch {
      // private mode
    }
    writeHash(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith(HASH_PREFIX)) {
        const id = hash.slice(HASH_PREFIX.length);
        if (findFeature(id) && id !== selectedId) {
          setSelectedId(id);
        }
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [selectedId]);

  const feature = useMemo(() => findFeature(selectedId), [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <FeatureSidebar
        open={sidebarOpen}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
        {feature ? (
          <Suspense
            fallback={
              <PageFrame title={feature.label} description={feature.description}>
                <LoadingSkeleton rows={5} />
              </PageFrame>
            }
          >
            <FeaturePageWrapper feature={feature} />
          </Suspense>
        ) : (
          <PageFrame title="Feature" description="Select a feature from the sidebar.">
            <div className="text-sm text-muted-foreground">
              Nothing selected.
            </div>
          </PageFrame>
        )}
      </main>
    </div>
  );
}

function FeaturePageWrapper({ feature }: { feature: FeatureDef }) {
  const Page = getPageComponent(feature);
  return <Page key={feature.id} />;
}
