import { BookOpen } from 'lucide-react';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { ReadResponse } from './WikiView';

// (v1.10.600) Extracted from WikiView. The right-pane page
// body — empty/error/loading states or the metadata grid +
// related-pages chips + raw markdown pre. Pure display:
// parent owns selectedPath + page state and onSelectPath.

interface Props {
  selectedPath: string | null;
  page: ReadResponse | null;
  pageError: string | null;
  onSelectPath: (path: string) => void;
}

export default function WikiPageDetail({
  selectedPath,
  page,
  pageError,
  onSelectPath,
}: Props) {
  useLocale();
  if (!selectedPath) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <BookOpen className="mr-2 h-3.5 w-3.5" aria-hidden />
        {t('wiki.empty.pickPage')}
      </div>
    );
  }
  if (pageError) {
    return <div className="text-sm text-destructive">{pageError}</div>;
  }
  if (!page) {
    return <div className="text-sm text-muted-foreground">{t('wiki.loadingPage')}</div>;
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground">{t('wiki.field.type')}</div>
          <div className="font-medium">{(page.frontmatter['type'] as string) || '-'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('wiki.field.status')}</div>
          <div className="font-medium">{(page.frontmatter['status'] as string) || '-'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('wiki.field.lastReviewed')}</div>
          <div className="font-medium">{(page.frontmatter['last_reviewed'] as string) || '-'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('wiki.field.path')}</div>
          <div className="truncate font-medium">{page.path}</div>
        </div>
      </div>
      {/* (Phase 6.12) Related pages — auto-derived from
          transcript markers + meeting/ADR refs. Render as
          clickable chips when there's any. */}
      {Array.isArray(page.frontmatter['related']) && (page.frontmatter['related'] as unknown[]).length > 0 ? (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground">{tFormat('wiki.relatedCount', { count: (page.frontmatter['related'] as unknown[]).length })}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(page.frontmatter['related'] as unknown[]).map((r, i) => {
              const ref = String(r);
              const isWikiPath = /\.md$/.test(ref);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => isWikiPath ? onSelectPath(ref) : null}
                  className={cn(
                    'rounded border border-border bg-background px-1.5 py-0 font-mono text-[10px]',
                    isWikiPath ? 'hover:bg-accent/40' : 'cursor-default opacity-70',
                  )}
                  title={isWikiPath ? `Open ${ref}` : ref}
                  disabled={!isWikiPath}
                >
                  {ref}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-[12px] font-mono">
        {page.body}
      </pre>
    </>
  );
}
