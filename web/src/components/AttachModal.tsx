import { useCallback } from 'react';
import { Badge, Button, Dialog, Input } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useAttachForm } from '../lib/use-attach-form';
import {
  POST_ATTACH_HELP_TITLE_KEY,
  POST_ATTACH_HELP_ITEM_KEYS,
  formatRelative,
  shortId,
  type SessionSummary,
} from './SessionsView';

export interface AttachModalProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  available: SessionSummary[];
  onClose: () => void;
  onSubmit: (path: string, name: string) => void;
}

export default function AttachModal({
  open,
  busy,
  error,
  available,
  onClose,
  onSubmit,
}: AttachModalProps) {
  useLocale();
  const { pathValue, setPathValue, nameValue, setNameValue } = useAttachForm({ open });

  // Backdrop + Escape both flow through this gated callback so an
  // in-flight POST is not unmounted underneath the operator.
  const gatedClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const preview = available.slice(0, 10);

  return (
    <Dialog
      open={open}
      onClose={gatedClose}
      title={t('sessions.attachModal.title')}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          {t('sessions.attach.intro')}
        </p>

        {preview.length > 0 ? (
          <section
            className="rounded-md border border-border bg-muted/40"
            aria-label={t('sessions.aria.preview')}
          >
            <header className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{t('sessions.preview.heading')}</span>
              <span>{tFormat('sessions.preview.found', { count: available.length })}</span>
            </header>
            <ul className="max-h-48 divide-y divide-border overflow-y-auto">
              {preview.map((s) => (
                <li key={s.sessionId} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {s.projectPath || s.projectDir || t('sessions.preview.unknownProject')}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {formatRelative(s.updatedAt)}
                    </span>
                    <Badge variant="secondary">
                      {tFormat('sessions.preview.msgs', { count: s.turnCount })}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{shortId(s.sessionId)}</span>
                    {s.lastAssistantSnippet ? (
                      <span className="truncate">- {s.lastAssistantSnippet}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPathValue(s.sessionId)}
                    >
                      {t('sessions.attach.useThisId')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Input
          label={t('sessions.attach.fieldLabel')}
          value={pathValue}
          onChange={(e) => setPathValue(e.target.value)}
          placeholder={t('sessions.attachPath.placeholder')}
          autoFocus
        />
        <Input
          label={t('sessions.attach.aliasLabel')}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          placeholder={t('sessions.attachName.placeholder')}
        />
        {error ? (
          <div className="text-sm text-destructive" role="alert">
            {error}
          </div>
        ) : null}

        <aside
          className="rounded-md border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground"
          aria-label={t('sessions.aria.postAttachHelp')}
        >
          <div className="mb-1 font-semibold text-foreground">
            {t(POST_ATTACH_HELP_TITLE_KEY)}
          </div>
          <ul className="list-disc pl-5">
            {POST_ATTACH_HELP_ITEM_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </aside>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => onSubmit(pathValue.trim(), nameValue.trim())}
            disabled={busy || !pathValue.trim()}
          >
            {busy ? t('sessions.attach.attaching') : t('sessions.attach.button')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
