// 10.8 PM board tests (append-only JSONL).

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PmBoard = require('../src/pm-board');

let tmpDir;

function makeMgr() {
  return { logsDir: tmpDir };
}

describe('PmBoard (10.8)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-board-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('createCard writes a create event and shows up in get()', () => {
    const board = new PmBoard(makeMgr());
    const r = board.createCard('proj', { title: 'task A' });
    assert.ok(r.success);
    assert.ok(r.cardId);
    const view = board.get('proj');
    assert.strictEqual(view.columns.backlog.length, 1);
    assert.strictEqual(view.columns.backlog[0].title, 'task A');
  });

  it('moveCard transitions across statuses', () => {
    const board = new PmBoard(makeMgr());
    const { cardId } = board.createCard('p', { title: 'x' });
    board.moveCard('p', cardId, 'in_progress');
    board.moveCard('p', cardId, 'review');
    const view = board.get('p');
    assert.strictEqual(view.columns.review[0].id, cardId);
    assert.strictEqual(view.columns.backlog.length, 0);
    assert.strictEqual(view.columns.in_progress.length, 0);
  });

  it('updateCard applies partial patch', () => {
    const board = new PmBoard(makeMgr());
    const { cardId } = board.createCard('p', { title: 'old' });
    board.updateCard('p', cardId, { title: 'new', tags: ['urgent'] });
    const view = board.get('p');
    assert.strictEqual(view.columns.backlog[0].title, 'new');
    assert.deepStrictEqual(view.columns.backlog[0].tags, ['urgent']);
  });

  it('deleteCard removes from view but stays in JSONL history', () => {
    const board = new PmBoard(makeMgr());
    const { cardId } = board.createCard('p', { title: 'x' });
    board.deleteCard('p', cardId);
    const view = board.get('p');
    assert.strictEqual(view.columns.backlog.length, 0);
    const file = path.join(tmpDir, 'board-p.jsonl');
    assert.ok(fs.readFileSync(file, 'utf8').includes('"type":"delete"'));
  });

  it('rejects invalid status', () => {
    const board = new PmBoard(makeMgr());
    assert.ok(board.createCard('p', { title: 't', status: 'whoops' }).error);
    const { cardId } = board.createCard('p', { title: 't' });
    assert.ok(board.moveCard('p', cardId, 'whoops').error);
  });

  it('importTodoMd parses ✱.✱ status table rows', () => {
    const board = new PmBoard(makeMgr());
    const todo = `
# heading

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 1.1 | Refactor X | **done** | already shipped |
| 1.2 | Plan Y | **todo** | next sprint |
| 1.3 | Hard Z | **partial** | half-done |
`;
    const todoPath = path.join(tmpDir, 'TODO.md');
    fs.writeFileSync(todoPath, todo, 'utf8');
    const r = board.importTodoMd('p', todoPath);
    assert.strictEqual(r.imported, 3);
    const view = board.get('p');
    // done → done, todo → backlog, partial → in_progress
    assert.strictEqual(view.columns.done.length, 1);
    assert.strictEqual(view.columns.backlog.length, 1);
    assert.strictEqual(view.columns.in_progress.length, 1);
  });

  // (TODO #103) Two-way sync.
  it('moveCard writes status back to TODO.md when config.pm.todoSync is on', () => {
    const todo = [
      '# Stuff',
      '',
      '| # | 항목 | 상태 | 설명 |',
      '|---|------|------|------|',
      '| 1.1 | First task | **todo** | next |',
      '| 1.2 | Second task | **todo** | also |',
      '',
    ].join('\n');
    const todoPath = path.join(tmpDir, 'TODO.md');
    fs.writeFileSync(todoPath, todo, 'utf8');

    const mgr = { logsDir: tmpDir, config: { pm: { todoSync: true, todoFile: todoPath } } };
    const board = new PmBoard(mgr);
    board.importTodoMd('p', todoPath);

    // Find the card matching the [1.1] prefix.
    const view = board.get('p');
    const target = [
      ...view.columns.backlog, ...view.columns.in_progress,
      ...view.columns.done, ...view.columns.review,
    ].find((c) => c.title.startsWith('[1.1]'));
    assert.ok(target, 'imported card present');

    board.moveCard('p', target.id, 'done');
    const updated = fs.readFileSync(todoPath, 'utf8');
    assert.match(updated, /\| 1\.1 \| First task \| \*\*done\*\* \|/);
    // 1.2 should remain unchanged.
    assert.match(updated, /\| 1\.2 \| Second task \| \*\*todo\*\* \|/);
  });

  it('moveCard is a no-op on TODO.md when card has no [<id>] prefix', () => {
    const todoPath = path.join(tmpDir, 'TODO.md');
    fs.writeFileSync(todoPath, '| 1.1 | x | **todo** | n |\n', 'utf8');
    const before = fs.readFileSync(todoPath, 'utf8');
    const mgr = { logsDir: tmpDir, config: { pm: { todoSync: true, todoFile: todoPath } } };
    const board = new PmBoard(mgr);
    const c = board.createCard('p', { title: 'free-form card', status: 'backlog' });
    board.moveCard('p', c.cardId, 'done');
    assert.strictEqual(fs.readFileSync(todoPath, 'utf8'), before);
  });

  it('moveCard skips TODO.md write when config.pm.todoSync is off', () => {
    const todoPath = path.join(tmpDir, 'TODO.md');
    fs.writeFileSync(todoPath, '| 1.1 | First | **todo** | n |\n', 'utf8');
    const before = fs.readFileSync(todoPath, 'utf8');
    const mgr = { logsDir: tmpDir, config: { pm: { todoSync: false, todoFile: todoPath } } };
    const board = new PmBoard(mgr);
    board.importTodoMd('p', todoPath);
    const view = board.get('p');
    const target = view.columns.backlog.find((c) => c.title.startsWith('[1.1]'));
    board.moveCard('p', target.id, 'done');
    assert.strictEqual(fs.readFileSync(todoPath, 'utf8'), before);
  });

  it('skip TODO.md rewrite when status already matches (no churn)', () => {
    const todo = '| 1.1 | First | **done** | n |\n';
    const todoPath = path.join(tmpDir, 'TODO.md');
    fs.writeFileSync(todoPath, todo, 'utf8');
    const writes = [];
    const realWrite = fs.writeFileSync;
    fs.writeFileSync = (...args) => {
      // Only count writes that target our TODO.md (board jsonl writes go via
      // appendFileSync, so they don't show up here).
      if (args[0] === todoPath) writes.push(args);
      return realWrite.apply(fs, args);
    };
    try {
      const mgr = { logsDir: tmpDir, config: { pm: { todoSync: true, todoFile: todoPath } } };
      const board = new PmBoard(mgr);
      board.importTodoMd('p', todoPath);
      const view = board.get('p');
      const target = view.columns.done.find((c) => c.title.startsWith('[1.1]'));
      board.moveCard('p', target.id, 'done');
    } finally {
      fs.writeFileSync = realWrite;
    }
    assert.strictEqual(writes.length, 0, 'no churn write when status unchanged');
  });
});
