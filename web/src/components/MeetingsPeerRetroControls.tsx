import { useCallback, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { apiPost } from '../lib/api';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.554) Extracted from MeetingsView. Peer-retro brain
// selector + run button + result message — operator picks the
// brain (mock for instant demo, claude for real ratings) and
// triggers the peer-rating pass on a terminal meeting.

interface PeerRetroResponse {
  peer: {
    raters: string[];
    ratees: string[];
    raw: Array<{ rater: string; ratee: string; rating: number }>;
  };
  applied: Record<string, unknown> | null;
}

interface Props {
  meetingId: string;
}

export default function MeetingsPeerRetroControls({ meetingId }: Props) {
  useLocale();

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [brain, setBrain] = useState<'mock' | 'claude'>('mock');

  const handlePeerRetro = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const res = await apiPost<PeerRetroResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/peer-retro`,
        { brain, apply: true },
      );
      const ratings = (res && res.peer && res.peer.raw) ? res.peer.raw.length : 0;
      const raters = (res && res.peer && res.peer.raters) ? res.peer.raters.length : 0;
      const updated = res && res.applied ? Object.keys(res.applied).length : 0;
      setMsg(tFormat('meetings.peerRetro.success', { raters, ratings, updated }));
      window.setTimeout(() => setMsg(null), 6000);
    } catch (e) {
      setMsg(tFormat('meetings.peerRetro.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [brain, meetingId]);

  return (
    <>
      <label className="text-[11px] text-muted-foreground">
        {t('meetings.peerBrain.label')}
        <select
          className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
          value={brain}
          onChange={(e) => setBrain(e.target.value as 'mock' | 'claude')}
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
