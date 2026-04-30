// 8.7: scribe session-context.md viewer.
// Polls /api/scribe/context for accumulated context. Read-only viewer with
// a refresh button so the user can see the content PostCompact hooks would
// inject after a context compaction.

import { useCallback, useEffect, useState } from 'react';

interface ScribeContextResp {
  path?: string;
  exists?: boolean;
  content?: string;
  size?: number;
  mtime?: string | null;
  error?: string;
}

export default function ScribeContext() {
  const [data, setData] = useState<ScribeContextResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scribe/context');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ScribeContextResp;
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Scribe context</h2>
          {data?.path && (
            <div className="text-xs text-muted/80">{data.path}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.size != null && (
            <span className="text-xs text-muted">{(data.size / 1024).toFixed(1)} KB</span>
          )}
          {data?.mtime && (
            <span className="text-xs text-muted/80">
              updated {new Date(data.mtime).toLocaleString()}
            </span>
          )}
          <button
            type="button"
            onClick={fetchContext}
            disabled={loading}
            className="rounded bg-surface-3 px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex-1 overflow-auto rounded border border-border bg-background p-4">
        {data && data.exists === false ? (
          <div className="text-sm text-muted/80">
            No session-context.md yet. Run <code className="rounded bg-surface-2 px-1.5 py-0.5">c4 scribe scan</code> to populate.
          </div>
        ) : data?.content ? (
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{data.content}</pre>
        ) : (
          <div className="text-sm text-muted/80">(empty)</div>
        )}
      </div>
    </div>
  );
}
