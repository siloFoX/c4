import { Button, Input } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useMeetingFork, type MeetingForkMode } from '../lib/use-meeting-fork';

// (v1.10.544) Extracted from MeetingsView. The Phase-6.11 fork
// form — clones a terminal meeting either by re-running the
// dispatcher (replan) or deep-cloning the source plan (reuse).
// Pure controlled component: parent owns open/closed state and
// gives the meeting it's forking from + a `selectedId` setter
// for the navigate-to-new-fork side effect.

interface MeetingDetail {
  id: string;
  title: string;
}

// (v1.10.702) ForkResponse type + form/state/handler
// moved to lib/use-meeting-fork.

interface Props {
  open: boolean;
  meeting: MeetingDetail;
  busy: boolean;
  onClose: () => void;
  onForked: (newId: string) => void;
}

export default function MeetingsForkForm({ open, meeting, busy: parentBusy, onClose, onForked }: Props) {
  useLocale();

  // (v1.10.702) Form state + reset + submit handler moved to hook.
  const {
    mode, setMode,
    task, setTask,
    title, setTitle,
    track, setTrack,
    busy, error,
    handleSubmit,
  } = useMeetingFork({ meetingId: meeting.id, onForked, onClose });

  if (!open) return null;

  const disabled = busy || parentBusy;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/10 p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-muted-foreground">
          {t('meetings.label.mode')}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as MeetingForkMode)}
            disabled={disabled}
            className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          >
            <option value="replan">{t('meetings.replan.replan')}</option>
            <option value="reuse">{t('meetings.replan.reuse')}</option>
          </select>
        </label>
        {mode === 'replan' ? (
          <label className="flex items-center gap-1 text-muted-foreground">
            {t('meetings.label.track')}
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value as typeof track)}
              disabled={disabled}
              className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
            >
              <option value="auto">{t('meetings.option.sameAsSource')}</option>
              <option value="lightweight">{t('meetings.mode.lightweight')}</option>
              <option value="standard">{t('meetings.mode.standard')}</option>
              <option value="full">{t('meetings.mode.full')}</option>
            </select>
          </label>
        ) : null}
      </div>
      <Input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tFormat('meetings.placeholder.titleOverride', {
          default: meeting.title || t('meetings.titleDefault.sameAsSource'),
        })}
        aria-label={t('meetings.fork.title.label')}
        disabled={disabled}
        className="h-7 text-[11px]"
      />
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder={t('meetings.fork.task.placeholder')}
        aria-label={t('meetings.fork.task.label')}
        disabled={disabled}
        className="min-h-[64px] rounded border border-border bg-background p-2 text-[11px]"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={disabled}
          className="h-6 px-2 text-[10px]"
          aria-label={t('meetings.fork.submit.label')}
        >
          {busy ? '…' : `Fork (${mode})`}
        </Button>
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
