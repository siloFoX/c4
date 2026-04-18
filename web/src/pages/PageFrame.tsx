import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui';

interface PageFrameProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

// Shared wrapper for feature pages so every page has the same header
// shape and scroll container. Pages slot their body content as
// children; actions (buttons, toggles) go in the header slot.
export default function PageFrame({ title, description, actions, children }: PageFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      <Card>
        <CardHeader className="flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between md:p-6">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4 pt-0 md:p-6 md:pt-0">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  const items = Array.from({ length: rows });
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      {items.map((_, i) => (
        <div
          key={i}
          className="h-8 w-full animate-pulse rounded-md bg-muted/50"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyPanel({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground"
    >
      {message}
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground"
    >
      {message}
    </div>
  );
}
