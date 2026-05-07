import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { t, useLocale } from '../lib/i18n';
import { TOUR_STEPS } from './SessionsView';

// (v1.10.530) Extracted from SessionsView. Three-step onboarding
// modal shown on first visit to the Sessions tab. Dismissed on
// X / Skip / Done; stores `seen` in localStorage[TOUR_STORAGE_KEY]
// (managed by the parent — Tour itself is stateless beyond the
// step counter).

interface SessionsTourProps {
  onDismiss: () => void;
}

export default function SessionsTour({ onDismiss }: SessionsTourProps) {
  // Re-render on locale flip so step copy translates immediately.
  useLocale();
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  if (!current) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-end bg-black/30 p-4 md:items-start md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t('sessions.aria.onboarding')}
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-1 border-b border-border p-4">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              {t(current.titleKey)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {step + 1}/{TOUR_STEPS.length}
              </span>
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t('sessions.aria.dismissTour')}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 text-sm">
          <p className="text-muted-foreground">{t(current.bodyKey)}</p>
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={onDismiss}
            >
              {t('sessions.tour.skip')}
            </Button>
            {last ? (
              <Button size="sm" onClick={onDismiss}>
                {t('common.done')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                {t('common.next')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
