import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button, IconButton, Input } from './ui';
import { cn } from '../lib/cn';
import { FEATURES, findFeature, type FeatureDef } from '../pages/registry';
import { t, tList, useLocale } from '../lib/i18n';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
  // The currently visible feature page id, or null when the help drawer
  // is opened from a non-feature tab. Used to expand the matching card
  // by default and scroll it into view.
  activeFeatureId?: string | null;
}

interface HelpEntry {
  id: string;
  title: string;
  summary: string;
  cli: string | null;
  example: string | null;
  useCases: string[];
}

function featureToEntry(f: FeatureDef): HelpEntry {
  const id = f.id;
  const keyBase = toKeyBase(id);
  return {
    id,
    title: f.label,
    summary: t(`${keyBase}.summary`),
    cli: safe(t(`${keyBase}.cli`)),
    example: safe(t(`${keyBase}.example`)),
    useCases: tList(`${keyBase}.useCases`),
  };
}

// Registry ids use kebab-case (e.g. "token-usage"). i18n keys use camel
// (e.g. "tokenUsage.summary"). Keep this mapping in one place so every
// consumer goes through it.
function toKeyBase(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function safe(value: string): string | null {
  if (!value) return null;
  // t() returns the raw key when both bundles miss — treat as absent.
  if (/^[a-zA-Z0-9_.-]+$/.test(value) && value.includes('.')) return null;
  return value;
}

// 8.33: help drawer. Right-side slide-out with global intro + per-page
// cards. Searchable. Press Escape to close.

export function HelpDrawer({ open, onClose, activeFeatureId }: HelpDrawerProps) {
  useLocale();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Delay focus so the slide-in animation finishes first.
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      window.cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // Scroll the active feature into view on open.
    const frame = window.requestAnimationFrame(() => {
      activeCardRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, activeFeatureId]);

  const entries = useMemo(() => FEATURES.map(featureToEntry), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const haystack = [
        e.title,
        e.summary,
        e.cli || '',
        e.example || '',
        e.useCases.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  const active = findFeature(activeFeatureId ?? null);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-[90] transition-colors',
        open ? 'bg-background/60' : 'pointer-events-none bg-transparent',
      )}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('common.helpCenter')}
        data-help-drawer
        data-open={open}
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            {t('help.title')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            onClick={onClose}
            icon={<X className="h-4 w-4" />}
          />
        </header>
        <div className="border-b border-border px-4 py-2">
          <label className="flex items-center gap-2 text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              className="h-8"
              aria-label={t('common.search')}
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          <section className="mb-4">
            <p className="mb-2 text-muted-foreground">
              {t('help.globalIntro')}
            </p>
            <p className="mb-2 text-muted-foreground">{t('help.featureNav')}</p>
            <p className="text-muted-foreground">{t('help.cliMapping')}</p>
            <p className="mt-2 text-xs italic text-muted-foreground">
              {t('help.shortcutHint')}
            </p>
          </section>
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('common.noResults')}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((entry) => {
                const isActive = active?.id === entry.id;
                return (
                  <li key={entry.id}>
                    <div
                      ref={isActive ? activeCardRef : undefined}
                      data-help-entry={entry.id}
                      data-active={isActive}
                      className={cn(
                        'rounded-md border border-border p-3',
                        isActive
                          ? 'border-primary/40 bg-primary/5'
                          : 'bg-muted/30',
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {entry.title}
                        </h3>
                        {entry.cli && (
                          <code className="font-mono text-[11px] text-muted-foreground">
                            {entry.cli}
                          </code>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.summary}
                      </p>
                      {entry.useCases.length > 0 && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-foreground">
                          {entry.useCases.map((uc, i) => (
                            <li key={i}>{uc}</li>
                          ))}
                        </ul>
                      )}
                      {entry.example && (
                        <p className="mt-2 whitespace-pre-line text-xs text-foreground">
                          <span className="mr-1 uppercase tracking-wide text-muted-foreground">
                            {t('common.example')}:
                          </span>
                          {entry.example}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>{t('help.shortcutHint')}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

HelpDrawer.displayName = 'HelpDrawer';
