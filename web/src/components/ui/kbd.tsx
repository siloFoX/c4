import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const KBD_BASE =
  'inline-flex items-center rounded border bg-muted text-muted-foreground px-1.5 text-xs font-mono';

export interface KbdProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode;
  keys?: readonly string[];
  separator?: ReactNode;
  className?: string;
}

export function Kbd({
  children,
  keys,
  separator = ' + ',
  className,
  ...rest
}: KbdProps) {
  if (keys && keys.length > 0) {
    return (
      <span data-kbd {...rest}>
        {keys.map((key, i) => (
          <Fragment key={`${key}-${i}`}>
            {i > 0 ? (
              <span data-kbd-separator aria-hidden="true">
                {separator}
              </span>
            ) : null}
            <kbd className={cn(KBD_BASE, className)}>{key}</kbd>
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    <kbd data-kbd className={cn(KBD_BASE, className)} {...rest}>
      {children}
    </kbd>
  );
}

Kbd.displayName = 'Kbd';
