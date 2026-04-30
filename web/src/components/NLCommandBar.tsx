// NL command bar (11.4). Sits in the header. Type a sentence, see the
// parsed plan + intent + confidence, then run.

import { useCallback, useState } from 'react';
import { Sparkles, Play, Eye } from 'lucide-react';
import { cn } from '../lib/cn';

interface PreviewResp {
  intent: string;
  plan?: { name: string; steps: { id: string; action: string; args?: unknown }[] } | null;
  confidence: number;
  args?: { text?: string };
  executed?: boolean;
  reason?: string;
  run?: { ok: boolean; order?: string[]; results?: Record<string, { error?: string }> };
}

export default function NLCommandBar() {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = useCallback(async (path: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as PreviewResp;
      setPreview(data);
      setOpen(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [text]);

  return (
    <div className="relative flex w-full items-center gap-1.5">
      <Sparkles size={14} className="shrink-0 text-primary" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send('/api/nl/parse');
          }
        }}
        placeholder='Try: "review pull request #42"  ·  "every day at 9:30 send report"  ·  "list workers"'
        className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2.5 py-1 text-xs placeholder:text-muted/70 focus:border-primary"
      />
      <button
        type="button"
        onClick={() => send('/api/nl/parse')}
        disabled={busy || !text.trim()}
        className="hidden shrink-0 items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] hover:bg-surface-3 disabled:opacity-50 sm:inline-flex"
        title="Preview only"
      >
        <Eye size={11} /> preview
      </button>
      <button
        type="button"
        onClick={() => send('/api/nl/run')}
        disabled={busy || !text.trim()}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50"
      >
        <Play size={11} /> run
      </button>

      {open && preview && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-surface-2 p-3 text-xs shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{preview.intent}</span>
              <span className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                preview.confidence >= 0.7 ? 'bg-success/15 text-success' :
                preview.confidence >= 0.4 ? 'bg-warning/15 text-warning' :
                                            'bg-danger/15 text-danger',
              )}>
                confidence {(preview.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">close</button>
          </div>
          {preview.plan ? (
            <div className="mt-2 space-y-1">
              {preview.plan.steps.map((s) => (
                <div key={s.id} className="flex items-start gap-2 rounded bg-surface px-2 py-1">
                  <span className="font-mono text-[10px] text-muted">{s.id}</span>
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px]">{s.action}</span>
                  <pre className="flex-1 whitespace-pre-wrap break-words text-[10px] text-muted">{JSON.stringify(s.args, null, 0)}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-muted">No plan ({preview.reason || 'unrecognized'}).</div>
          )}
          {preview.executed && preview.run && (
            <div className="mt-2 rounded bg-surface px-2 py-1 text-[11px]">
              <span className={cn('font-medium', preview.run.ok ? 'text-success' : 'text-danger')}>
                {preview.run.ok ? '✓ run ok' : '✗ run failed'}
              </span>{' '}
              <span className="text-muted">steps: {(preview.run.order || []).join(', ')}</span>
            </div>
          )}
          {preview.reason && !preview.executed && (
            <div className="mt-2 text-[11px] italic text-muted">{preview.reason}</div>
          )}
        </div>
      )}
      {err && <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded bg-danger/10 px-2 py-1 text-[11px] text-danger">{err}</div>}
    </div>
  );
}
