import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';

// (v1.10.610) Extracted from WorkerDetail. The mobile-only
// special-keys row — Esc, Ctrl-C, Ctrl-D, Tab, plus 4 arrow
// keys. Hidden at md+ (desktop physical keyboard already covers
// these). Pure display: parent owns busy state + sendKey
// dispatcher.

export type SendableKey = 'Escape' | 'C-c' | 'C-d' | 'Tab' | 'Up' | 'Down' | 'Left' | 'Right';

interface Props {
  busy: boolean;
  onSendKey: (key: SendableKey) => void;
}

export default function WorkerDetailKeysRow({ busy, onSendKey }: Props) {
  useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2 md:hidden">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('workerDetail.keys.heading')}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onSendKey('Escape')}
        disabled={busy}
      >
        {t('workerDetail.keys.esc')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onSendKey('C-c')}
        disabled={busy}
      >
        {t('workerDetail.keys.ctrlC')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onSendKey('C-d')}
        disabled={busy}
      >
        {t('workerDetail.keys.ctrlD')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onSendKey('Tab')}
        disabled={busy}
      >
        {t('workerDetail.keys.tab')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={t('workerDetail.keys.arrowUp')}
        onClick={() => onSendKey('Up')}
        disabled={busy}
        className="h-8 w-8 p-0"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={t('workerDetail.keys.arrowDown')}
        onClick={() => onSendKey('Down')}
        disabled={busy}
        className="h-8 w-8 p-0"
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={t('workerDetail.keys.arrowLeft')}
        onClick={() => onSendKey('Left')}
        disabled={busy}
        className="h-8 w-8 p-0"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={t('workerDetail.keys.arrowRight')}
        onClick={() => onSendKey('Right')}
        disabled={busy}
        className="h-8 w-8 p-0"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
