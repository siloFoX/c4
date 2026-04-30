// PM kanban board (10.8). 4 columns + native HTML5 drag-and-drop. Talks
// to /api/board (GET) + /api/board/{card,move,update,delete}.

import { useCallback, useEffect, useState } from 'react';
import { Kanban, Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '../lib/cn';
import { useSSE } from '../lib/useSSE';

type Status = 'backlog' | 'in_progress' | 'review' | 'done';
const STATUSES: Status[] = ['backlog', 'in_progress', 'review', 'done'];
const LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
};
const COLOR: Record<Status, string> = {
  backlog: 'border-muted/40',
  in_progress: 'border-warning/50',
  review: 'border-primary/50',
  done: 'border-success/50',
};

interface Card {
  id: string;
  title: string;
  description?: string;
  status: Status;
  assignee?: string | null;
  tags?: string[];
}

interface BoardResp {
  project?: string;
  columns?: Record<Status, Card[]>;
  error?: string;
}

export default function BoardView() {
  const [project, setProject] = useState('default');
  const [columns, setColumns] = useState<Record<Status, Card[]>>({ backlog: [], in_progress: [], review: [], done: [] });
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/board?project=${encodeURIComponent(project)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BoardResp;
      if (data.error) setError(data.error);
      else { setColumns(data.columns || { backlog: [], in_progress: [], review: [], done: [] }); setError(null); }
    } catch (e) { setError((e as Error).message); }
  }, [project]);

  useEffect(() => {
    fetchBoard();
    const t = setInterval(fetchBoard, 10000);
    return () => clearInterval(t);
  }, [fetchBoard]);

  // Live refresh on board events for the current project.
  useSSE(['board_event'], (ev) => {
    if ((ev as { project?: string }).project === project) fetchBoard();
  });

  const post = async (path: string, body: unknown) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  };

  const createCard = async () => {
    if (!newTitle.trim()) return;
    await post('/api/board/card', { project, title: newTitle.trim() });
    setNewTitle('');
    fetchBoard();
  };

  const moveCard = async (cardId: string, to: Status) => {
    await post('/api/board/move', { project, cardId, to });
    fetchBoard();
  };

  const deleteCard = async (cardId: string) => {
    if (!window.confirm('Delete this card?')) return;
    await post('/api/board/delete', { project, cardId });
    fetchBoard();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Kanban size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Board</h2>
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="project"
          className="rounded border border-border bg-surface-2 px-2 py-1 text-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createCard(); }}
            placeholder="New card title…"
            className="rounded border border-border bg-surface-2 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={createCard}
            disabled={!newTitle.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-2 overflow-auto pb-2 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            cards={columns[s] || []}
            onDrop={(cardId) => moveCard(cardId, s)}
            onDelete={deleteCard}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  status, cards, onDrop, onDelete,
}: {
  status: Status; cards: Card[]; onDrop: (cardId: string) => void; onDelete: (cardId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const cardId = e.dataTransfer.getData('text/plain');
        if (cardId) onDrop(cardId);
      }}
      className={cn(
        'flex h-full flex-col rounded-lg border-2 bg-surface-2 p-2 transition-colors',
        COLOR[status],
        dragOver && 'bg-surface-3',
      )}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
        <span>{LABELS[status]}</span>
        <span>{cards.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-auto">
        {cards.map((c) => <CardItem key={c.id} card={c} onDelete={onDelete} />)}
        {cards.length === 0 && (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted/60">
            empty
          </div>
        )}
      </div>
    </div>
  );
}

function CardItem({ card, onDelete }: { card: Card; onDelete: (id: string) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', card.id)}
      className="group rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-soft hover:bg-surface-3"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={12} className="mt-0.5 shrink-0 cursor-grab text-muted/60" />
        <div className="min-w-0 flex-1">
          <div className="break-words font-medium">{card.title}</div>
          {card.description && (
            <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{card.description}</div>
          )}
          {(card.tags && card.tags.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {card.tags.map((t) => (
                <span key={t} className="rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{t}</span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="invisible rounded p-0.5 text-muted hover:text-danger group-hover:visible"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
