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
  Minus,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Input,
  Label,
} from './ui';
import { cn } from '../lib/cn';
import XtermView from './XtermView';
import PinnedRulesEditor from './PinnedRulesEditor';

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
// usable. Mirrors the strings ChatView uses for consistency.
const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_CSI = /\x1b\[[\d;?=]*[ -/]*[@-~]/g;
const ANSI_OTHER = /\x1b[=>()][0-9A-Za-z]?/g;
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;
function stripAnsi(input: string): string {
  return input
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OTHER, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(CONTROL_CHARS, '');
}

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

  const runAction = async (label: string, fn: () => Promise<ActionResponse>) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fn();
      if (res.error) {
        setActionMsg(`${label} failed: ${res.error}`);
      } else {
        setActionMsg(`${label} ok`);
        fetchScrollback();
      }
    } catch (e) {
      setActionMsg(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = () => {
    const text = inputText;
    if (!text) return;
    runAction('send', () => postJson('/api/send', { name: workerName, input: text })).then(() => {
      setInputText('');
    });
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
      <CardHeader className="gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{workerName}</CardTitle>
            <CardDescription>
              Terminal session
            </CardDescription>
          </div>
          <div
            role="tablist"
            aria-label="Terminal view"
            className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-sm"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={tab === 'screen'}
              variant={tab === 'screen' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab('screen')}
            >
              Screen
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={tab === 'scrollback'}
              variant={tab === 'scrollback' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab('scrollback')}
            >
              Scrollback
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <div
            className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1"
            aria-label="Font size"
          >
            <IconButton
              aria-label="Decrease font size"
              className="h-7 w-7"
              onClick={() => bumpFont(-1)}
              icon={<Minus className="h-3.5 w-3.5" />}
            />
            <span className="min-w-[2.5rem] text-center font-mono text-foreground">
              {fontSize}px
            </span>
            <IconButton
              aria-label="Increase font size"
              className="h-7 w-7"
              onClick={() => bumpFont(1)}
              icon={<Plus className="h-3.5 w-3.5" />}
            />
          </div>
          <Label className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-normal text-muted-foreground">
            <span>auto-fit via xterm.js</span>
          </Label>
        </div>
      </CardHeader>

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
            placeholder="Send text to worker..."
            className="h-9 min-w-0 flex-1"
            disabled={busy}
          />
          <Button
            type="button"
            variant="default"
            size="icon"
            aria-label="Send text"
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
            Enter
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleMerge}
            disabled={busy}
            title="Run pre-merge checks and merge this worker's branch into main"
          >
            <GitMerge className="h-4 w-4" />
            <span>Merge</span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleClose}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            <span>Close</span>
          </Button>
        </div>

        {/* (TODO 8.42) Special-key buttons exist for soft-keyboard
            users on mobile, where Esc / Ctrl-C / Ctrl-D / Tab / arrows
            aren't reachable. Desktops have a physical keyboard that
            already sends those, so the row is hidden at md+ breakpoints
            to keep the composer area uncluttered. */}
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Keys</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('Escape')}
            disabled={busy}
          >
            Esc
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('C-c')}
            disabled={busy}
          >
            Ctrl-C
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('C-d')}
            disabled={busy}
          >
            Ctrl-D
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendKey('Tab')}
            disabled={busy}
          >
            Tab
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Arrow Up"
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
            aria-label="Arrow Down"
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
            aria-label="Arrow Left"
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
            aria-label="Arrow Right"
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
