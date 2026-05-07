import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import {
  COMPARISON_TITLE_KEY,
  COMPARISON_ROW_KEYS,
} from './SessionsView';

// (v1.10.549) Extracted from SessionsView. Side-by-side
// comparison table — "what is an attached session vs a live
// worker session?". Used both in the empty pane and as a
// helper card next to the selected attached session.

interface Props {
  className?: string;
}

export default function SessionsComparisonCard({ className }: Props) {
  useLocale();
  return (
    <Card className={cn('max-w-md', className)}>
      <CardHeader className="gap-1 border-b border-border p-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4" aria-hidden /> {t(COMPARISON_TITLE_KEY)}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table
          className="w-full text-left text-xs"
          aria-label={t('sessions.aria.compare')}
        >
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">{t('sessions.compare.attached')}</th>
              <th className="px-4 py-2 font-medium">{t('sessions.compare.liveWorker')}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROW_KEYS.map(([labelKey, attachedKey, liveKey]) => (
              <tr key={labelKey} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-medium text-muted-foreground">
                  {t(labelKey)}
                </td>
                <td className="px-4 py-2 text-foreground">{t(attachedKey)}</td>
                <td className="px-4 py-2 text-foreground">{t(liveKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
