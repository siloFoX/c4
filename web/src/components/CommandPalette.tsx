import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { EmptyState } from './ui';
import { cn } from '../lib/cn';
import { useEscapeToClose } from '../lib/use-escape-to-close';
import {
  SECTION_ORDER,
  buildPaletteCommands,
  filterCommands,
  type CommandContext,
  type CommandSection,
  type PaletteCommand,
} from './command-palette/commands';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  ctx?: CommandContext;
  commands?: readonly PaletteCommand[];
}

export default function CommandPalette({
  open,
  onClose,
  ctx,
  commands: providedCommands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const built = useMemo(
    () => providedCommands ?? buildPaletteCommands(ctx ?? {}),
    [providedCommands, ctx],
  );

  const filtered = useMemo(() => filterCommands(built, query), [built, query]);

  const sections = useMemo(() => {
    const byKey: Record<CommandSection, PaletteCommand[]> = {
      Navigate: [],
      Workers: [],
      Queue: [],
    };
    for (const c of filtered) byKey[c.section].push(c);
    return SECTION_ORDER
      .map((s) => ({ section: s, items: byKey[s] }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  const flat = useMemo(() => sections.flatMap((g) => g.items), [sections]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEscapeToClose({ open, onClose });

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        if (flat.length === 0) return;
        e.preventDefault();
        const cmd = flat[Math.max(0, Math.min(activeIndex, flat.length - 1))];
        if (cmd) {
          void cmd.run();
          onClose();
        }
      }
    },
    [activeIndex, flat, onClose],
  );

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      data-command-palette
      onClick={onClose}
      onKeyDown={onKeyDown}
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[15vh] backdrop-blur',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
      )}
    >
      <div
        data-command-panel
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-lg',
          'motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-150',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            aria-label="Search commands"
            data-command-input
            className="h-9 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
          />
        </div>
        <div
          role="listbox"
          aria-label="Commands"
          className="max-h-[60vh] overflow-y-auto py-1"
        >
          {sections.length === 0 ? (
            <div className="p-3">
              <EmptyState
                title="No matching commands"
                description="Try a different search term."
              />
            </div>
          ) : (
            sections.map((g) => (
              <div key={g.section} data-section={g.section}>
                <div
                  data-section-header
                  className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {g.section}
                </div>
                {g.items.map((cmd) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const active = idx === activeIndex;
                  const Icon = cmd.Icon;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-command-id={cmd.id}
                      onClick={() => {
                        void cmd.run();
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-accent/40',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint ? (
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {cmd.hint}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
