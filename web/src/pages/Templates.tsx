import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { Badge, Button, Input, Panel } from '../components/ui';
import { apiGet } from '../lib/api';
import { fuzzyFilter } from '../lib/fuzzyFilter';

// 8.20B Templates. Read-only list from GET /api/templates. Add / remove
// endpoints do not exist yet on the daemon, so the UI calls toast
// "Not implemented yet" and tracks the server-side work in TODO.md
// (sub-task 8.20b-templates-write).

interface TemplateItem {
  name: string;
  description?: string;
  model?: string;
  effort?: string;
  profile?: string;
  source?: string;
  [key: string]: unknown;
}

interface TemplatesResponse {
  templates?: TemplateItem[];
  error?: string;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Templates() {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<TemplatesResponse>('/api/templates');
      setItems(Array.isArray(r.templates) ? r.templates : []);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => fuzzyFilter(items, filter, (t) => `${t.name} ${t.description || ''} ${t.model || ''}`),
    [items, filter],
  );

  const notImplemented = () =>
    showToast('Add/remove templates — not implemented yet (server-side endpoint pending).', 'info');

  return (
    <PageFrame
      title="Templates"
      description="Reusable worker templates — name, model, effort, profile, source."
      actions={
        <>
          <Input
            className="h-8 w-48"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter templates"
          />
          <Button type="button" variant="outline" size="sm" onClick={notImplemented}>
            <ScrollText className="h-3.5 w-3.5" />
            <span>Add</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </>
      }
    >
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyPanel message="No templates defined yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((t) => (
            <li key={t.name}>
              <Panel className="p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-foreground">{t.name}</span>
                  {t.source && <Badge variant="outline">{t.source}</Badge>}
                  {t.model && <Badge variant="outline">{t.model}</Badge>}
                  {t.effort && <Badge variant="outline">{t.effort}</Badge>}
                  {t.profile && <Badge variant="outline">{t.profile}</Badge>}
                </div>
                {t.description && (
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                )}
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                    Remove
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </div>
    </PageFrame>
  );
}
