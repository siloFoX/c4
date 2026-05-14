import { Badge, Button, Input } from './ui';
import { t, useLocale } from '../lib/i18n';
import { useSpecialistTagEditor } from '../lib/use-specialist-tag-editor';

// (v1.10.559) Extracted from SpecialistsView. Tag editor —
// PATCH /specialists/:id/tags with replace / add / remove modes.
// Operator types a comma-separated list; a leading '+' means
// add, leading '-' means remove, otherwise replace wholesale.
//
// Owns its own open/value/busy state; bubbles save success
// via `onSaved` and surface-level errors via `onError`.

interface Props {
  specialistId: string;
  tags: string[] | undefined;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export default function SpecialistsTagEditor({ specialistId, tags, onSaved, onError }: Props) {
  useLocale();

  // (v1.10.706) Tag-editor flow moved to lib/use-specialist-tag-editor.
  // (v1.10.760) `toggleWithTags` combines the toggle + prefill so the
  // edit/cancel button references one stable callback.
  const { open, toggleWithTags, value, setValue, busy, handleSave } =
    useSpecialistTagEditor({ specialistId, onSaved, onError });

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground">{t('specialists.label.tags')}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleWithTags(tags)}
          className="h-6 px-2 text-[10px]"
        >
          {open ? t('specialists.tags.cancel') : t('specialists.tags.edit')}
        </Button>
      </div>
      {!open ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.isArray(tags) && tags.length > 0
            ? tags.map((tag) => (
                <Badge key={tag} variant="info" className="px-1.5 py-0 text-[10px]">
                  #{tag}
                </Badge>
              ))
            : <span className="text-[11px] text-muted-foreground italic">{t('specialists.tags.empty')}</span>}
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('specialists.tags.placeholder')}
            aria-label={t('specialists.action.editTags')}
            className="h-7 flex-1 text-[11px]"
            disabled={busy}
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={busy}
            className="h-7 px-2 text-[11px]"
          >
            {t('common.apply')}
          </Button>
        </div>
      )}
    </div>
  );
}
