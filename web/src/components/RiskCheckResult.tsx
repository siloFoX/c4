import { Badge, Chip } from './ui';
import type { ChipTone } from './ui/chip';
import { t, tFormat, useLocale } from '../lib/i18n';
import {
  type CheckResponse,
} from '../pages/Risk';

// (v1.11.166) Risk level / action / wouldDeny / denyList rendered
// via Chip. Level + action map onto the chip tone vocabulary —
// critical/high collapse onto 'danger' and 'deny' is the same.
const LEVEL_CHIP_TONE: Record<CheckResponse['level'], ChipTone> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};
const ACTION_CHIP_TONE: Record<CheckResponse['suggestedAction'], ChipTone> = {
  allow: 'success',
  review: 'warning',
  deny: 'danger',
};

// (v1.10.605) Extracted from pages/Risk. The classifier check
// result panel — level/action/wouldDeny/denyList badges +
// threshold caption + reasons list + decoded/inspected pre +
// static-intent rollups. Pure display: parent owns the
// CheckResponse value.

interface Props {
  result: CheckResponse;
}

export default function RiskCheckResult({ result }: Props) {
  useLocale();
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-muted/10 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="solid" tone={LEVEL_CHIP_TONE[result.level]} className="uppercase">
          {result.level}
        </Chip>
        <Chip variant="solid" tone={ACTION_CHIP_TONE[result.suggestedAction]} className="uppercase">
          {result.suggestedAction}
        </Chip>
        {result.wouldDeny ? (
          <Chip variant="solid" tone="danger" className="uppercase">{t('risk.badge.wouldDeny')}</Chip>
        ) : null}
        {result.denyForced ? (
          <Chip variant="outline" className="uppercase">{t('risk.badge.denyList')}</Chip>
        ) : null}
        <span className="text-[11px] text-muted-foreground">
          {tFormat('risk.threshold', { level: result.autoDenyLevel })}
          {!result.enforcementEnabled ? t('risk.enforcementOff') : ''}
        </span>
      </div>
      {result.reasons.length > 0 ? (
        <div>
          <div className="text-[11px] font-medium text-foreground">
            {tFormat('riskPage.reasons', { count: result.reasons.length })}
          </div>
          <ul className="mt-1 space-y-0.5">
            {result.reasons.map((r, i) => (
              <li key={i} className="text-[11px]">
                <code className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                  {r.code}
                </code>
                <span className="ml-1 text-muted-foreground">— {r.label}</span>
                {r.snippet ? (
                  <span className="ml-1 italic text-muted-foreground">
                    “{r.snippet}”
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.decoded ? (
        <div>
          <div className="text-[11px] font-medium text-foreground">
            {t('riskPage.decoded')}
          </div>
          <pre tabIndex={0} className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px]">
            {result.decoded}
          </pre>
        </div>
      ) : null}
      {result.inspectedSource ? (
        <div>
          <div className="text-[11px] font-medium text-foreground">
            {t('riskPage.inspectedSource')}
          </div>
          <pre tabIndex={0} className="mt-1 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px]">
            {result.inspectedSource}
          </pre>
        </div>
      ) : null}
      {result.intent && !result.intent.empty ? (
        <div>
          <div className="text-[11px] font-medium text-foreground">
            {t('riskPage.staticIntent')}
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {result.intent.privileged ? (
              <li><Badge variant="destructive" className="text-[10px]">{t('risk.badge.privileged')}</Badge></li>
            ) : null}
            {(result.intent.filesWritten || []).length > 0 ? (
              <li>
                <span className="text-muted-foreground">{t('risk.intent.writes')}</span>
                {result.intent.filesWritten!.map((f) => (
                  <code key={f} className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px]">
                    {f}
                  </code>
                ))}
              </li>
            ) : null}
            {(result.intent.filesRead || []).length > 0 ? (
              <li>
                <span className="text-muted-foreground">{t('risk.intent.reads')}</span>
                {result.intent.filesRead!.map((f) => (
                  <code key={f} className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px]">
                    {f}
                  </code>
                ))}
              </li>
            ) : null}
            {(result.intent.networkPeers || []).length > 0 ? (
              <li>
                <span className="text-muted-foreground">{t('risk.intent.network')}</span>
                {result.intent.networkPeers!.map((p) => (
                  <code key={p} className="ml-1 rounded border border-border bg-background px-1 font-mono text-[10px]">
                    {p}
                  </code>
                ))}
              </li>
            ) : null}
            {(result.intent.destructiveVerbs || []).length > 0 ? (
              <li>
                <span className="text-muted-foreground">{t('risk.intent.destructive')}</span>
                {result.intent.destructiveVerbs!.map((v) => (
                  <code key={v} className="ml-1 rounded border border-warning/40 bg-warning/10 px-1 font-mono text-[10px] text-warning">
                    {v}
                  </code>
                ))}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
