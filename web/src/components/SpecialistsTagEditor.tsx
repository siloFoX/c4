import { useEffect, useState } from 'react';
import { Button, Chip, HScroll, TagInput } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { apiPatch } from '../lib/api';

// (v1.10.559) Extracted from SpecialistsView. Tag editor.
// (11.174) Migrated to the new <TagInput> primitive. The legacy
// `+foo,bar` add / `-foo,bar` remove CSV prefixes are dropped --
// the editor now sends `mode: 'replace'` only, with the live tag
// array assembled from TagInput chips. The hook
// `use-specialist-tag-editor` is bypassed because its CSV /
// prefix semantics no longer map onto a tag-array UI.

interface Props {
  specialistId: string;
  tags: string[] | undefined;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export default function SpecialistsTagEditor({ specialistId, tags, onSaved, onError }: Props) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValue(Array.isArray(tags) ? [...tags] : []);
  }, [open, tags]);

  const handleSave = async () => {
    if (value.length === 0) return;
    setBusy(true);
    try {
      await apiPatch(`/api/specialists/${encodeURIComponent(specialistId)}/tags`, {
        tags: value,
        mode: 'replace',
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      onError(
        tFormat('specialists.tagEdit.failed', {
          error: (e as Error).message || t('common.failed'),
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground">{t('specialists.label.tags')}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((p) => !p)}
          className="h-6 px-2 text-[10px]"
        >
          {open ? t('specialists.tags.cancel') : t('specialists.tags.edit')}
        </Button>
      </div>
      {!open ? (
        Array.isArray(tags) && tags.length > 0 ? (
          <HScroll gap="sm" snap={false} className="mt-1">
            {tags.map((tag) => (
              <Chip
                key={tag}
                data-h-scroll-item
                tone="primary"
                className="px-1.5 py-0 text-[10px]"
              >
                #{tag}
              </Chip>
            ))}
          </HScroll>
        ) : (
          <div className="mt-1">
            <span className="text-[11px] text-muted-foreground italic">
              {t('specialists.tags.empty')}
            </span>
          </div>
        )
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <TagInput
            value={value}
            onChange={setValue}
            placeholder={t('specialists.tags.placeholder')}
            ariaLabel={t('specialists.action.editTags')}
            disabled={busy}
            normalize={(raw) => raw.trim()}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={busy || value.length === 0}
            className="h-7 px-2 text-[11px]"
          >
            {t('common.apply')}
          </Button>
        </div>
      )}
    </div>
  );
}
