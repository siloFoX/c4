import { useCallback, useEffect, useState } from 'react';

interface WorkerDetailProps {
  workerName: string;
}

type Tab = 'screen' | 'scrollback';

interface ReadResponse {
  content?: string;
  error?: string;
  status?: string;
  lines?: number;
  totalScrollback?: number;
}

interface ActionResponse {
  error?: string;
  [key: string]: unknown;
}

async function postJson(url: string, body: unknown): Promise<ActionResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ActionResponse;
}

export default function WorkerDetail({ workerName }: WorkerDetailProps) {
  const [tab, setTab] = useState<Tab>('screen');
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const fetchContent = useCallback(async () => {
    try {
      const url =
        tab === 'screen'
          ? `/api/read-now?name=${encodeURIComponent(workerName)}`
          : `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=100`;
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
    setActionMsg(null);
    fetchContent();
    const interval = setInterval(fetchContent, 3000);
    return () => clearInterval(interval);
  }, [fetchContent]);

  const runAction = async (label: string, fn: () => Promise<ActionResponse>) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fn();
      if (res.error) {
        setActionMsg(`${label} failed: ${res.error}`);
      } else {
        setActionMsg(`${label} ok`);
        fetchContent();
      }
    } catch (e) {
      setActionMsg(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = () => {
    const text = inputText;
    if (!text) return;
    runAction('send', () => postJson('/api/send', { name: workerName, text })).then(() => {
      setInputText('');
    });
  };

  const handleEnter = () => {
    runAction('key Enter', () => postJson('/api/key', { name: workerName, key: 'Enter' }));
  };

  const handleClose = () => {
    runAction('close', () => postJson('/api/close', { name: workerName }));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-semibold text-gray-100">{workerName}</h2>
        <div className="flex gap-1 rounded-lg bg-gray-800 p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab('screen')}
            className={`rounded px-3 py-1 transition ${
              tab === 'screen'
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Screen
          </button>
          <button
            type="button"
            onClick={() => setTab('scrollback')}
            className={`rounded px-3 py-1 transition ${
              tab === 'scrollback'
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Scrollback
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <pre className="flex-1 overflow-auto whitespace-pre rounded bg-gray-950 p-4 font-mono text-xs text-gray-200">
        {content || <span className="text-gray-600">(empty)</span>}
      </pre>

      {actionMsg && (
        <div className="mt-2 text-xs text-gray-400">{actionMsg}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Send text to worker..."
          className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          disabled={busy}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={busy || !inputText.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
        <button
          type="button"
          onClick={handleEnter}
          disabled={busy}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-100 hover:bg-gray-600 disabled:opacity-50"
        >
          Enter
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
