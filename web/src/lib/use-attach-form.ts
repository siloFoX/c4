import { useEffect, useState } from 'react';

// (v1.10.734) Extracted from AttachModal. The two
// attach-form input slots (pathValue, nameValue)
// plus the reset-on-close effect that wipes the
// fields whenever the modal transitions to
// `open=false`. Reset on close (not on open) so a
// failed submit can leave the path/name in place
// and let the operator retry without retyping.

export interface UseAttachFormState {
  pathValue: string;
  setPathValue: (next: string) => void;
  nameValue: string;
  setNameValue: (next: string) => void;
}

export function useAttachForm(args: { open: boolean }): UseAttachFormState {
  const { open } = args;
  const [pathValue, setPathValue] = useState('');
  const [nameValue, setNameValue] = useState('');

  useEffect(() => {
    if (!open) {
      setPathValue('');
      setNameValue('');
    }
  }, [open]);

  return { pathValue, setPathValue, nameValue, setNameValue };
}
