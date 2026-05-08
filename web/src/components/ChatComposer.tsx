import { Send } from 'lucide-react';
import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.612) Extracted from ChatView. The chat composer form
// — auto-grow textarea (Shift+Enter inserts newline, Enter
// submits) + Send button. Pure controlled inputs: parent owns
// input state + textarea ref + submit handler.

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>;
  input: string;
  workerName: string;
  sending: boolean;
  onChangeInput: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e?: FormEvent<HTMLFormElement>) => void;
}

export default function ChatComposer({
  textareaRef,
  input,
  workerName,
  sending,
  onChangeInput,
  onKeyDown,
  onSubmit,
}: Props) {
  useLocale();
  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => onChangeInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder={tFormat('chatView.placeholder.message', { worker: workerName })}
        className={cn(
          'min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50'
        )}
        disabled={sending}
      />
      <Button
        type="submit"
        variant="default"
        size="md"
        disabled={sending || !input.trim()}
      >
        <Send className="h-4 w-4" />
        <span>{sending ? t('chatView.sending') : t('chatView.send')}</span>
      </Button>
    </form>
  );
}
