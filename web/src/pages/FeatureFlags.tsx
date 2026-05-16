import { RotateCcw, Sparkles } from 'lucide-react';
import PageFrame from './PageFrame';
import { Alert, AlertBanner, Button, Panel, Switch } from '../components/ui';
import HelpTip from '../components/HelpTip';
import { t, useLocale } from '../lib/i18n';
import {
  FLAGS,
  resetFlags,
  setFlag,
  useAllFlags,
} from '../lib/feature-flags';

// (v1.11.216 / patch 11.198) Admin page for component-scoped UI feature
// flags. Lists every flag declared in lib/feature-flags.ts as a Panel
// row with a Switch on the right; Reset clears the persisted overrides
// and restores defaults. The page is the user-facing surface for the
// `c4:feature-flags` localStorage key + the `feature-flag-changed`
// CustomEvent that consumers subscribe to via useFeatureFlag().

export default function FeatureFlags() {
  useLocale();
  const values = useAllFlags();
  const customized = FLAGS.some((f) => values[f.key] !== f.defaultValue);

  return (
    <PageFrame
      title={t('feature.featureFlags.label')}
      description={t('feature.featureFlags.description')}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => resetFlags()}
          disabled={!customized}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </Button>
      }
    >
      {/* (v1.11.275, TODO 11.257) AlertBanner replaces the
          inline Alert. The "experimental badge" framing -- these
          flags ship UI experiments that the operator opts into
          per browser -- is exactly the AlertBanner role=alert +
          aria-live polite contract. Sparkles icon stays as the
          experimental visual cue. */}
      <AlertBanner
        severity="info"
        icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
        title="Component-scoped flags"
        data-testid="feature-flags-experimental-banner"
      >
        These switches toggle browser-local UI behavior only. They persist
        in <code className="font-mono">localStorage</code> under{' '}
        <code className="font-mono">c4:feature-flags</code> and never round-trip
        to the daemon.
      </AlertBanner>
      <ul className="flex flex-col gap-2">
        {FLAGS.map((flag) => {
          const checked = values[flag.key];
          const overridden = checked !== flag.defaultValue;
          return (
            <li key={flag.key}>
              <Panel className="p-3">
                <div className="flex flex-row items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {flag.label}
                        {/* (v1.11.264, TODO 11.246) Per-row HelpTip.
                            Surfaces the persistent storage location +
                            default value + reset behaviour so the
                            operator can predict what flipping the
                            Switch will do (and what Reset restores). */}
                        <HelpTip
                          ariaLabel={`Help for ${flag.label}`}
                          data-testid={`feature-flag-help-${flag.key}`}
                          content={`${flag.description}\n\nStorage: \`localStorage\` key \`c4:feature-flags\`. Default value: \`${String(
                            flag.defaultValue,
                          )}\`. Use the Reset button at the top of the page to revert this flag to its default.`}
                        />
                      </span>
                      {overridden ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (override)
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {flag.description}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                      key={flag.key} default={String(flag.defaultValue)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Switch
                      checked={checked}
                      onChange={(next) => setFlag(flag.key, next)}
                      aria-label={`Toggle ${flag.label}`}
                    />
                  </div>
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>
    </PageFrame>
  );
}
