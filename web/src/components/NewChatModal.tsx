import { Plus, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { t, useLocale } from '../lib/i18n';
import { useEscapeToClose } from '../lib/use-escape-to-close';
import { useNewChatForm } from '../lib/use-new-chat-form';

// (v1.10.539) Extracted from SessionsView. The claude.ai-style
// "start a new conversation" modal. Pure controlled component;
// previously inlined as `function NewChatModal()` inside
// SessionsView. Drops ~190 lines from SessionsView.

const MODEL_CHOICES: Array<{ value: string; labelKey: string; hintKey: string }> = [
  { value: 'default',           labelKey: 'sessions.model.default.label', hintKey: 'sessions.model.default.hint' },
  { value: 'claude-opus-4-7',   labelKey: 'sessions.model.opus.label',    hintKey: 'sessions.model.opus.hint' },
  { value: 'claude-sonnet-4-6', labelKey: 'sessions.model.sonnet.label',  hintKey: 'sessions.model.sonnet.hint' },
  { value: 'claude-haiku-4-5',  labelKey: 'sessions.model.haiku.label',   hintKey: 'sessions.model.haiku.hint' },
];

// Mirrors the builtin templates in src/pty-manager.js
// _getBuiltinTemplates(). 'profile' and 'template' are aliased on
// the /api/task path so passing profile: 'planner' applies the
// planner template (model + prompt prefix). Manager-style auto
// orchestration goes through POST /api/auto in a follow-up — for
// now the modal stays focused on plain chat spawns.
const AGENT_CHOICES: Array<{ value: string; labelKey: string; hintKey: string }> = [
  { value: 'generic',  labelKey: 'sessions.agent.generic.label',  hintKey: 'sessions.agent.generic.hint' },
  { value: 'planner',  labelKey: 'sessions.agent.planner.label',  hintKey: 'sessions.agent.planner.hint' },
  { value: 'executor', labelKey: 'sessions.agent.executor.label', hintKey: 'sessions.agent.executor.hint' },
  { value: 'reviewer', labelKey: 'sessions.agent.reviewer.label', hintKey: 'sessions.agent.reviewer.hint' },
];

export interface NewChatModalProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (req: { prompt: string; model: string; agent: string }) => void;
}

export default function NewChatModal({ open, busy, error, onClose, onSubmit }: NewChatModalProps) {
  useLocale();

  // (v1.10.734) Form fields + reset-on-open moved to use-new-chat-form.
  const { prompt, setPrompt, model, setModel, agent, setAgent } = useNewChatForm({ open });

  // (v1.10.714) Esc-to-close moved to use-escape-to-close hook.
  useEscapeToClose({ open, onClose, busy });

  if (!open) return null;
  const trimmed = prompt.trim();
  const canSubmit = !busy && trimmed.length > 0;
  // (review fix 2026-05-01) Backdrop click closes only when not
  // submitting — otherwise an accidental click while the POST is
  // in flight would unmount the modal while busy=true / open=false,
  // leaking any subsequent error into nowhere (the alert region
  // wouldn't be visible).
  const handleBackdropClick = () => {
    if (!busy) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-chat-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <Card
        className="w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-4">
          <CardTitle id="new-chat-title" className="flex items-center gap-2 text-base">
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('sessions.newChat.title')}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy} aria-label={t('sessions.aria.close')}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          {error ? (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="new-chat-prompt">
              {t('sessions.newChat.initialPrompt')}
            </label>
            <textarea
              id="new-chat-prompt"
              className="min-h-[120px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={t('sessions.task.placeholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="new-chat-model">
                {t('sessions.newChat.modelLabel')}
              </label>
              <select
                id="new-chat-model"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={busy}
              >
                {MODEL_CHOICES.map((m) => (
                  <option key={m.value} value={m.value} title={t(m.hintKey)}>{t(m.labelKey)}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {(() => {
                  const choice = MODEL_CHOICES.find((m) => m.value === model);
                  return choice ? t(choice.hintKey) : '';
                })()}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="new-chat-agent">
                {t('sessions.newChat.agentLabel')}
              </label>
              <select
                id="new-chat-agent"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                disabled={busy}
              >
                {AGENT_CHOICES.map((a) => (
                  <option key={a.value} value={a.value} title={t(a.hintKey)}>{t(a.labelKey)}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {(() => {
                  const choice = AGENT_CHOICES.find((a) => a.value === agent);
                  return choice ? t(choice.hintKey) : '';
                })()}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => onSubmit({ prompt: trimmed, model, agent })}
              disabled={!canSubmit}
            >
              {busy ? t('sessions.newChat.starting') : t('sessions.newChat.startChat')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
