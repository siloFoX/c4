import { useCallback } from 'react';
import { Button, Dialog } from './ui';
import { t, useLocale } from '../lib/i18n';
import { useNewChatForm } from '../lib/use-new-chat-form';

const MODEL_CHOICES: Array<{ value: string; labelKey: string; hintKey: string }> = [
  { value: 'default',           labelKey: 'sessions.model.default.label', hintKey: 'sessions.model.default.hint' },
  { value: 'claude-opus-4-7',   labelKey: 'sessions.model.opus.label',    hintKey: 'sessions.model.opus.hint' },
  { value: 'claude-sonnet-4-6', labelKey: 'sessions.model.sonnet.label',  hintKey: 'sessions.model.sonnet.hint' },
  { value: 'claude-haiku-4-5',  labelKey: 'sessions.model.haiku.label',   hintKey: 'sessions.model.haiku.hint' },
];

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

  const { prompt, setPrompt, model, setModel, agent, setAgent } = useNewChatForm({ open });

  // The Dialog primitive owns Escape + backdrop dismissal. Both routes
  // pass through this gated callback so an in-flight POST is not
  // unmounted underneath the operator.
  const gatedClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const trimmed = prompt.trim();
  const canSubmit = !busy && trimmed.length > 0;

  return (
    <Dialog
      open={open}
      onClose={gatedClose}
      title={t('sessions.newChat.title')}
      className="max-w-xl"
    >
      <div className="space-y-3">
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
            className="min-h-[120px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
      </div>
    </Dialog>
  );
}
