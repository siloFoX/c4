import { ChevronDown, ChevronRight, Crown, Wrench } from 'lucide-react';
import { cn } from '../lib/cn';
import { BadgeCounter } from './ui';

// (v1.10.567) Extracted from WorkerList. Section header for a
// worker group (managers / workers) — renders an icon, the
// group label, and a count badge. Expandable so operators can
// fold one bucket out of the way when they're focused on the
// other. Pure display.

interface Props {
  open: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  // (v1.11.296, TODO 11.278) Optional busy-worker count. When > 0,
  // an accent BadgeCounter sits left of the total count so the
  // operator scans "3 of 12 working" at a glance.
  busyCount?: number;
  icon: 'crown' | 'wrench';
  accent: 'primary' | 'muted';
}

export default function WorkerListGroupHeader({
  open,
  onToggle,
  label,
  count,
  busyCount,
  icon,
  accent,
}: Props) {
  const Icon = icon === 'crown' ? Crown : Wrench;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`worker-group-${label.toLowerCase()}`}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs uppercase tracking-wide transition-colors',
        accent === 'primary'
          ? 'text-primary hover:bg-primary/5'
          : 'text-muted-foreground hover:bg-accent/40',
      )}
    >
      {open ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{label}</span>
      {/* (v1.11.296, TODO 11.278) Group counters migrated to the
          BadgeCounter primitive. The optional busy chip lights up
          when any worker in the group is in the busy state so the
          operator can spot active work without expanding the
          group. */}
      {busyCount !== undefined && busyCount > 0 ? (
        <BadgeCounter
          count={busyCount}
          tone="accent"
          size="sm"
          pulse
          srLabel={`${busyCount} ${label.toLowerCase()} busy`}
          className="ml-auto"
          data-testid={`worker-group-${label.toLowerCase()}-busy`}
        />
      ) : null}
      <BadgeCounter
        count={count}
        tone={accent === 'primary' ? 'primary' : 'neutral'}
        size="sm"
        showZero
        srLabel={`${count} ${label.toLowerCase()}`}
        {...(busyCount !== undefined && busyCount > 0
          ? {}
          : { className: 'ml-auto' })}
        data-testid={`worker-group-${label.toLowerCase()}-count`}
      />
    </button>
  );
}
