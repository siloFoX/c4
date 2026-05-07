import { AlertTriangle } from 'lucide-react';
import { useLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';

// (v1.10.543) Extracted from MeetingsView. Phase-6.15 stuck-meetings
// banner — yellow strip rendered above the master/detail layout
// when the daemon reports any meeting that's been pending or
// in-progress for >1 hour. Pure display component; parent owns
// the polled data and the navigation callback.

interface StuckEntry {
  id: string;
  status: MeetingStatus;
  track: string;
  title: string;
  ageHours: number;
}

export interface StuckResponse {
  count: number;
  stuck: StuckEntry[];
}

interface Props {
  stuck: StuckResponse | null;
  onNavigate: (id: string) => void;
}

export default function MeetingsStuckBanner({ stuck, onNavigate }: Props) {
  useLocale();
  if (!stuck || stuck.count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      <span className="font-medium">{stuck.count} meeting(s) stuck &gt;1h:</span>
      {stuck.stuck.slice(0, 5).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onNavigate(s.id)}
          className="rounded border border-amber-500/40 bg-background/40 px-1.5 py-0 font-mono text-[10px] hover:bg-amber-500/20"
          title={`${s.title} · ${s.status} · ${s.ageHours.toFixed(1)}h old`}
        >
          {s.id} ({s.ageHours.toFixed(1)}h)
        </button>
      ))}
      {stuck.count > 5 ? (
        <span className="text-[10px] opacity-70">… and {stuck.count - 5} more</span>
      ) : null}
    </div>
  );
}
