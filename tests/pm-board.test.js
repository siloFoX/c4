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
});
