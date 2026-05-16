import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  DataList,
  DetailPanel,
} from './ui';
import type { DataListItem } from './ui';
import { cn } from '../lib/cn';
import { useLocale } from '../lib/i18n';
import XtermView from './XtermView';
import PinnedRulesEditor from './PinnedRulesEditor';
import WorkerDetailHeader, { type TerminalTab } from './WorkerDetailHeader';
import WorkerDetailKeysRow from './WorkerDetailKeysRow';
import WorkerDetailComposer from './WorkerDetailComposer';
import { useScrollback } from '../lib/use-scrollback';
import { usePersistedFontSize } from '../lib/use-persisted-font-size';
import { useWorkerActions } from '../lib/use-worker-actions';
import { stripAnsi } from '../lib/chat-helpers';

interface WorkerDetailProps {
  workerName: string;
}

// (v1.10.780) Local `type Tab` removed in favor of TerminalTab
// from WorkerDetailHeader (the canonical export site).

// (v1.10.636) ReadResponse moved into useScrollback hook.

// (v1.10.637) FONT_STORAGE_KEY + clamp + readNumberStorage moved
// into usePersistedFontSize hook (sole consumer).
// (v1.10.705) ActionResponse + postJson + runAction + 5 action
// handlers moved to lib/use-worker-actions.

const MIN_FONT = 9;
const MAX_FONT = 24;
const DEFAULT_FONT = 12;

export default function WorkerDetail({ workerName }: WorkerDetailProps) {
  useLocale();
  const [tab, setTab] = useState<TerminalTab>('screen');
  const [inputText, setInputText] = useState<string>('');
  // (v1.11.265, TODO 11.247) Info slide-in for worker metadata.
  // Opens a DetailPanel beside the terminal showing the canonical
  // worker info (name, current tab, font size, scrollback line
  // count) without forcing the operator off the persistent
  // terminal view.
  const [infoOpen, setInfoOpen] = useState(false);

  // (v1.10.637) Font-size persistence hook extracted to
  // ../lib/use-persisted-font-size.
  const { fontSize, bumpFont } = usePersistedFontSize({
    defaultFont: DEFAULT_FONT,
    minFont: MIN_FONT,
    maxFont: MAX_FONT,
  });

  const scrollbackRef = useRef<HTMLPreElement | null>(null);

  // (v1.10.636) Scrollback poll hook extracted to ../lib/use-scrollback.
  // (v1.10.705) Worker actions hook handles fetchScrollback as a callback.
  const { scrollbackContent, error, fetchScrollback } = useScrollback({
    workerName,
    tab,
    setActionMsg: (next) => setActionMsg(next),
  });

  // (v1.10.705) Worker actions (send/key/merge/close) + runAction
  // + busy/actionMsg slots moved to lib/use-worker-actions.
  const {
    actionMsg, setActionMsg, busy,
    handleSend: handleSendInternal, handleEnter, sendKey,
    handleMerge, handleClose,
  } = useWorkerActions({ workerName, fetchScrollback });

  const handleSend = async () => {
    const ok = await handleSendInternal(inputText);
    if (ok) setInputText('');
  };

  const lineHeight = Math.round(fontSize * 1.25 * 100) / 100;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      {/* (v1.10.588) Card header extracted to ./WorkerDetailHeader.tsx. */}
      <WorkerDetailHeader
        workerName={workerName}
        tab={tab}
        onTabChange={setTab}
        fontSize={fontSize}
        onBumpFont={bumpFont}
      />

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <div className={cn('min-h-0 min-w-0 flex-1', tab === 'screen' ? 'block' : 'hidden')}>
          <XtermView workerName={workerName} fontSize={fontSize} visible={tab === 'screen'} />
        </div>

        {tab === 'scrollback' && (
          <pre
            ref={scrollbackRef}
            className={cn(
              'min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre rounded-md border border-border bg-background p-3 font-mono text-foreground md:p-4'
            )}
            style={{ fontSize, lineHeight: `${lineHeight}px` }}
          >
            {scrollbackContent
              ? stripAnsi(scrollbackContent)
              : <span className="text-muted-foreground">(empty)</span>}
          </pre>
        )}

        {actionMsg && (
          <div className="text-xs text-muted-foreground">{actionMsg}</div>
        )}

        {/* (v1.10.611) Composer row extracted to ./WorkerDetailComposer.tsx. */}
        <WorkerDetailComposer
          inputText={inputText}
          busy={busy}
          onChangeInputText={setInputText}
          onSend={handleSend}
          onEnter={handleEnter}
          onMerge={handleMerge}
          onClose={handleClose}
        />

        {/* (TODO 8.42) Special-key buttons exist for soft-keyboard
            users on mobile, where Esc / Ctrl-C / Ctrl-D / Tab / arrows
            aren't reachable. Desktops have a physical keyboard that
            already sends those, so the row is hidden at md+ breakpoints
            to keep the composer area uncluttered.
            (v1.10.610) Extracted to ./WorkerDetailKeysRow.tsx. */}
        <WorkerDetailKeysRow busy={busy} onSendKey={sendKey} />
      </CardContent>
    </Card>
    <PinnedRulesEditor workerName={workerName} />

    {/* (v1.11.265, TODO 11.247) Worker info slide-in. The "Info"
        button at the bottom-right slides in a DetailPanel with the
        canonical worker metadata (name + active tab + font size +
        scrollback line count). The persistent terminal pane stays
        mounted underneath so live output keeps streaming. */}
    <div className="flex justify-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setInfoOpen(true)}
        aria-label="Show worker info"
        data-testid="worker-detail-info-trigger"
      >
        <Info className="mr-1 h-3.5 w-3.5" />
        <span>Info</span>
      </Button>
    </div>
    <DetailPanel
      open={infoOpen}
      onOpenChange={setInfoOpen}
      title={workerName}
      description="Worker info"
      data-testid="worker-detail-info-panel"
      footer={
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setInfoOpen(false)}
          >
            Close
          </Button>
        </div>
      }
    >
      {/* (v1.11.277, TODO 11.259) Raw <dl> grid migrated to the
          DataList primitive (now grouped + density-aware). The
          three sections (Identity / Terminal / Last action) split
          the meta so the operator can jump straight to the
          composer status without scanning every row. */}
      <DataList
        data-testid="worker-detail-info-list"
        groups={(() => {
          const groups = [
            {
              id: 'identity',
              title: 'Identity',
              items: [
                {
                  id: 'name',
                  label: 'Worker',
                  value: workerName,
                  copyValue: workerName,
                },
              ] satisfies DataListItem[],
            },
            {
              id: 'terminal',
              title: 'Terminal',
              items: [
                { id: 'tab', label: 'Active tab', value: tab },
                {
                  id: 'fontSize',
                  label: 'Font size',
                  value: `${fontSize}px`,
                },
                {
                  id: 'scrollback',
                  label: 'Scrollback lines',
                  value: String(
                    scrollbackContent
                      ? scrollbackContent.split('\n').length
                      : 0,
                  ),
                },
              ] satisfies DataListItem[],
            },
          ];
          if (actionMsg) {
            groups.push({
              id: 'action',
              title: 'Last action',
              items: [
                { id: 'lastAction', label: 'Message', value: actionMsg },
              ] satisfies DataListItem[],
            });
          }
          return groups;
        })()}
      />
    </DetailPanel>
    </div>
  );
}
