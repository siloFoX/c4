import { X } from 'lucide-react';
import { Button, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useMeetingTemplateEditor } from '../lib/use-meeting-template-editor';

// (v1.10.538) Extracted from MeetingsView. Inline template editor
// (create / edit / delete) for saved meeting templates. Drops
// ~120 lines from MeetingsView's mega-component.
//
// Controlled component: parent owns `open` + `tpl` (the template
// being edited, or null when creating new). Editor manages its
// own form / busy / message state. Mutating ops bubble up via
// onSaved / onDeleted so the parent can refresh the template
// list and clear any composer selection that pointed at a
// deleted name.

interface TemplateLike {
  name: string;
  task: string;
  track?: string | null;
  description?: string | null;
}

interface Props {
  open: boolean;
  tpl: TemplateLike | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (deletedName: string) => void;
}

export default function MeetingsTemplateEditor({ open, tpl, onClose, onSaved, onDeleted }: Props) {
  useLocale();

  const mode: 'create' | 'edit' = tpl ? 'edit' : 'create';
  const originalName = tpl?.name ?? '';

  // (v1.10.700) Form state + save + delete moved to hook.
  const {
    name, setName,
    task, setTask,
    track, setTrack,
    description, setDescription,
    busy, msg, failed,
    handleSave, handleDelete,
  } = useMeetingTemplateEditor({ open, tpl, onSaved, onDeleted });

  if (!open) return null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background/80 p-2 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {mode === 'edit'
            ? tFormat('meetings.template.editorEdit', { name: originalName })
            : t('meetings.template.editorNew')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t('meetings.action.closeTemplateEditor')}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('meetings.template.name.placeholder')}
        aria-label={t('meetings.template.name.label')}
        disabled={busy}
        className="h-7 text-[11px]"
      />
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={t('meetings.template.task.placeholder')}
        aria-label={t('meetings.template.task.label')}
        disabled={busy}
        className="min-h-[80px] rounded border border-border bg-background p-2 text-[11px] font-mono"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-muted-foreground">
          {t('meetings.label.track')}
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            disabled={busy}
            aria-label={t('meetings.template.track.label')}
            className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          >
            <option value="">auto</option>
            <option value="lightweight">{t('meetings.mode.lightweight')}</option>
            <option value="standard">{t('meetings.mode.standard')}</option>
            <option value="full">{t('meetings.mode.full')}</option>
          </select>
        </label>
      </div>
      <Input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('meetings.template.description.placeholder')}
        aria-label={t('meetings.template.description.label')}
        disabled={busy}
        className="h-7 text-[11px]"
      />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={busy || !name.trim() || !task.trim()}
          className="h-6 px-2 text-[10px]"
        >
          {busy ? '…' : mode === 'edit' ? t('meetings.template.saveChanges') : t('meetings.template.create')}
        </Button>
        {mode === 'edit' ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            disabled={busy}
            className="h-6 px-2 text-[10px]"
          >
            {t('common.delete')}
          </Button>
        ) : null}
        {msg ? (
          <span className={cn(
            'truncate',
            failed ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
