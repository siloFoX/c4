import { useLocale } from '../lib/i18n';

// (v1.10.621) Extracted from ChatView. The 2-tier error banners
// — primary destructive alert when something hard fails, plus
// a secondary amber banner when only the past-message backfill
// failed but the live stream still works. Pure display.

interface Props {
  error: string | null;
  backfillError: string | null;
}

export default function ChatErrorBanners({ error, backfillError }: Props) {
  useLocale();
  return (
    <>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}
      {backfillError && !error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
        >
          <span className="min-w-0 break-words">
            Past-message backfill failed: {backfillError}. Live stream is still connected.
          </span>
        </div>
      )}
    </>
  );
}
