import { Plus } from 'lucide-react';
import { Button, Card, CardContent } from './ui';
import { t, useLocale } from '../lib/i18n';
import SessionsComparisonCard from './SessionsComparisonCard';

// (v1.10.601) Extracted from SessionsView. The right-pane empty
// state — when both sessions and attached lists are empty (and
// not loading) we promote a Start-first CTA pair; otherwise a
// generic select-prompt with the comparison card. Pure display:
// parent owns modal openers.

interface Props {
  showStartFirst: boolean;
  onNewChat: () => void;
  onAttachNew: () => void;
}

export default function SessionsEmptyPanel({
  showStartFirst,
  onNewChat,
  onAttachNew,
}: Props) {
  useLocale();
  if (showStartFirst) {
    return (
      <Card className="flex flex-1 items-center justify-center border-dashed">
        <CardContent className="flex max-w-md flex-col items-center gap-4 p-6 text-center">
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-semibold">
              {t('sessions.empty.startFirstTitle')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('sessions.empty.startFirstBody')}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={onNewChat}
              aria-label={t('sessions.aria.newChat')}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('sessions.empty.startFirstChat')}
            </Button>
            <Button
              variant="outline"
              onClick={onAttachNew}
              aria-label={t('sessions.aria.attachExisting')}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('sessions.empty.attachExisting')}
            </Button>
          </div>
          <SessionsComparisonCard />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="flex flex-1 items-center justify-center border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center text-sm text-muted-foreground">
        <span>{t('sessions.empty.selectPrompt')}</span>
        <SessionsComparisonCard />
      </CardContent>
    </Card>
  );
}
