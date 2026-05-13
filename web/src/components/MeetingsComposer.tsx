import { useCallback, useMemo, useState } from 'react';
import { Button, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import MeetingsTemplateEditor from './MeetingsTemplateEditor';
import { useMeetingClassifyPreview } from '../lib/use-meeting-classify-preview';
import { useMeetingPreviewPlan } from '../lib/use-meeting-preview-plan';
import { useMeetingTemplates, type MeetingTemplate } from '../lib/use-meeting-templates';
import { useMeetingCreate } from '../lib/use-meeting-create';
import type { MeetingTrackOrAuto } from './MeetingsSearchFacets';

// (v1.10.557) Extracted from MeetingsView. Create-meeting
// composer — template chips with edit pencils, the embedded
// template editor, the placeholder-vars input grid, the new-task
// textarea + track selector, the dispatcher preview hint, the
// classifier preview chip, and the Create / Cancel buttons.
//
// Owns all composer state internally; parent provides only
// open/close/onCreated callbacks. This was the largest remaining
// inline block in MeetingsView.

// (v1.10.649) Template type + saved-templates load moved
// to lib/use-meeting-templates. Re-exported here as
// `Template` so existing JSX consumers keep working.
type Template = MeetingTemplate;

// (v1.10.647) ClassifyPreview type + debounced fetch hook
// moved to lib/use-meeting-classify-preview.
// (v1.10.648) PreviewPlan type + debounced plan fetch moved
// to lib/use-meeting-preview-plan.

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (newMeetingId: string) => void;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export default function MeetingsComposer({ open, onClose, onCreated }: Props) {
  useLocale();

  const [newTask, setNewTask] = useState('');
  const [newTrack, setNewTrack] = useState<MeetingTrackOrAuto>('auto');

  // (v1.10.649) Saved templates load + refresh moved to hook.
  const { templates, refresh: loadTemplates } = useMeetingTemplates({ open });

  // (8.4) Template-with-vars flow.
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  // (v1.10.538) Inline template editor — parent owns only the
  // open/target pair; the editor handles its own form state.
  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const [tplEditTarget, setTplEditTarget] = useState<Template | null>(null);
  const openTplEditor = useCallback((tpl?: Template) => {
    setTplEditTarget(tpl || null);
    setTplEditorOpen(true);
  }, []);

  // (v1.10.761) Stable "clear template" callback — drops the
  // 2-line `setTemplateName(null) + setTemplateVars({})` arrow
  // from the chip-row JSX.
  const clearTemplate = useCallback(() => {
    setTemplateName(null);
    setTemplateVars({});
  }, []);

  // Placeholder names — refreshed on newTask change.
  const placeholderNames = useMemo(() => {
    const out = new Set<string>();
    let m;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(newTask)) !== null) {
      const captured = m[1];
      if (captured) out.add(captured);
    }
    return [...out];
  }, [newTask]);

  // (v1.10.647) Track classifier preview moved to hook.
  const classifyPreview = useMeetingClassifyPreview({ open, newTask });

  // (v1.10.648) Dispatcher preview moved to hook.
  const { previewPlan, previewBusy } = useMeetingPreviewPlan({ open, newTask, newTrack });

  // (v1.10.679) POST /api/meetings + form-reset moved to hook.
  const { createBusy, createError, setCreateError, handleCreate } = useMeetingCreate({
    newTask, newTrack, templateName, templateVars,
    setNewTask, setTemplateName, setTemplateVars, onCreated,
  });

  // (v1.10.762) Stable cancel callback — drops the inline
  // `() => { onClose(); setCreateError(null); }` arrow. Sits
  // below useMeetingCreate so setCreateError is defined.
  const handleCancel = useCallback(() => {
    onClose();
    setCreateError(null);
  }, [onClose, setCreateError]);

  // (v1.10.768) Stable apply-template callback. JSX still
  // allocates `() => applyTemplate(tpl)` per loop iteration
  // (since `tpl` is the closure variable), but the 4-line
  // body lives once on the hook.
  const applyTemplate = useCallback((tpl: Template) => {
    setNewTask(tpl.task);
    if (tpl.track) {
      setNewTrack(tpl.track as typeof newTrack);
    }
    setTemplateName(tpl.name);
    setTemplateVars({});
  }, []);

  if (!open) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-muted-foreground">{t('meetings.templates.label')}</span>
        {templates.map((tpl) => (
          <span key={tpl.name} className="inline-flex items-center">
            <Button
              size="sm"
              variant={templateName === tpl.name ? 'default' : 'outline'}
              onClick={() => applyTemplate(tpl)}
              title={tpl.description || tpl.task}
              aria-label={tFormat('meetings.aria.applyTemplate', { name: tpl.name })}
              className="h-6 px-2 text-[11px] rounded-r-none"
            >
              {tpl.name}
            </Button>
            {/* (v1.10.344) Edit pencil — opens the inline editor pre-filled. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openTplEditor(tpl);
              }}
              title={tFormat('meetings.aria.editTemplate', { name: tpl.name })}
              aria-label={tFormat('meetings.aria.editTemplate', { name: tpl.name })}
              className="rounded-r border border-l-0 border-border bg-background px-1 py-1 text-[10px] text-muted-foreground hover:bg-muted/30"
            >
              ✎
            </button>
          </span>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => openTplEditor()}
          aria-label={t('meetings.action.newTemplate')}
          title={t('meetings.tooltip.saveTemplate')}
          className="h-6 px-2 text-[11px]"
        >
          + New
        </Button>
        {templateName ? (
          <Button
            size="sm"
            variant="outline"
            onClick={clearTemplate}
            aria-label={t('meetings.action.clearTemplate')}
            className="h-6 px-2 text-[11px] text-muted-foreground"
          >
            clear
          </Button>
        ) : null}
      </div>
      <MeetingsTemplateEditor
        open={tplEditorOpen}
        tpl={tplEditTarget}
        onClose={() => setTplEditorOpen(false)}
        onSaved={() => {
          setTplEditorOpen(false);
          void loadTemplates();
        }}
        onDeleted={(deletedName) => {
          setTplEditorOpen(false);
          if (templateName === deletedName) setTemplateName(null);
          void loadTemplates();
        }}
      />
      {templateName && placeholderNames.length > 0 ? (
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border/40 bg-background/50 p-2 text-[11px]">
          <span className="col-span-2 text-muted-foreground">
            {t('meetings.template.needsValuesPrefix')}
            <span className="font-mono">{templateName}</span>
            {t('meetings.template.needsValuesSuffix')}
          </span>
          {placeholderNames.map((name) => (
            <label key={name} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] text-muted-foreground">{`{{${name}}}`}</span>
              <Input
                type="text"
                value={templateVars[name] || ''}
                onChange={(e) => setTemplateVars((v) => ({ ...v, [name]: e.target.value }))}
                placeholder={name}
                aria-label={tFormat('meetings.aria.valueFor', { name })}
                className="h-7 text-[11px]"
              />
            </label>
          ))}
        </div>
      ) : null}
      <Input
        type="text"
        value={newTask}
        onChange={(e) => setNewTask(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleCreate();
          } else if (e.key === 'Escape') {
            onClose();
            setCreateError(null);
          }
        }}
        placeholder={t('meetings.compose.task.placeholder')}
        disabled={createBusy}
        aria-label={t('meetings.compose.task')}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted-foreground">
          {t('meetings.label.track')}
          <select
            className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
            value={newTrack}
            onChange={(e) => setNewTrack(e.target.value as typeof newTrack)}
            disabled={createBusy}
            aria-label={t('meetings.compose.track')}
          >
            <option value="auto">{t('meetings.mode.auto')}</option>
            <option value="lightweight">{t('meetings.mode.lightweight')}</option>
            <option value="standard">{t('meetings.mode.standard')}</option>
            <option value="full">{t('meetings.mode.full')}</option>
          </select>
        </label>
        {/* (Phase 6.6) Classifier hint. */}
        {classifyPreview ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px]',
              newTrack !== 'auto' && newTrack !== classifyPreview.track
                ? 'border-warning/40 bg-warning/10 text-warning'
                : 'border-border bg-muted/30 text-muted-foreground',
            )}
            title={classifyPreview.reason}
          >
            auto would pick: <span className="font-medium">{classifyPreview.track}</span>
            {classifyPreview.matched.length > 0 ? (
              <span className="opacity-80">
                ({classifyPreview.matched.map((m) => m.term).join(', ')})
              </span>
            ) : null}
          </span>
        ) : null}
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={createBusy || !newTask.trim()}
          aria-label={t('meetings.compose.create')}
        >
          {t('meetings.action.createLabel')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={createBusy}
        >
          {t('common.cancel')}
        </Button>
        {createError ? (
          <span className="text-[11px] text-destructive">{createError}</span>
        ) : null}
      </div>
      {previewPlan ? (
        <div className="rounded-md border border-border/60 bg-background p-2 text-[11px]">
          <div className="font-medium">
            {tFormat('meetings.preview.summary', {
              track: previewPlan.track,
              size: previewPlan.rosterSize,
              tokens: previewPlan.estimatedTokens.toLocaleString(),
            })}
          </div>
          <div className="text-muted-foreground">
            consensus={previewPlan.consensusPolicy.mode}
            {' · '}roundCap={previewPlan.consensusPolicy.roundCap}
            {previewPlan.consensusPolicy.allowVeto ? ' · veto' : ''}
          </div>
          <ul className="mt-1 space-y-0.5">
            {previewPlan.stages.map((s) => (
              <li key={s.stage} className="flex flex-wrap gap-1">
                <span className="font-medium">[{s.stage}]</span>
                <span className="text-muted-foreground">{s.specialists.map((sp) => sp.id).join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : previewBusy ? (
        <div className="text-[11px] text-muted-foreground">{t('meetings.previewingRoster')}</div>
      ) : null}
    </div>
  );
}
