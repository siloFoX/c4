import { Trash2 } from 'lucide-react';
import { Button, CardHeader, CardTitle } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// (v1.10.592) Extracted from SpecialistsView. The detail-pane
// card header — title (placeholder vs selected.id/displayName),
// Remove button, and the confirm-remove block. Pure display:
// parent owns selection + busy state + remove handler.

interface Props {
  selected: Specialist | null;
  confirmRemoveId: string | null;
  removeBusy: boolean;
  onConfirmRemove: (id: string | null) => void;
  onRemove: (id: string) => void;
}

export default function SpecialistsDetailHeader({
  selected,
  confirmRemoveId,
  removeBusy,
  onConfirmRemove,
  onRemove,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {selected
            ? tFormat('specialists.title.selected', { id: selected.id, name: selected.displayName })
            : t('specialists.title.select')}
        </CardTitle>
        {selected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConfirmRemove(selected.id)}
            disabled={removeBusy}
            className="text-destructive hover:bg-destructive/10"
            aria-label={tFormat('specialists.action.removeAria', { id: selected.id })}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {t('common.remove')}
          </Button>
        ) : null}
      </div>
      {confirmRemoveId && selected && confirmRemoveId === selected.id ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px]">
          <span>
            {t('specialists.confirmRemove.prefix')}
            <span className="font-mono">{selected.id}</span>
            {t('specialists.confirmRemove.suffix')}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConfirmRemove(null)}
            disabled={removeBusy}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => onRemove(selected.id)}
            disabled={removeBusy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('specialists.action.confirmRemove')}
          </Button>
        </div>
      ) : null}
    </CardHeader>
  );
}
