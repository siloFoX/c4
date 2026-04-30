import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Monitor, ScrollText, History } from 'lucide-react';
import WorkerChat from './WorkerChat';
import WorkerHistory from './WorkerHistory';
import WorkerActions from './WorkerActions';
import { cn } from '../lib/cn';

interface WorkerDetailProps {
  workerName: string;
}

type Tab = 'chat' | 'screen' | 'scrollback' | 'history';

interface ReadResponse {
  content?: string;
  error?: string;
  status?: string;
  lines?: number;
  totalScrollback?: number;
}

const TABS: { id: Tab; label: string; Icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'screen', label: 'Screen', Icon: Monitor },
  { id: 'scrollback', label: 'Scrollback', Icon: ScrollText },
  { id: 'history', label: 'History', Icon: History },
];

export default function WorkerDetail({ workerName }: WorkerDetailProps) {
  const [tab, setTab] = useState<Tab>('chat');
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    if (tab === 'chat' || tab === 'history') return;
    try {
      const url =
        tab === 'screen'
          ? `/api/read-now?name=${encodeURIComponent(workerName)}`
          : `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=200`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReadResponse;
      if (data.error) {
        setError(data.error);
        setContent('');
      } else {
        setContent(typeof data.content === 'string' ? data.content : '');
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, workerName]);

  useEffect(() => {
    setContent('');
    setError(null);
    if (tab === 'chat' || tab === 'history') return;
    fetchContent();
    const interval = setInterval(fetchContent, 3000);
    return () => clearInterval(interval);
  }, [fetchContent, tab]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <h2 className="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">
          <span className="text-muted">worker</span>
          <span className="px-1 text-muted">/</span>
          <span className="font-mono">{workerName}</span>
        </h2>
        <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1 text-xs">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 ease-snappy sm:px-2.5',
                  active
                    ? 'bg-surface-3 text-foreground shadow-soft'
                    : 'text-muted hover:bg-surface-3/60 hover:text-foreground',
                )}
              >
                <Icon size={13} />
                <span className="hidden xs:inline">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <WorkerActions workerName={workerName} />
      </div>

      {tab === 'chat' ? (
        <WorkerChat workerName={workerName} />
      ) : tab === 'history' ? (
        <WorkerHistory workerFilter={workerName} />
      ) : (
        <>
          {error && (
            <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <pre className="flex-1 overflow-auto whitespace-pre rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
            {content || <span className="text-muted">(empty)</span>}
          </pre>
        </>
      )}
    </div>
  );
}
