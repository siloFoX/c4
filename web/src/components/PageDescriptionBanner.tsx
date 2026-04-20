import { HelpCircle, Sparkles, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tList, useLocale } from '../lib/i18n';

interface PageDescriptionBannerProps {
  // i18n keys. Summary is required; the rest are optional. Missing keys
  // fall back through the English bundle automatically (see lib/i18n).
  summaryKey: string;
  cliKey?: string;
  exampleKey?: string;
  useCasesKey?: string;
  // Opens the help drawer for this page.
  onOpenHelp?: () => void;
  // Rendered on the right of the banner (e.g., "Try example" button).
  action?: ReactNode;
  className?: string;
  // Data attribute so tests and onboarding tour can target the banner.
  testId?: string;
}

// 8.33: every CLI-coverage page opens with a shared banner so the user
// never has to guess what the page does or which CLI command it maps to.
// The banner carries the 1-2 line summary, CLI equivalent, and a Help
// affordance. Pages may inject an `action` for a "Try example" CTA.

export function PageDescriptionBanner({
  summaryKey,
  cliKey,
  exampleKey,
  useCasesKey,
  onOpenHelp,
  action,
  className,
  testId = 'page-description-banner',
}: PageDescriptionBannerProps) {
  // Subscribe to locale changes so the banner re-renders when the user
  // flips the language selector.
  useLocale();

  const summary = t(summaryKey);
  const cli = cliKey ? t(cliKey) : null;
  const example = exampleKey ? t(exampleKey) : null;
  const useCases = useCasesKey ? tList(useCasesKey) : [];

  return (
    <section
      data-testid={testId}
      className={cn(
        'rounded-lg border border-primary/30 bg-primary/5 p-3 md:p-4',
        className,
      )}
      aria-label={t('common.helpCenter')}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkles
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {action}
          {onOpenHelp && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenHelp}
              aria-label={t('common.learnMore')}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>{t('common.learnMore')}</span>
            </Button>
          )}
        </div>
      </div>

      {cli && (
        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="uppercase tracking-wide">
              {t('common.cliEquivalent')}
            </span>
            <code className="ml-2 break-words font-mono text-foreground">
              {cli}
            </code>
          </div>
        </div>
      )}

      {useCases.length > 0 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none uppercase tracking-wide">
            {t('common.useCases')}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">
            {useCases.map((uc, i) => (
              <li key={i}>{uc}</li>
            ))}
          </ul>
        </details>
      )}

      {example && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none uppercase tracking-wide">
            {t('common.example')}
          </summary>
          <p className="mt-1 whitespace-pre-line text-foreground">{example}</p>
        </details>
      )}
    </section>
  );
}

PageDescriptionBanner.displayName = 'PageDescriptionBanner';
