import { useEffect, useState } from 'react';

// (v1.10.734) Extracted from NewChatModal. The three
// chat-spawn form slots (prompt, model, agent) plus
// the reset-on-open effect that wipes the fields
// whenever the modal transitions to `open=true`.
// Reset on open (not on close) so a previous typed-
// but-cancelled prompt doesn't bleed into the next
// session — the parent's onClose path can leave the
// fields populated for the duration of the close
// animation.

export interface UseNewChatFormState {
  prompt: string;
  setPrompt: (next: string) => void;
  model: string;
  setModel: (next: string) => void;
  agent: string;
  setAgent: (next: string) => void;
}

export function useNewChatForm(args: { open: boolean }): UseNewChatFormState {
  const { open } = args;
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('default');
  const [agent, setAgent] = useState('generic');

  useEffect(() => {
    if (open) {
      setPrompt('');
      setModel('default');
      setAgent('generic');
    }
  }, [open]);

  return { prompt, setPrompt, model, setModel, agent, setAgent };
}
