import {
  ListChecks,
  Pause,
  Play,
  Plus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { FEATURES } from '../../pages/registry';
import type { TopView } from '../layout/TopTabs';
import { t } from '../../lib/i18n';
import { apiPost } from '../../lib/api';

export type CommandSection = 'Navigate' | 'Workers' | 'Queue';

export const SECTION_ORDER: readonly CommandSection[] = [
  'Navigate',
  'Workers',
  'Queue',
] as const;

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  section: CommandSection;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  run: () => void | Promise<void>;
}

export interface CommandContext {
  navigateTopView?: (v: TopView) => void;
}

function navigateToFeature(featureId: string, ctx: CommandContext): void {
  ctx.navigateTopView?.('features');
  if (typeof window === 'undefined') return;
  try {
    const url = `${window.location.pathname}${window.location.search}#/feature/${featureId}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch {
    window.location.hash = `#/feature/${featureId}`;
  }
}

function safeDispatch(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // non-browser test env
  }
}

export function buildPaletteCommands(ctx: CommandContext = {}): PaletteCommand[] {
  const nav: PaletteCommand[] = FEATURES.map((f) => ({
    id: `nav:${f.id}`,
    label: t(f.labelKey),
    section: 'Navigate',
    Icon: f.Icon,
    run: () => navigateToFeature(f.id, ctx),
  }));

  const workers: PaletteCommand[] = [
    {
      id: 'workers:new',
      label: 'New worker',
      section: 'Workers',
      Icon: Plus,
      run: () => {
        ctx.navigateTopView?.('sessions');
        safeDispatch('c4:new-chat-open');
      },
    },
    {
      id: 'workers:list',
      label: 'List workers',
      section: 'Workers',
      Icon: Users,
      run: () => {
        ctx.navigateTopView?.('workers');
      },
    },
    {
      id: 'workers:close',
      label: 'Close worker',
      section: 'Workers',
      Icon: X,
      run: () => {
        ctx.navigateTopView?.('workers');
      },
    },
    {
      id: 'workers:audit',
      label: 'Worker history',
      section: 'Workers',
      Icon: ListChecks,
      run: () => {
        ctx.navigateTopView?.('history');
      },
    },
  ];

  const queue: PaletteCommand[] = [
    {
      id: 'queue:tick',
      label: 'Tick',
      shortcut: 'T',
      section: 'Queue',
      Icon: Zap,
      run: () => {
        void apiPost('/api/autonomous/tick', {}).catch(() => {});
      },
    },
    {
      id: 'queue:pause',
      label: 'Pause',
      section: 'Queue',
      Icon: Pause,
      run: () => {
        void apiPost('/api/autonomous/pause', {}).catch(() => {});
      },
    },
    {
      id: 'queue:resume',
      label: 'Resume',
      section: 'Queue',
      Icon: Play,
      run: () => {
        void apiPost('/api/autonomous/resume', {}).catch(() => {});
      },
    },
  ];

  return [...nav, ...workers, ...queue];
}

// Match a query against a label. Returns a score (higher = better)
// or null when neither a substring nor an acronym match applies.
// Case-insensitive throughout. Substring beats acronym; a prefix
// substring beats a non-prefix substring.
export function match(query: string, label: string): number | null {
  const q = (query || '').toLowerCase().trim();
  if (!q) return 1;
  if (!label) return null;
  const l = label.toLowerCase();
  const idx = l.indexOf(q);
  if (idx === 0) return 1000;
  if (idx > 0) return 500 - Math.min(idx, 100);
  const tokens = label.split(/[\s\-_]+|(?=[A-Z])/).filter(Boolean);
  const acronym = tokens.map((tk) => tk.charAt(0).toLowerCase()).join('');
  if (acronym.startsWith(q)) return 250;
  return null;
}

export interface ScoredCommand {
  command: PaletteCommand;
  score: number;
}

// Recent-command score boost. Sized to outrank ties inside the same
// fuzzy band (substring at the same index, or another acronym) without
// jumping a recent acronym over a non-recent prefix substring match.
export const RECENT_BOOST = 100;

export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
  recentIds: readonly string[] = [],
): PaletteCommand[] {
  const q = (query || '').trim();
  if (!q) return [...commands];
  const recentSet = recentIds.length > 0 ? new Set(recentIds) : null;
  const scored: ScoredCommand[] = [];
  for (const c of commands) {
    const s = match(q, c.label);
    if (s !== null) {
      const boost = recentSet?.has(c.id) ? RECENT_BOOST : 0;
      scored.push({ command: c, score: s + boost });
    }
  }
  scored.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.command.label.localeCompare(b.command.label),
  );
  return scored.map((s) => s.command);
}
