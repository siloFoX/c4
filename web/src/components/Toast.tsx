import { useEffect } from 'react';

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

  const tone =
    type === 'success'
      ? 'bg-green-700 text-green-50 border-green-500'
      : 'bg-red-700 text-red-50 border-red-500';

  return (
    <div
      role="status"
      className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-lg ${tone}`}
    >
      {message}
    </div>
  );
}
