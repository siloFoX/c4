// 10.8 Project management board. Each project gets a kanban-style board
// stored as JSONL at logs/board-<project>.jsonl (append-only history) and
// a derived in-memory state map. Cards have status: backlog | in_progress
// | review | done. Optional bidirectional sync with TODO.md when
// `config.pm.todoSync = true` (TODO.md path is config.pm.todoFile).
//
// All mutations are append-only — `move` writes a new event referencing
// the prior card id. Initial implementation: read API + simple writes; UI
// + TODO sync are scaffolds for follow-up.

'use strict';

const fs = require('fs');
const path = require('path');

const STATUSES = ['backlog', 'in_progress', 'review', 'done'];

class PmBoard {
  constructor(manager) {
    this.manager = manager;
  }

  _file(project) {
    const safe = String(project).replace(/[^a-zA-Z0-9_.-]/g, '_');
    return path.join(this.manager.logsDir, `board-${safe}.jsonl`);
  }

  _load(project) {
    const file = this._file(project);
    if (!fs.existsSync(file)) return new Map();
    const cards = new Map();
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      if (!line) continue;
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      if (!evt || !evt.cardId) continue;
      switch (evt.type) {
        case 'create':
          cards.set(evt.cardId, {
            id: evt.cardId,
            title: evt.title,
            description: evt.description || '',
            status: evt.status || 'backlog',
            assignee: evt.assignee || null,
            tags: evt.tags || [],
            createdAt: evt.ts,
            updatedAt: evt.ts,
            history: [evt],
          });
          break;
        case 'update': {
          const c = cards.get(evt.cardId);
          if (!c) break;
          if (evt.title) c.title = evt.title;
          if (evt.description !== undefined) c.description = evt.description;
          if (evt.assignee !== undefined) c.assignee = evt.assignee;
          if (evt.tags) c.tags = evt.tags;
          c.updatedAt = evt.ts;
          c.history.push(evt);
          break;
        }
        case 'move': {
          const c = cards.get(evt.cardId);
          if (!c) break;
          c.status = evt.to;
          c.updatedAt = evt.ts;
          c.history.push(evt);
          break;
        }
        case 'delete':
          cards.delete(evt.cardId);
          break;
        default:
          break;
      }
    }
    return cards;
  }

  _append(project, evt) {
    const file = this._file(project);
    if (!fs.existsSync(this.manager.logsDir)) fs.mkdirSync(this.manager.logsDir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n');
    if (typeof this.manager._emitSSE === 'function') {
      this.manager._emitSSE('board_event', { project, type: evt.type, cardId: evt.cardId });
    }
  }

  // ---- API ----
  get(project) {
    const cards = this._load(project);
    const grouped = Object.fromEntries(STATUSES.map((s) => [s, []]));
    for (const c of cards.values()) {
      const arr = grouped[c.status] || (grouped[c.status] = []);
      arr.push(c);
    }
    for (const s of Object.keys(grouped)) {
      grouped[s].sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
    }
    return { project, statuses: STATUSES, columns: grouped };
  }

  createCard(project, { title, description = '', status = 'backlog', assignee = null, tags = [] } = {}) {
    if (!title) return { error: 'title is required' };
    if (status && !STATUSES.includes(status)) return { error: `invalid status: ${status}` };
    const cardId = `c4-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this._append(project, { type: 'create', cardId, title, description, status, assignee, tags });
    return { success: true, cardId };
  }

  updateCard(project, cardId, patch = {}) {
    if (!cardId) return { error: 'cardId is required' };
    const evt = { type: 'update', cardId };
    if (patch.title !== undefined) evt.title = patch.title;
    if (patch.description !== undefined) evt.description = patch.description;
    if (patch.assignee !== undefined) evt.assignee = patch.assignee;
    if (patch.tags !== undefined) evt.tags = patch.tags;
    this._append(project, evt);
    return { success: true };
  }

  moveCard(project, cardId, to) {
    if (!cardId) return { error: 'cardId is required' };
    if (!STATUSES.includes(to)) return { error: `invalid status: ${to}` };
    this._append(project, { type: 'move', cardId, to });
    // (TODO #103) two-way sync: when config.pm.todoSync is enabled, mirror
    // the new status back into TODO.md so the on-disk file stays
    // canonical.
    this._maybeSyncToTodo(project, cardId);
    return { success: true };
  }

  deleteCard(project, cardId) {
    if (!cardId) return { error: 'cardId is required' };
    this._append(project, { type: 'delete', cardId });
    return { success: true };
  }

  // (TODO #103) Two-way sync. When the card's title carries an `[<id>]`
  // prefix (assigned at import time) and config.pm.todoSync is on, locate
  // the matching `| <id> | <title> | **<status>** |` row and update its
  // status column to match the board move.
  //
  // Mapping back to TODO.md status vocabulary:
  //   board.done         → **done**
  //   board.in_progress  → **partial**  (closest semantic match)
  //   board.review       → **partial**  (still mid-flight)
  //   board.backlog      → **todo**
  _maybeSyncToTodo(project, cardId) {
    const cfg = (this.manager.config && this.manager.config.pm) || {};
    if (!cfg.todoSync || !cfg.todoFile) return;
    if (!fs.existsSync(cfg.todoFile)) return;
    const cards = this._load(project);
    const card = cards.get(cardId);
    if (!card) return;
    const m = String(card.title).match(/^\[(\d+\.\d+)\]/);
    if (!m) return;
    const id = m[1];
    const wantedStatus = ({
      done: 'done',
      in_progress: 'partial',
      review: 'partial',
      backlog: 'todo',
    })[card.status] || 'todo';
    const text = fs.readFileSync(cfg.todoFile, 'utf8');
    const lines = text.split('\n');
    let mutated = false;
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i].match(/^(\|\s*)(\d+\.\d+)(\s*\|\s*[^|]+?\s*\|\s*\*\*)(\w+)(\*\*\s*\|.*)$/);
      if (!row) continue;
      if (row[2] !== id) continue;
      if (row[4] === wantedStatus) return; // already matches — no churn
      lines[i] = row[1] + row[2] + row[3] + wantedStatus + row[5];
      mutated = true;
      break;
    }
    if (mutated) {
      fs.writeFileSync(cfg.todoFile, lines.join('\n'));
      if (typeof this.manager._emitSSE === 'function') {
        this.manager._emitSSE('board_todo_sync', { project, cardId, id, status: wantedStatus });
      }
    }
  }

  // ---- TODO.md sync (10.8 follow-up) ----
  // One-way import: parse a TODO.md table into card rows. Bidirectional
  // sync is a known TODO; the import path here lets a project bootstrap
  // its board from existing TODO docs.
  importTodoMd(project, todoPath) {
    if (!fs.existsSync(todoPath)) return { error: `TODO file not found: ${todoPath}` };
    const text = fs.readFileSync(todoPath, 'utf8');
    let imported = 0;
    for (const line of text.split('\n')) {
      const m = line.match(/^\|\s*(\d+\.\d+)\s*\|\s*([^|]+?)\s*\|\s*\*\*(\w+)\*\*\s*\|/);
      if (!m) continue;
      const [, id, title, status] = m;
      const mapped = ({ done: 'done', partial: 'in_progress', todo: 'backlog' })[status.toLowerCase()] || 'backlog';
      this.createCard(project, { title: `[${id}] ${title}`, status: mapped, tags: ['imported', `phase-${id.split('.')[0]}`] });
      imported++;
    }
    return { success: true, imported };
  }
}

module.exports = PmBoard;
