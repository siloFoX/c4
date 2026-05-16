import { Minus, Plus } from 'lucide-react';
import {
  Button,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Label,
  StatusPill,
} from './ui';
import type { StatusPillStatus } from './ui';
import { t, useLocale } from '../lib/i18n';

// (v1.10.588) Extracted from WorkerDetail. Card header with the
// title (worker name + sub-text), the screen/scrollback tab
// switcher, and the font-size adjustor + auto-fit label. Pure
// controlled inputs: parent owns tab + font state.

export type TerminalTab = 'screen' | 'scrollback';

interface Props {
  workerName: string;
  tab: TerminalTab;
  onTabChange: (next: TerminalTab) => void;
  fontSize: number;
  onBumpFont: (delta: number) => void;
  // (v1.11.278, TODO 11.260) Optional worker live status surfaced
  // as a StatusPill chip beside the title. When omitted no pill
  // renders so existing call sites stay byte-identical.
  liveStatus?: StatusPillStatus;
  liveLabel?: string;
}

export default function WorkerDetailHeader({
  workerName,
  tab,
  onTabChange,
  fontSize,
  onBumpFont,
  liveStatus,
  liveLabel,
}: Props) {
  useLocale();
  return (
    <CardHeader className="gap-3 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate">{workerName}</CardTitle>
            {liveStatus ? (
              <StatusPill
                status={liveStatus}
                size="sm"
                pulse={liveStatus === 'online' || liveStatus === 'busy'}
                {...(liveLabel ? { label: liveLabel } : {})}
                data-testid="worker-detail-header-status"
              />
            ) : null}
          </div>
          <CardDescription>
            {t('workerDetail.terminalSession')}
          </CardDescription>
        </div>
        <div
          role="tablist"
          aria-label={t('workerDetail.terminalView')}
          className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-sm"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={tab === 'screen'}
            variant={tab === 'screen' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('screen')}
          >
            {t('workerDetail.tab.screen')}
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={tab === 'scrollback'}
            variant={tab === 'scrollback' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('scrollback')}
          >
            {t('workerDetail.tab.scrollback')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <div
          className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1"
          aria-label={t('workerDetail.font.label')}
        >
          <IconButton
            aria-label={t('workerDetail.font.decrease')}
            className="h-7 w-7"
            onClick={() => onBumpFont(-1)}
            icon={<Minus className="h-3.5 w-3.5" />}
          />
          <span className="min-w-[2.5rem] text-center font-mono text-foreground">
            {fontSize}px
          </span>
          <IconButton
            aria-label={t('workerDetail.font.increase')}
            className="h-7 w-7"
            onClick={() => onBumpFont(1)}
            icon={<Plus className="h-3.5 w-3.5" />}
          />
        </div>
        <Label className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-normal text-muted-foreground">
          <span>{t('workerDetail.font.autoFit')}</span>
        </Label>
      </div>
    </CardHeader>
  );
}
