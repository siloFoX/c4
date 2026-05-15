import { Info, Plus } from 'lucide-react';
import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';
import {
  EMPTY_ATTACH_BANNER_TITLE_KEY,
  EMPTY_ATTACH_BANNER_BODY_KEY,
} from './SessionsView';
import { SessionsEmpty } from './illustrations';

// (v1.10.549) Extracted from SessionsView. Empty-state banner
// shown above the attached-sessions list when nothing has been
// attached yet — explains what attach does and points the
// operator at the AttachModal.

interface Props {
  onAttachClick: () => void;
}

export default function SessionsEmptyAttachBanner({ onAttachClick }: Props) {
  useLocale();
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs"
      role="note"
      aria-label={t('sessions.aria.attachIntro')}
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <SessionsEmpty
        size="sm"
        className="hidden shrink-0 text-muted-foreground sm:block"
      />
      <div className="flex-1">
        <div className="font-semibold text-foreground">
          {t(EMPTY_ATTACH_BANNER_TITLE_KEY)}
        </div>
        <p className="mt-1 text-muted-foreground">{t(EMPTY_ATTACH_BANNER_BODY_KEY)}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={onAttachClick}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('sessions.attach.firstSession')}
        </Button>
      </div>
    </div>
  );
}
