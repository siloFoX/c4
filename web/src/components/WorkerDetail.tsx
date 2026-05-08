import { useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  Card,
  CardContent,
} from './ui';
import { cn } from '../lib/cn';
import { tFormat, useLocale } from '../lib/i18n';
import XtermView from './XtermView';
import PinnedRulesEditor from './PinnedRulesEditor';
import WorkerDetailHeader from './WorkerDetailHeader';
import WorkerDetailKeysRow from './WorkerDetailKeysRow';
import WorkerDetailComposer from './WorkerDetailComposer';
import { useScrollback } from '../lib/use-scrollback';
import { usePersistedFontSize } from '../lib/use-persisted-font-size';
import { stripAnsi } from '../lib/chat-helpers';

interface WorkerDetailProps {
  workerName: string;
}

type Tab = 'screen' | 'scrollback';

// (v1.10.636) ReadResponse moved into useScrollback hook.

interface ActionResponse {
  error?: string;
  [key: string]: unknown;
}

const MIN_FONT = 9;
const MAX_FONT = 24;
const DEFAULT_FONT = 12;

// (v1.10.637) FONT_STORAGE_KEY + clamp + readNumberStorage moved
// into usePersistedFontSize hook (sole consumer).

// 8.24 scrollback-tab ANSI filter. The xterm.js view on the Screen tab
// processes raw PTY bytes; the Scrollback tab is a read-now text dump, so
// we still strip ANSI for that view to keep historical grep-style reading
// (v1.10.565) ANSI strip moved to lib/chat-helpers.ts (was a
// duplicate of ChatView's). Imported below.

async function postJson(url: string, body: unknown): Promise<ActionResponse> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ActionResponse;
}

export default function WorkerDetail({ workerName }: WorkerDetailProps) {
  useLocale();
  const [tab, setTab] = useState<Tab>('screen');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  // (v1.10.637) Font-size persistence hook extracted to
  // ../lib/use-persisted-font-size.
  const { fontSize, bumpFont } = usePersistedFontSize({
    defaultFont: DEFAULT_FONT,
    minFont: MIN_FONT,
    maxFont: MAX_FONT,
  });

  const scrollbackRef = useRef<HTMLPreElement | null>(null);

  // (v1.10.636) Scrollback poll hook extracted to ../lib/use-scrollback.
  const { scrollbackContent, error, fetchScrollback } = useScrollback({
    workerName,
    tab,
    setActionMsg,
  });


  // (8.42 review) Returns true on success so the caller can decide
  // whether to clear inputs only when the action actually went
  // through. Previously every action that errored silently still
  // ran its .then() side-effect — typing a message into a dead
  // worker would wipe the textbox even though the send failed.
  const runAction = async (label: string, fn: () => Promise<ActionResponse>): Promise<boolean> => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fn();
      if (res.error) {
        setActionMsg(tFormat('workerDetail.actionFailed', { label, error: res.error }));
        return false;
      }
      setActionMsg(tFormat('workerDetail.actionOk', { label }));
      fetchScrollback();
      return true;
    } catch (e) {
      setActionMsg(tFormat('workerDetail.actionFailed', { label, error: (e as Error).message }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    const ok = await runAction('send', () => postJson('/api/send', { name: workerName, input: text }));
    if (ok) setInputText('');
  };

  const handleEnter = () => {
    runAction('key Enter', () => postJson('/api/key', { name: workerName, key: 'Enter' }));
  };

  const sendKey = (key: string) => {
    runAction(`key ${key}`, () => postJson('/api/key', { name: workerName, key }));
  };

  const handleMerge = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Merge worker "${workerName}" into main?\n\nThis runs the pre-merge checks and performs git merge --no-ff.`
      );
      if (!ok) return;
    }
    runAction('merge', () => postJson('/api/merge', { name: workerName }));
  };

  const handleClose = () => {
    runAction('close', () => postJson('/api/close', { name: workerName }));
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
