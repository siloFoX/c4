import { Badge } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { SandboxPreview } from '../pages/Risk';

// (v1.10.585) Extracted from pages/Risk. Renders the sandbox
// preview block — runtime/isolation badges, capability grid,
// argv pre, optional env details. Pure display: parent owns
// the SandboxPreview value.

interface Props {
  sandbox: SandboxPreview;
}

export default function RiskSandboxPreview({ sandbox }: Props) {
  useLocale();
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-muted/10 p-3 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="uppercase">
          {tFormat('risk.sandbox.runtime', { value: sandbox.runtime })}
        </Badge>
        <Badge variant="outline">
          {tFormat('risk.sandbox.isolation', { value: sandbox.isolation.name })}
        </Badge>
        <span className={cn(
          'text-[11px]',
          sandbox.available.ok ? 'text-success' : 'text-destructive',
        )}>
          {sandbox.available.ok
            ? t('risk.sandbox.available')
            : tFormat('risk.sandbox.unavailable', { reason: sandbox.available.reason || '?' })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground md:grid-cols-3">
        <div><span className="font-medium">{t('risk.sandbox.network')}</span> {sandbox.isolation.network}</div>
        <div><span className="font-medium">{t('risk.sandbox.filesystem')}</span> {sandbox.isolation.filesystem}</div>
        <div><span className="font-medium">{t('risk.sandbox.resources')}</span> {sandbox.isolation.resources}</div>
      </div>
      <div>
        <div className="font-medium text-foreground">{t('risk.label.argv')}</div>
        <pre tabIndex={0} className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px]">
          {sandbox.binary || '<NullRuntime>'} {sandbox.args.map((a) => /\s/.test(a) ? JSON.stringify(a) : a).join(' ')}
        </pre>
      </div>
      {Object.keys(sandbox.env || {}).length > 0 ? (
        <details>
          <summary className="cursor-pointer text-[10px] text-muted-foreground">
            env ({Object.keys(sandbox.env).length})
          </summary>
          <pre tabIndex={0} className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px]">
            {Object.entries(sandbox.env).map(([k, v]) => `${k}=${v}`).join('\n')}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
