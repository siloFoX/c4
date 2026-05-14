import { Button, Tooltip } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

// (v1.10.608) Extracted from WikiView. The Bulk Publish row —
// idempotent "publish all" button + 2 git toggles + result
// message. Pure controlled inputs: parent owns busy / git state
// + publish handler. Lives just under the search controls
// inside the same CardHeader.

interface Props {
  busy: boolean;
  gitCommit: boolean;
  gitPush: boolean;
  msg: string | null;
  failed: boolean;
  onGitCommit: (next: boolean) => void;
  onGitPush: (next: boolean) => void;
  onPublish: () => void;
}

export default function WikiBulkPublishRow({
  busy,
  gitCommit,
  gitPush,
  msg,
  failed,
  onGitCommit,
  onGitPush,
  onPublish,
}: Props) {
  useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 text-[11px]">
      <Tooltip label={t('wiki.publishAll.title')}>
        <Button
          size="sm"
          variant="outline"
          onClick={onPublish}
          disabled={busy}
          aria-label={t('wiki.publishAll.label')}
        >
          {busy ? t('wiki.publishAll.publishing') : t('wiki.publishAll')}
        </Button>
      </Tooltip>
      <label className="flex items-center gap-1 text-muted-foreground">
        <input
          type="checkbox"
          checked={gitCommit}
          onChange={(e) => onGitCommit(e.target.checked)}
          disabled={busy}
          className="h-3 w-3"
        />
        {t('wiki.gitCommit')}
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        <input
          type="checkbox"
          checked={gitPush}
          onChange={(e) => onGitPush(e.target.checked)}
          disabled={busy}
          className="h-3 w-3"
        />
        {t('wiki.gitPush')}
      </label>
      {msg ? (
        <span className={cn(
          'text-[11px]',
          failed ? 'text-destructive' : 'text-muted-foreground',
        )}>{msg}</span>
      ) : null}
    </div>
  );
}
