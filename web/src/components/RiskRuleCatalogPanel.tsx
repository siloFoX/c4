import { useState } from 'react';
import { Badge, Fieldset, Input, Panel } from './ui';
import type { BadgeVariant } from './ui/badge';
import { t, useLocale } from '../lib/i18n';
import { useToggle } from '../lib/use-toggle';
import { useLazyRiskPatterns } from '../lib/use-lazy-risk-patterns';

// (v1.10.568) Extracted from Risk page. The rule-catalog viewer
// — collapsible panel that lazy-fetches /api/risk/patterns on
// first open (payload can be sizeable) and shows builtin
// pattern counts + a filtered list per severity.
// (v1.10.727) Lazy patterns fetch + state moved to lib/use-lazy-risk-patterns.
// (v1.11.144) Per-level chip switched from inline class map to
// the shared Badge semantic variants — high/critical fold to
// 'error' (the orange/red distinction is dropped in favour of
// the design-system tokens).

const LEVEL_VARIANT: Record<'critical' | 'high' | 'medium' | 'low', BadgeVariant> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

export default function RiskRuleCatalogPanel() {
  useLocale();
  const [filter, setFilter] = useState('');
  const [open, toggleOpen] = useToggle();
  // (v1.10.357) Lazy-load on first open. The payload can be
  // sizeable; avoid fetching when the operator never expands.
  // (v1.10.727) Fetch + state moved to use-lazy-risk-patterns hook.
  const patterns = useLazyRiskPatterns({ open });

  return (
    <Panel className="mt-4 text-sm">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <h3 className="text-base font-semibold text-foreground">
          {t('riskPage.ruleCatalog')}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {open ? '▾' : '▸'}
          {patterns ? ` · ${patterns.counts.builtin.total} builtin · ${patterns.counts.custom.total} custom · ${patterns.allowList} allow · ${patterns.denyList} deny` : ''}
        </span>
      </button>
      {open ? (
        patterns ? (
          <Fieldset
            legend={t('riskPage.filter.label')}
            className="mt-2"
          >
            <Input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('riskPage.filter.placeholder')}
              aria-label={t('riskPage.filter.label')}
              className="h-7 text-[11px]"
            />
            {(['critical', 'high', 'medium'] as const).map((lv) => {
              const items = (patterns.builtin[lv] || []).filter((p) => {
                if (!filter) return true;
                const f = filter.toLowerCase();
                return p.code.toLowerCase().includes(f) ||
                       p.label.toLowerCase().includes(f);
              });
              if (items.length === 0) return null;
              return (
                <div key={lv}>
                  <Badge variant={LEVEL_VARIANT[lv]} className="mb-1 px-1.5 py-0 text-[10px] uppercase tracking-wide">
                    {lv} · {items.length}
                  </Badge>
                  <ul className="space-y-0.5 pl-3 text-[11px]">
                    {items.map((p) => (
                      <li key={p.code}>
                        <code className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                          {p.code}
                        </code>
                        <span className="ml-1 text-muted-foreground">— {p.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {patterns.counts.custom.total > 0 ? (
              <div className="rounded border border-border bg-muted/10 p-2 text-[11px]">
                <div className="font-medium">{t('riskPage.customRules')}</div>
                <div className="text-muted-foreground">
                  {patterns.counts.custom.critical} critical ·
                  {' '}{patterns.counts.custom.high} high ·
                  {' '}{patterns.counts.custom.medium} medium
                  {' '}(content not shown — inspect the daemon&apos;s config.json)
                </div>
              </div>
            ) : null}
          </Fieldset>
        ) : (
          <div className="mt-2 text-[12px] text-muted-foreground">{t('riskPage.loadingCatalog')}</div>
        )
      ) : null}
    </Panel>
  );
}
