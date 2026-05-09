import { useState } from 'react';
import { Copy, Eye, Terminal, Trash2 } from 'lucide-react';
import { useAttachProcessState } from '../lib/use-attach-process-state';
import { useCopyPulse } from '../lib/use-copy-pulse';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { AttachedRole, AttachedSession } from './SessionsView';

// (v1.10.550) Extracted from SessionsView. Per-row action strip
// for an attached session — role badge, live/idle process pill,
// View / Resume / Detach buttons, plus the inline confirmation
// strip and the resume-cmd preview.
// (v1.10.721) Copy-to-clipboard + 1500ms pulse moved to
// lib/use-copy-pulse.

// (TODO 8.38) Map an attached role to badge copy + token-backed
// styling. Manager gets the primary accent (matches WorkerList in
// 8.37); Worker / Planner / Executor / Reviewer share a neutral
// secondary; Generic falls back to muted. Kept as a helper so
// source-grep tests pin the role -> class mapping.
function attachedRoleStyle(role: AttachedRole | undefined): string {
  switch (role) {
    case 'manager':
      return 'border-primary/30 bg-primary/30 text-foreground';
    case 'planner':
    case 'executor':
    case 'reviewer':
      return 'border-secondary-foreground/20 bg-secondary text-secondary-foreground';
    case 'worker':
      return 'border-border bg-muted/60 text-foreground';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

// (v1.10.674) AttachProcessState type + 30s process poll
// moved to lib/use-attach-process-state.

interface Props {
  session: AttachedSession;
  isSelected: boolean;
  onView: () => void;
  onDetach: () => void;
}

export default function SessionsAttachedRowActions({
  session,
  isSelected,
  onView,
  onDetach,
}: Props) {
  useLocale();

  const [showResume, setShowResume] = useState(false);
  const [showDetachConfirm, setShowDetachConfirm] = useState(false);
  // (v1.10.674) /api/attach/:name/process 30s poll moved to hook.
  const procState = useAttachProcessState({ name: session.name });
  const resumeCmd = session.sessionId
    ? `claude --resume ${session.sessionId}`
    : `claude --resume <unknown-session-id>`;
  // (v1.10.721) Copy + 1500ms pulse moved to use-copy-pulse hook.
  const { copied, copy: handleCopy } = useCopyPulse({ text: resumeCmd });
  const role: AttachedRole = session.role || 'generic';
  // (TODO 8.38 review fix 2026-05-01) Stable id for the
  // confirmation strip so the Detach trigger's `aria-controls`
  // points at a real element. Suffix with the session name so
  // multiple SessionsAttachedRowActions on the same page never collide.
  const detachConfirmId = `detach-confirm-${session.name}`;

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/30 px-4 py-2">
      {/* (TODO 8.38) Role badge + an explicit "the original terminal
          keeps running" hint. */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0 uppercase tracking-wide',
            attachedRoleStyle(role),
          )}
          aria-label={tFormat('sessions.role.agentAria', { role })}
          title={tFormat('sessions.role.detectedTitle', { role })}
        >
          {role}
        </span>
        <span className="text-muted-foreground">{t('sessions.readOnlyMirror')}</span>
        {procState.status === 'loading' ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0 text-muted-foreground/70"
            aria-label={t('sessions.aria.processChecking')}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
            {t('sessions.checking')}
          </span>
        ) : procState.status === 'alive' ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-emerald-600 dark:text-emerald-400"
            aria-label={tFormat('sessions.process.liveAria', {
              pid: procState.pid,
              match: t(procState.match === 'fd' ? 'sessions.process.fdMatched' : 'sessions.process.cwdMatched'),
            })}
            title={
              `Live claude pid ${procState.pid}` +
              (procState.cwd ? ` in ${procState.cwd}` : '') +
              (procState.match === 'cwd' ? ' (matched by cwd)' : '') +
              (procState.multipleCandidates ? ' — multiple candidates' : '')
            }
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            live · pid {procState.pid}
            {procState.multipleCandidates ? '+' : ''}
          </span>
        ) : procState.status === 'idle' ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0 text-muted-foreground"
            aria-label={t('sessions.aria.noLiveProcess')}
            title={t('sessions.tooltip.noLiveProcess')}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
            {t('sessions.row.noLiveProcess')}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-amber-700 dark:text-amber-400"
            aria-label={tFormat('sessions.row.lookupFailedAria', { message: procState.message })}
            title={procState.message}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            {t('sessions.row.lookupFailed')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={isSelected ? 'default' : 'outline'}
          onClick={onView}
          aria-label={tFormat('sessions.row.viewConversationAria', { worker: session.name })}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          {t('sessions.row.viewConversation')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowResume((v) => !v)}
          aria-label={tFormat('sessions.row.resumeInTerminalAria', { worker: session.name })}
          aria-expanded={showResume}
        >
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          {t('sessions.row.resumeInTerminal')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowDetachConfirm((v) => !v)}
          aria-label={tFormat('sessions.row.detachAria', { worker: session.name })}
          aria-expanded={showDetachConfirm}
          {...(showDetachConfirm ? { 'aria-controls': detachConfirmId } : {})}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {t('sessions.row.detach')}
        </Button>
      </div>
      {showDetachConfirm ? (
        <div
          id={detachConfirmId}
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs"
        >
          <span className="text-destructive">
            {t('sessions.row.detachConfirmBody')}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDetachConfirm(false)}
            aria-label={t('sessions.aria.cancelDetach')}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              setShowDetachConfirm(false);
              onDetach();
            }}
            aria-label={tFormat('sessions.row.confirmDetachAria', { worker: session.name })}
          >
            {t('sessions.row.detachSession')}
          </Button>
        </div>
      ) : null}
      {showResume ? (
        <div
          className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-[11px]"
          role="region"
          aria-label={t('sessions.aria.resumeCmd')}
        >
          <code className="flex-1 truncate font-mono">{resumeCmd}</code>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={t('sessions.aria.copyResume')}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
          {copied ? <span className="text-muted-foreground">{t('sessions.copied')}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
