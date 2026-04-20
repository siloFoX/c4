import { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Label, Panel, Tooltip } from '../components/ui';
import { apiFetch, apiGet } from '../lib/api';
import type { ListResponse, Worker } from '../types';
import { t, useLocale } from '../lib/i18n';

// 8.20B Swarm view. GET /api/swarm?name=<worker> returns the swarm
// tree and per-node status. Renders a simple recursive tree with
// status badges.

interface SwarmNode {
  name: string;
  status?: string;
  branch?: string;
  children?: SwarmNode[];
  [key: string]: unknown;
}

interface SwarmResponse {
  root?: SwarmNode;
  nodes?: SwarmNode[];
  error?: string;
  [key: string]: unknown;
}

export default function Swarm() {
  useLocale();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [data, setData] = useState<SwarmResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkers = useCallback(async () => {
    try {
      const r = await apiGet<ListResponse>('/api/list');
      const ws = Array.isArray(r.workers) ? r.workers : [];
      setWorkers(ws);
      if (!selected && ws.length > 0) setSelected(ws[0].name);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selected]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const loadSwarm = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/swarm?name=${encodeURIComponent(selected)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = (await res.json()) as SwarmResponse;
      if (r.error) {
        setError(r.error);
        setData(null);
      } else {
        setData(r);
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    loadSwarm();
  }, [loadSwarm]);

  const rootNode = data?.root || (Array.isArray(data?.nodes) && data?.nodes?.length ? data?.nodes?.[0] : null);

  return (
    <PageFrame
      title="Swarm"
      description="Given a root worker, show the hierarchy of sub-workers it spawned and each node's status."
      actions={
        <>
          <Tooltip label={t('swarm.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={loadSwarm} disabled={loading || !selected}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh swarm</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="swarm.summary"
        cliKey="swarm.cli"
        exampleKey="swarm.example"
        useCasesKey="swarm.useCases"
        onOpenHelp={openHelpDrawer}
      />
      <div className="flex flex-col gap-1 md:max-w-xs">
        <Label htmlFor="swarm-worker">Root worker</Label>
        <Tooltip label={t('swarm.tooltip.root')} placement="top">
          <select
            id="swarm-worker"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— select —</option>
            {workers.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        </Tooltip>
      </div>

      {error && <ErrorPanel message={error} />}
      {loading && !data ? <LoadingSkeleton rows={4} /> : null}
      {data && !rootNode ? (
        <EmptyPanel message={t('swarm.empty')} />
      ) : null}

      {rootNode && (
        <Panel
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title={`Swarm for ${selected}`}
          className="p-3"
        >
          <TreeNode node={rootNode} depth={0} />
        </Panel>
      )}
    </PageFrame>
  );
}

function TreeNode({ node, depth }: { node: SwarmNode; depth: number }) {
  const children = Array.isArray(node.children) ? node.children : [];
  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 16 }} className="text-xs">
      <div className="flex items-center gap-2 py-1">
        <span className="font-mono text-foreground">{node.name}</span>
        {node.status && (
          <Badge variant="outline" className="uppercase">{String(node.status)}</Badge>
        )}
        {node.branch && (
          <span className="font-mono text-muted-foreground">{String(node.branch)}</span>
        )}
      </div>
      {children.map((child, i) => (
        <TreeNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
