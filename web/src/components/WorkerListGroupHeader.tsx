import { ChevronDown, ChevronRight, Crown, Wrench } from 'lucide-react';
import { cn } from '../lib/cn';

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
  icon: 'crown' | 'wrench';
  accent: 'primary' | 'muted';
}

export default function WorkerListGroupHeader({ open, onToggle, label, count, icon, accent }: Props) {
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
      <span
        className={cn(
          'ml-auto rounded-full border px-1.5 py-0 text-[10px] font-semibold',
          accent === 'primary'
            ? 'border-primary/30 bg-primary/30 text-foreground'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}
