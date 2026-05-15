import { useMemo } from 'react';
import { Play, Trash2 } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Badge,
  Button,
  EmptyState,
  Tooltip,
  VisuallyHidden,
} from '../components/ui';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { useCommandHistory } from '../lib/command-history';
import {
  buildPaletteCommands,
  type PaletteCommand,
} from '../components/command-palette/commands';

// (v1.11.252, TODO 11.234) Command-result history page. Renders
// up to 50 timestamped CommandPalette activations from
// localStorage, with a per-row "Rerun" affordance that resolves
// the historic id against today's command registry and fires
// its `run()` thunk, plus a "Clear" button that empties the
// history slot.
//
// Why we re-resolve the command at rerun time (instead of
// persisting the `run` thunk):
//   1. Functions cannot be JSON-serialised.
//   2. The registry can evolve between sessions -- a stale
//      command id may have changed shape, been removed, or be
//      gated behind a new feature flag. Re-resolving means the
//      rerun observes the current contract; the row goes
//      "Unavailable" when the registry no longer matches.
//
// Section coloring mirrors the canonical 8-color tag palette so
// a Navigate row reads as info, a Workers row reads as accent,
// and a Queue row reads as warning -- consistent with the
// CommandPalette section headers themselves.

const SECTION_BADGE: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  Navigate: 'info',
  Workers: 'success',
  Queue: 'warning',
};

export default function CommandHistory() {
  const { entries, clear } = useCommandHistory();
  const commandIndex = useMemo<Map<string, PaletteCommand>>(() => {
    const map = new Map<string, PaletteCommand>();
    for (const cmd of buildPaletteCommands({})) map.set(cmd.id, cmd);
    return map;
  }, []);

  const handleRerun = (id: string) => {
    const cmd = commandIndex.get(id);
    if (!cmd) return;
    try {
      void cmd.run();
    } catch {
      // best-effort -- a stale command (e.g. one that opens a
      // modal that no longer exists) should not crash the
      // history surface.
    }
  };

  return (
    <PageFrame
      title="Command History"
      description={`Last ${entries.length} of 50 CommandPalette activations, persisted locally. Click Rerun to fire the command against the current registry; the row goes "Unavailable" if the id no longer resolves.`}
      actions={
        <Tooltip label="Clear all history">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={entries.length === 0}
            data-testid="command-history-clear"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <VisuallyHidden>Clear command history</VisuallyHidden>
          </Button>
        </Tooltip>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          title="No history yet"
          description="Open the CommandPalette (Ctrl+K / Cmd+K), pick a command, and it will land here."
        />
      ) : (
        <ul className="flex flex-col gap-1" data-testid="command-history-list">
          {entries.map((entry) => {
            const resolved = commandIndex.has(entry.id);
            return (
              <li
                key={entry.key}
                data-testid={`command-history-row-${entry.key}`}
                data-resolved={resolved ? '' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md border border-border bg-muted/10 p-2 text-sm',
                  !resolved && 'opacity-70',
                )}
              >
                <Badge variant={SECTION_BADGE[entry.section] ?? 'neutral'}>
                  {entry.section}
                </Badge>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-foreground">{entry.label}</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {entry.id} -- {formatRelativeTime(entry.at)}
                  </span>
                </div>
                <div className="ml-auto inline-flex items-center gap-1">
                  {resolved ? (
                    <Tooltip label="Rerun this command">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid={`command-history-rerun-${entry.key}`}
                        onClick={() => handleRerun(entry.id)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        <VisuallyHidden>Rerun {entry.label}</VisuallyHidden>
                      </Button>
                    </Tooltip>
                  ) : (
                    <span
                      data-testid={`command-history-unavailable-${entry.key}`}
                      className="text-[11px] text-muted-foreground"
                    >
                      Unavailable
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageFrame>
  );
}
