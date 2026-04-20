import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks, RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Input, Panel, Tooltip } from '../components/ui';
import { apiGet } from '../lib/api';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import { t, useLocale } from '../lib/i18n';

// 8.20B Profiles. Read-only list from GET /api/profiles. Add/edit/remove
// endpoints are tracked as a follow-up TODO; the UI toasts "Not
// implemented yet" for those actions so the permission matrix is still
// browsable today.

interface ProfileItem {
  name: string;
  description?: string;
  allow?: string[];
  deny?: string[];
  source?: string;
  [key: string]: unknown;
}

interface ProfilesResponse {
  profiles?: ProfileItem[];
  error?: string;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Profiles() {
  useLocale();
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<ProfilesResponse>('/api/profiles');
      setItems(Array.isArray(r.profiles) ? r.profiles : []);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const filtered = useMemo(
    () => fuzzyFilter(items, filter, (p) => `${p.name} ${p.description || ''}`),
    [items, filter],
  );

  const notImplemented = () =>
    showToast('Profile add/edit — not implemented yet (server-side endpoint pending).', 'info');

  return (
    <PageFrame
      title="Profiles"
      description="Permission profiles — allow / deny patterns a worker inherits when spawned with --profile."
      actions={
        <>
          <Tooltip label={t('profiles.tooltip.filter')}>
            <Input
              className="h-8 w-48"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter profiles"
            />
          </Tooltip>
          <Tooltip label={t('profiles.tooltip.add')}>
            <Button type="button" variant="outline" size="sm" onClick={notImplemented}>
              <ListChecks className="h-3.5 w-3.5" />
              <span>Add</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('profiles.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="profiles.summary"
        cliKey="profiles.cli"
        exampleKey="profiles.example"
        useCasesKey="profiles.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyPanel message={t('profiles.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => {
            const isOpen = expanded.has(p.name);
            const allow = Array.isArray(p.allow) ? p.allow : [];
            const deny = Array.isArray(p.deny) ? p.deny : [];
            return (
              <li key={p.name}>
                <Panel className="p-3">
                  <button
                    type="button"
                    onClick={() => toggle(p.name)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-foreground">{p.name}</span>
                        {p.source && <Badge variant="outline">{p.source}</Badge>}
                        <Badge variant="outline">{allow.length} allow</Badge>
                        <Badge variant="outline">{deny.length} deny</Badge>
                      </div>
                      {p.description && (
                        <div className="mt-1 text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{isOpen ? 'hide' : 'show'}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <PatternList label="Allow" items={allow} tone="ok" />
                      <PatternList label="Deny" items={deny} tone="danger" />
                    </div>
                  )}
                  {isOpen && (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        Remove
                      </Button>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
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

function PatternList({ label, items, tone }: { label: string; items: string[]; tone: 'ok' | 'danger' }) {
  const color = tone === 'ok' ? 'text-emerald-400' : 'text-destructive';
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground">—</div>
      ) : (
        <ul className="space-y-0.5 font-mono">
          {items.map((pat, i) => (
            <li key={`${pat}-${i}`} className={color}>{pat}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
