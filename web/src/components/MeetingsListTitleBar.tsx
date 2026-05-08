import { Plus, RefreshCw } from 'lucide-react';
import { Button, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

// (v1.10.602) Extracted from MeetingsView. The master-pane card
// header title row — title + New / Refresh action buttons.
// Pure controlled inputs: parent owns creating + loading state.

interface Props {
  creating: boolean;
  loading: boolean;
  onToggleCreating: () => void;
  onRefresh: () => void;
}

export default function MeetingsListTitleBar({
  creating,
  loading,
  onToggleCreating,
  onRefresh,
}: Props) {
  useLocale();
  return (
    <div className="flex flex-row items-center justify-between gap-2">
      <CardTitle className="text-base">{t('meetings.title')}</CardTitle>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onToggleCreating}
          aria-label={t('meetings.action.new')}
          aria-expanded={creating}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('meetings.action.newLabel')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          aria-label={t('meetings.action.refresh')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
          {t('common.refresh')}
        </Button>
      </div>
    </div>
  );
}
