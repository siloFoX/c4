import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card, CardContent } from './ui';
import { cn } from '../lib/cn';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
  duration?: number;
}

const TONE: Record<ToastType, string> = {
  success: 'border-success/40 bg-success/15 text-success',
  error: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
  info: 'border-info/40 bg-info/15 text-info',
};

export default function Toast({
  message,
  type,
  onDismiss,
  duration = 3000,
}: ToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [onDismiss, duration]);

  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertTriangle : Info;

  return (
    <Card
      role="status"
      className={cn(
        'pointer-events-auto border shadow-lg',
        TONE[type]
      )}
    >
      <CardContent className="flex items-start gap-2 p-3 text-sm">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">{message}</span>
      </CardContent>
    </Card>
  );
}
