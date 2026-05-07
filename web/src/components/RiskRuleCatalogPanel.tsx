import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { Input, Panel } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

// (v1.10.568) Extracted from Risk page. The rule-catalog viewer
// — collapsible panel that lazy-fetches /api/risk/patterns on
// first open (payload can be sizeable) and shows builtin
// pattern counts + a filtered list per severity. Self-contained:
// owns open / filter / patterns state internally.

interface PatternEntry {
  code: string;
  label: string;
}

interface PatternsResponse {
  builtin: {
    critical: PatternEntry[];
    high: PatternEntry[];
    medium: PatternEntry[];
  };
  custom: {
    critical: unknown[];
    high: unknown[];
    medium: unknown[];
  };
  counts: {
    builtin: { critical: number; high: number; medium: number; total: number };
    custom: { critical: number; high: number; medium: number; total: number };
  };
  allowList: number;
  denyList: number;
}

const LEVEL_TONE: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40',
  critical: 'bg-destructive/10 text-destructive border-destructive/40',
};

export default function RiskRuleCatalogPanel() {
  useLocale();
  const [patterns, setPatterns] = useState<PatternsResponse | null>(null);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);

  // (v1.10.357) Lazy-load on first open. The payload can be
  // sizeable; avoid fetching when the operator never expands.
  useEffect(() => {
    if (!open || patterns) return;
    apiGet<PatternsResponse>('/api/risk/patterns')
      .then((res) => setPatterns(res))
      .catch(() => { /* silent — panel just stays empty */ });
  }, [open, patterns]);

  return (
    <Panel className="mt-4 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
          <div className="mt-2 flex flex-col gap-2">
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
                  <div className={cn('mb-1 inline-block rounded border px-1.5 py-0 text-[10px] uppercase tracking-wide', LEVEL_TONE[lv])}>
                    {lv} · {items.length}
                  </div>
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
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-muted-foreground">{t('riskPage.loadingCatalog')}</div>
        )
      ) : null}
    </Panel>
  );
}
