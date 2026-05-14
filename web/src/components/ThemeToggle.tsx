import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme, type Theme } from '../hooks/use-theme';
import { cn } from '../lib/cn';
import { IconButton, Tooltip } from './ui';

type Variant = 'cycle' | 'group';
type Size = 'sm' | 'md';

interface ThemeToggleProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

const ORDER: Theme[] = ['system', 'light', 'dark'];

function nextTheme(t: Theme): Theme {
  const i = ORDER.indexOf(t);
  return ORDER[(i + 1) % ORDER.length] ?? 'system';
}

function iconFor(t: Theme, sizeClass: string): ReactNode {
  if (t === 'light') {
    return <Sun data-testid="theme-icon-light" className={sizeClass} />;
  }
  if (t === 'dark') {
    return <Moon data-testid="theme-icon-dark" className={sizeClass} />;
  }
  return <Monitor data-testid="theme-icon-system" className={sizeClass} />;
}

function labelFor(t: Theme): string {
  if (t === 'light') return 'Light';
  if (t === 'dark') return 'Dark';
  return 'System';
}

export default function ThemeToggle({
  variant = 'cycle',
  size = 'sm',
  className,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const iconClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  if (variant === 'group') {
    return (
      <div
        role="group"
        aria-label="Theme"
        className={cn('inline-flex items-center gap-1', className)}
      >
        {ORDER.map((t) => {
          const active = theme === t;
          return (
            <IconButton
              key={t}
              aria-label={labelFor(t)}
              aria-pressed={active}
              onClick={() => setTheme(t)}
              className={cn(active && 'bg-accent text-accent-foreground')}
              icon={iconFor(t, iconClass)}
            />
          );
        })}
      </div>
    );
  }

  const next = nextTheme(theme);
  return (
    <Tooltip label={`Theme: ${labelFor(theme)} (click for ${labelFor(next)})`} placement="bottom">
      <IconButton
        aria-label="Toggle theme"
        onClick={() => setTheme(next)}
        className={className}
        icon={iconFor(theme, iconClass)}
      />
    </Tooltip>
  );
}
