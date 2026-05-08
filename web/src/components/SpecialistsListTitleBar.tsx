import { Plus, RefreshCw } from 'lucide-react';
import { Button, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import SpecialistsAddPanel from './SpecialistsAddPanel';

// (v1.10.617) Extracted from SpecialistsView. The master-pane
// title row — title + Add toggle + Refresh button — plus the
// action-error alert and the add panel beneath it. Pure
// controlled inputs: parent owns add-open state + add handlers.

interface Props {
  loading: boolean;
  addOpen: boolean;
  actionError: string | null;
  onToggleAdd: () => void;
  onCloseAdd: () => void;
  onAdded: (newId: string) => void;
  onRefresh: () => void;
}

export default function SpecialistsListTitleBar({
  loading,
  addOpen,
  actionError,
  onToggleAdd,
  onCloseAdd,
  onAdded,
  onRefresh,
}: Props) {
  useLocale();
  return (
    <>
      <div className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t('specialists.title')}</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onToggleAdd}
            aria-label={t('specialists.add.label')}
            aria-expanded={addOpen}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t('common.add')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            aria-label={t('specialists.action.refresh')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
            {t('common.refresh')}
          </Button>
        </div>
      </div>
      {actionError ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {actionError}
        </div>
      ) : null}
      <SpecialistsAddPanel
        open={addOpen}
        onClose={onCloseAdd}
        onAdded={onAdded}
      />
    </>
  );
}
