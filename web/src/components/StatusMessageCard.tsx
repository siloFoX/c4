import { Send } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { ToastType } from './Toast';
import { useStatusMessage } from '../lib/use-status-message';

// (v1.10.561) Extracted from ControlPanel. The Slack status
// message form (8.20B) — fire-and-forget POST /api/status-update
// that routes the operator's message through the notifications
// layer so oncall can see "worker X hit intervention" without
// opening the terminal. Pure controlled component; parent
// provides workerName + an onToast callback.
// (v1.10.733) message + sending state + send POST handler moved
// to lib/use-status-message.

interface Props {
  workerName: string;
  onToast: (message: string, type: ToastType) => void;
}

export default function StatusMessageCard({ workerName, onToast }: Props) {
  useLocale();
  const { message, setMessage, sending, send } = useStatusMessage({ workerName, onToast });

  return (
    <Card aria-label={t('controlPanel.status.label')}>
      <CardHeader className="p-4 md:p-5">
        <CardTitle>{t('controlPanel.status.title')}</CardTitle>
        <CardDescription>
          {t('controlPanel.status.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-4 pt-0 md:p-5 md:pt-0">
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          placeholder={tFormat('controlPanel.status.placeholder', { worker: workerName })}
          aria-label={tFormat('controlPanel.status.aria', { worker: workerName })}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={send}
            disabled={sending || !message.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sending ? t('controlPanel.status.sending') : t('controlPanel.status.send')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
