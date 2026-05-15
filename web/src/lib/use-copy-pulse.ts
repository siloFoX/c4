import { useCallback } from 'react';
import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';

// (v1.10.721, refactored v1.11.224) Generic copy-to-clipboard
// handler with a short "Copied!" indicator pulse. Now delegates
// the writeText + reset-timer plumbing to useCopyToClipboard so
// the SSR-safe fallback path is shared with other copy surfaces.

const DEFAULT_PULSE_MS = 1500;

export interface CopyPulseState {
  copied: boolean;
  copy: () => Promise<void>;
}

export function useCopyPulse(args: {
  text: string;
  durationMs?: number;
}): CopyPulseState {
  const { text, durationMs = DEFAULT_PULSE_MS } = args;
  const { copy: doCopy, copied } = useCopyToClipboard(durationMs);

  const copy = useCallback(async () => {
    await doCopy(text);
  }, [doCopy, text]);

  return { copied, copy };
}
