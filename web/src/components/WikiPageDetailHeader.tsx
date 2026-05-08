import { RotateCcw } from 'lucide-react';
import { Button, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import type { ReadResponse } from './WikiView';

// (v1.10.619) Extracted from WikiView. The right-pane card
// header — title (page title or fallback) + Reopen button +
// reopen result message. Pure controlled inputs: parent owns
// reopenBusy/Msg/Failed + the reopen handler.

interface Props {
  page: ReadResponse | null;
  selectedPath: string | null;
  reopenBusy: boolean;
  reopenMsg: string | null;
  reopenFailed: boolean;
  onReopen: (path: string) => void;
}

export default function WikiPageDetailHeader({
  page,
  selectedPath,
  reopenBusy,
  reopenMsg,
  reopenFailed,
  onReopen,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {page ? (page.frontmatter['title'] as string) || page.path : t('wiki.title.select')}
        </CardTitle>
        {page && selectedPath && page.frontmatter['status'] !== 'reopened' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReopen(selectedPath)}
            disabled={reopenBusy}
            aria-label={t('wiki.reopen.label')}
            title={t('wiki.tooltip.reopen')}
          >
            <RotateCcw className={cn('h-3.5 w-3.5', reopenBusy && 'animate-spin')} aria-hidden />
            {t('wiki.reopen')}
          </Button>
        ) : null}
      </div>
      {reopenMsg ? (
        <span className={cn(
          'text-[11px]',
          reopenFailed ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
        )}>
          {reopenMsg}
        </span>
      ) : null}
    </CardHeader>
  );
}
