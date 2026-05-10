import { MessageCircle } from 'lucide-react';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { useMeetingPeerRetro } from '../lib/use-meeting-peer-retro';
import type { MeetingBrain } from '../lib/use-meeting-run';

// (v1.10.554) Extracted from MeetingsView. Peer-retro brain
// selector + run button + result message — operator picks the
// brain (mock for instant demo, claude for real ratings) and
// triggers the peer-rating pass on a terminal meeting.
// (v1.10.718) busy / msg / failed / brain state + POST handler
// moved to lib/use-meeting-peer-retro.

interface Props {
  meetingId: string;
}

export default function MeetingsPeerRetroControls({ meetingId }: Props) {
  useLocale();

  const { busy, msg, failed, brain, setBrain, handlePeerRetro } =
    useMeetingPeerRetro({ meetingId });

  return (
    <>
      <label className="text-[11px] text-muted-foreground">
        {t('meetings.peerBrain.label')}
        <select
          className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
          value={brain}
          onChange={(e) => setBrain(e.target.value as MeetingBrain)}
          disabled={busy}
          aria-label={t('meetings.peerBrain.aria')}
        >
          <option value="mock">{t('meetings.adapter.mock')}</option>
          <option value="claude">{t('meetings.adapter.claude')}</option>
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        onClick={handlePeerRetro}
        disabled={busy}
        aria-label={t('meetings.peerRetro.label')}
        title={t('meetings.tooltip.peerRetro')}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        {t('meetings.peerRetro')}
      </Button>
      {msg ? (
        <span className={cn(
          'text-[11px]',
          failed ? 'text-destructive' : 'text-muted-foreground',
        )}>{msg}</span>
      ) : null}
    </>
  );
}
