import { useRef, useState } from 'react';
import {
  Card,
  CardContent,
} from './ui';
import { cn } from '../lib/cn';
import { useLocale } from '../lib/i18n';
import XtermView from './XtermView';
import PinnedRulesEditor from './PinnedRulesEditor';
import WorkerDetailHeader from './WorkerDetailHeader';
import WorkerDetailKeysRow from './WorkerDetailKeysRow';
import WorkerDetailComposer from './WorkerDetailComposer';
import { useScrollback } from '../lib/use-scrollback';
import { usePersistedFontSize } from '../lib/use-persisted-font-size';
import { useWorkerActions } from '../lib/use-worker-actions';
import { stripAnsi } from '../lib/chat-helpers';

interface WorkerDetailProps {
  workerName: string;
}

type Tab = 'screen' | 'scrollback';

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
  const [tab, setTab] = useState<Tab>('screen');
  const [inputText, setInputText] = useState<string>('');

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
    </div>
  );
}
