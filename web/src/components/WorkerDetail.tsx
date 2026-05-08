import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GitMerge,
  Send,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Button,
  Card,
  CardContent,
  Input,
} from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import XtermView from './XtermView';
import PinnedRulesEditor from './PinnedRulesEditor';
import WorkerDetailHeader from './WorkerDetailHeader';
import { stripAnsi } from '../lib/chat-helpers';

interface WorkerDetailProps {
  workerName: string;
}

type Tab = 'screen' | 'scrollback';

interface ReadResponse {
  content?: string;
  error?: string;
  status?: string;
  lines?: number;
  totalScrollback?: number;
}

interface ActionResponse {
  error?: string;
  [key: string]: unknown;
}

const MIN_FONT = 9;
const MAX_FONT = 24;
const DEFAULT_FONT = 12;

const FONT_STORAGE_KEY = 'c4.term.fontSize';

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

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function readNumberStorage(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export default function WorkerDetail({ workerName }: WorkerDetailProps) {
  useLocale();
  const [tab, setTab] = useState<Tab>('screen');
  const [scrollbackContent, setScrollbackContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const [fontSize, setFontSize] = useState<number>(() =>
    clamp(readNumberStorage(FONT_STORAGE_KEY, DEFAULT_FONT), MIN_FONT, MAX_FONT)
  );

  const scrollbackRef = useRef<HTMLPreElement | null>(null);

  const fetchScrollback = useCallback(async () => {
    if (tab !== 'scrollback') return;
    try {
      const url = `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=200`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReadResponse;
      if (data.error) {
        setError(data.error);
        setScrollbackContent('');
      } else {
        setScrollbackContent(typeof data.content === 'string' ? data.content : '');
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, workerName]);

  useEffect(() => {
    setError(null);
    setActionMsg(null);
    if (tab !== 'scrollback') return;
    fetchScrollback();
    const interval = setInterval(fetchScrollback, 3000);
    return () => clearInterval(interval);
  }, [fetchScrollback, tab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FONT_STORAGE_KEY, String(fontSize));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [fontSize]);

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

  const bumpFont = (delta: number) => {
    setFontSize((prev) => clamp(prev + delta, MIN_FONT, MAX_FONT));
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

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('workerDetail.composer.placeholder')}
            className="h-9 min-w-0 flex-1"
            disabled={busy}
          />
          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label={t('workerDetail.composer.sendText')}
            onClick={handleSend}
            disabled={busy || !inputText.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleEnter}
            disabled={busy}
          >
            {t('workerDetail.composer.enter')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleMerge}
            disabled={busy}
            title={t('workerDetail.composer.mergeTitle')}
          >
            <GitMerge className="h-4 w-4" />
            <span>{t('workerDetail.composer.merge')}</span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleClose}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            <span>{t('workerDetail.composer.close')}</span>
          </Button>
        </div>

        {/* (TODO 8.42) Special-key buttons exist for soft-keyboard
            users on mobile, where Esc / Ctrl-C / Ctrl-D / Tab / arrows
            aren't reachable. Desktops have a physical keyboard that
            already sends those, so the row is hidden at md+ breakpoints
            to keep the composer area uncluttered. */}
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('workerDetail.keys.heading')}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('Escape')}
            disabled={busy}
          >
            {t('workerDetail.keys.esc')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('C-c')}
            disabled={busy}
          >
            {t('workerDetail.keys.ctrlC')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('C-d')}
            disabled={busy}
          >
            {t('workerDetail.keys.ctrlD')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('Tab')}
            disabled={busy}
          >
            {t('workerDetail.keys.tab')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={t('workerDetail.keys.arrowUp')}
            onClick={() => sendKey('Up')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={t('workerDetail.keys.arrowDown')}
            onClick={() => sendKey('Down')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={t('workerDetail.keys.arrowLeft')}
            onClick={() => sendKey('Left')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={t('workerDetail.keys.arrowRight')}
            onClick={() => sendKey('Right')}
            disabled={busy}
            className="h-8 w-8 p-0"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
    <PinnedRulesEditor workerName={workerName} />
    </div>
  );
}
