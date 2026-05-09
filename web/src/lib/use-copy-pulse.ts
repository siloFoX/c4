import { useCallback, useState } from 'react';

// (v1.10.721) Generic copy-to-clipboard handler with a
// short "Copied!" indicator pulse. Extracted from
// SessionsAttachedRowActions where it backed the
// resume-command preview, but kept text/duration as
// args so any other "click → copy → flash 'Copied'"
// surface can drop the hook in.
//
// SSR-safe: navigator.clipboard.writeText is gated on
// the global being defined, mirroring the original
// inline check in SessionsAttachedRowActions. The
// timeout uses window.setTimeout (matching the parent's
// existing call signature) so the unmount cleanup
// stays semantically identical.

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
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), durationMs);
  }, [text, durationMs]);

  return { copied, copy };
}
