// (v1.11.211) AnnounceRegion provider. Mounts two visually-hidden
// aria-live regions (polite + assertive) and exposes an announce()
// function to descendants through AnnounceContext.
//
// Implementation notes:
// - role + aria-live are both set on each region because some screen
//   readers favour one over the other.
// - aria-atomic='true' so the entire region is re-read each update.
// - To force a re-announce when the same string lands twice in a row
//   (e.g. validation message after a second failed submit), we clear
//   the region for one tick then write the new value. AT detects the
//   change and reads it again.
// - Tailwind's sr-only utility takes care of the visually-hidden
//   styling; we add cn() so callers can extend if needed.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnnounceContext, type AnnounceFn, type AnnouncePriority } from '../hooks/use-announce';
import { cn } from '../lib/cn';

export interface AnnounceRegionProps {
  children?: ReactNode;
  className?: string;
}

export default function AnnounceRegion({ children, className }: AnnounceRegionProps) {
  const [politeMsg, setPoliteMsg] = useState('');
  const [assertiveMsg, setAssertiveMsg] = useState('');
  const flickerTimers = useRef<{ polite?: number; assertive?: number }>({});

  useEffect(() => {
    return () => {
      const t = flickerTimers.current;
      if (t.polite !== undefined) window.clearTimeout(t.polite);
      if (t.assertive !== undefined) window.clearTimeout(t.assertive);
    };
  }, []);

  const announce = useCallback<AnnounceFn>(
    (message: string, priority: AnnouncePriority = 'polite') => {
      if (typeof message !== 'string' || message.length === 0) return;
      const setter = priority === 'assertive' ? setAssertiveMsg : setPoliteMsg;
      const key = priority === 'assertive' ? 'assertive' : 'polite';
      const prev = flickerTimers.current[key];
      if (prev !== undefined) window.clearTimeout(prev);
      // Clear -> set on next tick so AT picks up duplicate messages.
      setter('');
      flickerTimers.current[key] = window.setTimeout(() => {
        setter(message);
        flickerTimers.current[key] = undefined;
      }, 30);
    },
    [],
  );

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div
        data-announce-region="polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn('sr-only', className)}
      >
        {politeMsg}
      </div>
      <div
        data-announce-region="assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={cn('sr-only', className)}
      >
        {assertiveMsg}
      </div>
    </AnnounceContext.Provider>
  );
}
