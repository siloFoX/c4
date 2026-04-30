// Fleet view (9.6 + 9.8). Three blocks:
//  - Peer health (latency / online / offline)
//  - Cross-peer worker list
//  - File transfers (in-flight + recent)

import { useCallback, useEffect, useState } from 'react';
import { Network, Wifi, WifiOff, ArrowRightLeft, Send } from 'lucide-react';
import { cn } from '../lib/cn';

interface Peer {
  name: string;
  label?: string;
  host?: string;
  port?: number;
  status: 'online' | 'unreachable';
  latencyMs: number;
  health?: { ok: boolean; workers: number; version?: string } | null;
  error?: string | null;
}

interface PeerListEntry {
  peer: string;
  label?: string;
  ok: boolean;
  workers?: { name: string; status?: string; branch?: string | null }[];
  error?: string;
}

interface Transfer {
  id: string;
  from?: string; to?: string;
  src?: string; dst?: string;
  status: string;
  startedAt?: string; completedAt?: string | null;
  exitCode?: number | null;
  cmd?: string;
}

export default function FleetView() {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [list, setList] = useState<PeerListEntry[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transferForm, setTransferForm] = useState({ from: 'local', to: '', src: '', dst: '', mode: 'rsync' });

  const fetchAll = useCallback(async () => {
    try {
      const [p, l, t] = await Promise.all([
        fetch('/api/fleet/peers').then((r) => r.json()),
        fetch('/api/fleet/list').then((r) => r.json()),
        fetch('/api/fleet/transfer').then((r) => r.json()),
      ]);
      if (p.error) setError(p.error);
      else { setError(null); setPeers(p.peers || []); }
      if (l.peers) setList(l.peers);
      if (t.transfers) setTransfers(t.transfers);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 5000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const startTransfer = async () => {
    if (!transferForm.src || !transferForm.dst) return;
    await fetch('/api/fleet/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transferForm),
    });
    fetchAll();
  };

  const cancelTransfer = async (id: string) => {
    await fetch('/api/fleet/transfer/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto pb-2">
      <div className="flex items-center gap-2">
        <Network size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Fleet</h2>
        <span className="ml-auto text-[11px] text-muted">{peers.length} peer(s)</span>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Peer health */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {peers.map((p) => (
          <div key={p.name} className={cn(
            'rounded-lg border bg-surface-2 p-3',
            p.status === 'online' ? 'border-success/40' : 'border-danger/40',
          )}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {p.status === 'online' ? <Wifi size={12} className="text-success" /> : <WifiOff size={12} className="text-danger" />}
                  <span className="font-mono text-sm font-semibold">{p.label || p.name}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted">{p.host}:{p.port}</div>
              </div>
              <div className="text-right">
                <div className={cn('text-[11px] font-medium', p.status === 'online' ? 'text-success' : 'text-danger')}>
                  {p.status}
                </div>
                <div className="text-[10px] text-muted">{p.latencyMs}ms</div>
              </div>
            </div>
            {p.health && (
              <div className="mt-2 text-[11px] text-muted">workers: {p.health.workers} · {p.health.version || ''}</div>
            )}
            {p.error && <div className="mt-2 text-[11px] text-danger">{p.error}</div>}
          </div>
        ))}
        {peers.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted md:col-span-2 xl:col-span-3">
            No peers configured — add to <code className="rounded bg-surface-2 px-1.5 py-0.5">config.fleet.peers</code>.
          </div>
        )}
      </div>

      {/* Aggregated workers */}
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Workers across fleet</div>
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">Peer</th>
              <th className="px-2 py-1 font-medium">Worker</th>
              <th className="px-2 py-1 font-medium">Status</th>
              <th className="px-2 py-1 font-medium">Branch</th>
            </tr>
          </thead>
          <tbody>
            {list.flatMap((peer) => (
              peer.ok && peer.workers
                ? peer.workers.map((w, i) => (
                    <tr key={`${peer.peer}-${w.name}-${i}`} className="border-t border-border">
                      <td className="px-2 py-1 font-mono">{peer.label || peer.peer}</td>
                      <td className="px-2 py-1 font-mono">{w.name}</td>
                      <td className="px-2 py-1 text-muted">{w.status}</td>
                      <td className="px-2 py-1 font-mono text-muted">{w.branch || '—'}</td>
                    </tr>
                  ))
                : peer.ok ? [] : [(
                    <tr key={peer.peer} className="border-t border-border">
                      <td className="px-2 py-1 font-mono">{peer.label || peer.peer}</td>
                      <td colSpan={3} className="px-2 py-1 text-danger">{peer.error}</td>
                    </tr>
                  )]
            ))}
            {list.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-2 text-center text-muted">no peer data</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* File transfer */}
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <ArrowRightLeft size={12} /> File transfer (rsync)
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[80px,80px,1fr,1fr,80px,auto]">
          <input value={transferForm.from} onChange={(e) => setTransferForm({ ...transferForm, from: e.target.value })} placeholder="from peer" className="rounded border border-border bg-surface px-2 py-1 text-xs" />
          <input value={transferForm.to} onChange={(e) => setTransferForm({ ...transferForm, to: e.target.value })} placeholder="to peer" className="rounded border border-border bg-surface px-2 py-1 text-xs" />
          <input value={transferForm.src} onChange={(e) => setTransferForm({ ...transferForm, src: e.target.value })} placeholder="src path" className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs" />
          <input value={transferForm.dst} onChange={(e) => setTransferForm({ ...transferForm, dst: e.target.value })} placeholder="dst path" className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs" />
          <select value={transferForm.mode} onChange={(e) => setTransferForm({ ...transferForm, mode: e.target.value })} className="rounded border border-border bg-surface px-2 py-1 text-xs">
            <option value="rsync">rsync</option>
            <option value="scp">scp</option>
          </select>
          <button
            type="button"
            onClick={startTransfer}
            disabled={!transferForm.src || !transferForm.dst}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Send size={12} /> Start
          </button>
        </div>

        {transfers.length > 0 && (
          <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-left text-[11px]">
              <thead className="bg-surface-3 text-muted">
                <tr>
                  <th className="px-2 py-1 font-medium">id</th>
                  <th className="px-2 py-1 font-medium">cmd</th>
                  <th className="px-2 py-1 font-medium">status</th>
                  <th className="px-2 py-1 font-medium">exit</th>
                  <th className="px-2 py-1 font-medium">actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-2 py-1 font-mono text-muted">{t.id}</td>
                    <td className="px-2 py-1"><div className="line-clamp-1 max-w-[320px] font-mono">{t.cmd}</div></td>
                    <td className="px-2 py-1">{t.status}</td>
                    <td className="px-2 py-1 font-mono">{t.exitCode ?? '—'}</td>
                    <td className="px-2 py-1">
                      {t.status === 'running' && (
                        <button onClick={() => cancelTransfer(t.id)} className="rounded border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/20">cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
