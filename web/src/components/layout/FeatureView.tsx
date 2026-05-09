import { Suspense, lazy, useMemo, type ComponentType } from 'react';
import FeatureSidebar from './FeatureSidebar';
import { findFeature, type FeatureDef } from '../../pages/registry';
import PageFrame, { LoadingSkeleton } from '../../pages/PageFrame';
import { t, useLocale } from '../../lib/i18n';
import { useSelectedFeatureId } from '../../lib/use-selected-feature-id';

// (v1.10.728) Hash + localStorage selection state moved to lib/use-selected-feature-id.

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
  useLocale();
  const [selectedId, setSelectedId] = useSelectedFeatureId();

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
              <PageFrame title={t(feature.labelKey)} description={t(feature.descriptionKey)}>
                <LoadingSkeleton rows={5} />
              </PageFrame>
            }
          >
            <FeaturePageWrapper feature={feature} />
          </Suspense>
        ) : (
          <PageFrame title={t('featureView.empty.title')} description={t('featureView.empty.description')}>
            <div className="text-sm text-muted-foreground">
              {t('featureView.empty.body')}
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
