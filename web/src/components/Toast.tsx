import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';

export type ToastType = 'success' | 'error';

export interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
  duration?: number;
}

export default function Toast({ message, type, onDismiss, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [onDismiss, duration]);

  const Icon = type === 'success' ? CheckCircle2 : XCircle;
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-center gap-2 rounded-lg border bg-surface-2 px-3 py-2 text-sm shadow-soft c4-fade-in',
        type === 'success'
          ? 'border-success/40 text-success'
          : 'border-danger/40 text-danger',
      )}
    >
      <Icon size={16} />
      <span className="text-foreground">{message}</span>
    </div>
  );
}
