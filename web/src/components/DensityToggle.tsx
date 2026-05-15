import { LayoutDashboard, Rows3, Rows4 } from 'lucide-react';
import { Button, Tooltip } from './ui';
import { cn } from '../lib/cn';
import { useDensity, DENSITY_VALUES, type Density } from '../hooks/use-density';

// (v1.11.263, TODO 11.245) Density toggle. Three-way segmented
// control mirroring the ThemeToggle pattern. Pairs with
// `useDensity` for state + persistence; this component is purely
// presentational + reads the hook itself so consumers don't have
// to wire the state plumbing.
//
// Visual variants:
//   - `group` (default): three side-by-side IconButton-style
//     segments showing the lucide glyph + an aria-label. Used in
//     the AppHeader and the Settings density panel.
//   - `compact`: a single icon for the active mode with the next
//     mode cycled on click. Reserved for tight surfaces (e.g. a
//     densely-packed toolbar) so the toggle still fits.

const DENSITY_META: Record<
  Density,
  { label: string; description: string; icon: typeof Rows3 }
> = {
  compact: {
    label: 'Compact',
    description: 'Tight rows + minimum padding for data-heavy views',
    icon: Rows4,
  },
  comfortable: {
    label: 'Comfortable',
    description: 'Default shadcn spacing -- the prior baseline',
    icon: Rows3,
  },
  cozy: {
    label: 'Cozy',
    description: 'Relaxed padding + generous gaps, easier on the eye',
    icon: LayoutDashboard,
  },
};

export interface DensityToggleProps {
  variant?: 'group' | 'compact';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function DensityToggle({
  variant = 'group',
  size = 'sm',
  className,
}: DensityToggleProps) {
  const { density, setDensity } = useDensity();

  if (variant === 'compact') {
    const next: Density =
      density === 'compact'
        ? 'comfortable'
        : density === 'comfortable'
          ? 'cozy'
          : 'compact';
    const ActiveIcon = DENSITY_META[density].icon;
    return (
      <Tooltip label={`Density: ${DENSITY_META[density].label} (click to cycle)`}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => setDensity(next)}
          aria-label={`Density: ${DENSITY_META[density].label}. Click to switch to ${DENSITY_META[next].label}.`}
          data-testid="density-toggle-compact"
          data-density-value={density}
          className={className}
        >
          <ActiveIcon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    );
  }

  return (
    <div
      role="group"
      aria-label="Density"
      data-testid="density-toggle-group"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5',
        className,
      )}
    >
      {DENSITY_VALUES.map((d) => {
        const meta = DENSITY_META[d];
        const Icon = meta.icon;
        const active = density === d;
        return (
          <Tooltip key={d} label={meta.description}>
            <Button
              type="button"
              variant={active ? 'secondary' : 'ghost'}
              size={size}
              onClick={() => setDensity(d)}
              aria-label={`Density: ${meta.label}`}
              aria-pressed={active}
              data-testid={`density-toggle-${d}`}
              data-density-value={d}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
}

DensityToggle.displayName = 'DensityToggle';
