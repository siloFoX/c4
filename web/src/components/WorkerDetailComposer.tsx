import { GitMerge, Send, X } from 'lucide-react';
import { Button, Input, Tooltip } from './ui';
import { t, useLocale } from '../lib/i18n';

// (v1.10.611) Extracted from WorkerDetail. The composer row —
// text input (Enter triggers Send) + Send icon button + Enter
// dispatch button + Merge button + Close button. Pure
// controlled inputs: parent owns inputText / busy state and the
// 4 action handlers.

interface Props {
  inputText: string;
  busy: boolean;
  onChangeInputText: (next: string) => void;
  onSend: () => void;
  onEnter: () => void;
  onMerge: () => void;
  onClose: () => void;
}

export default function WorkerDetailComposer({
  inputText,
  busy,
  onChangeInputText,
  onSend,
  onEnter,
  onMerge,
  onClose,
}: Props) {
  useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="text"
        value={inputText}
        onChange={(e) => onChangeInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={t('workerDetail.composer.placeholder')}
        className="h-9 min-w-0 flex-1"
        disabled={busy}
      />
      <Button
        type="button"
        variant="default"
        size="icon"
        aria-label={t('workerDetail.composer.sendText')}
        onClick={onSend}
        disabled={busy || !inputText.trim()}
      >
        <Send className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onEnter}
        disabled={busy}
      >
        {t('workerDetail.composer.enter')}
      </Button>
      <Tooltip label={t('workerDetail.composer.mergeTitle')}>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onMerge}
          disabled={busy}
        >
          <GitMerge className="h-4 w-4" />
          <span>{t('workerDetail.composer.merge')}</span>
        </Button>
      </Tooltip>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onClose}
        disabled={busy}
      >
        <X className="h-4 w-4" />
        <span>{t('workerDetail.composer.close')}</span>
      </Button>
    </div>
  );
}
