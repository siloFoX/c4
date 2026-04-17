// (10.8) Project management tests.
//
// Exercises src/project-mgmt.js against an isolated tmpdir so the suite
// never writes to the operator's real ~/.c4/projects.
//
// Coverage targets (30+ assertions):
//  - createProject: basic shape, id validation, duplicate rejection
//  - addTask: appends, defaults, stable ID from title, dedup
//  - updateTask: patches only provided fields, status invariant, sprint sync
//  - moveTaskToSprint: cross-sprint move, null clears, backlog promotion
//  - createMilestone / createSprint: uniqueness + defaults
//  - listTasks filter by status / milestone / assignee / sprint
//  - projectProgress: empty / all-done / mixed / rounding
//  - syncTodoMd: import rows, stable IDs on re-import, export ordering
//  - parseTodoMd / serializeTodoMd roundtrip (parse then serialize yields same)

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ProjectBoard,
  VALID_TASK_STATUS,
  MD_TO_TASK,
  TASK_TO_MD,
  defaultProjectsDir,
  stableTaskId,
  parseTodoMd,
  serializeTodoMd,
} = require('../src/project-mgmt');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-projmgmt-test-'));
}

function newBoard() {
  const dir = mkTmpDir();
  return { board: new ProjectBoard({ projectsDir: dir }), dir };
}

describe('(10.8) ProjectBoard helpers', () => {
  test('(a) defaultProjectsDir points under home/.c4/projects', () => {
    const p = defaultProjectsDir();
    expect(p.endsWith(path.join('.c4', 'projects'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) VALID_TASK_STATUS covers the four internal states', () => {
    expect(VALID_TASK_STATUS).toContain('backlog');
    expect(VALID_TASK_STATUS).toContain('todo');
    expect(VALID_TASK_STATUS).toContain('in_progress');
    expect(VALID_TASK_STATUS).toContain('done');
    expect(VALID_TASK_STATUS).toHaveLength(4);
  });

  test('(c) MD_TO_TASK maps todo->backlog, in_progress, done', () => {
    expect(MD_TO_TASK['todo']).toBe('backlog');
    expect(MD_TO_TASK['in_progress']).toBe('in_progress');
    expect(MD_TO_TASK['done']).toBe('done');
  });

  test('(d) TASK_TO_MD maps backlog->todo, keeps other labels', () => {
    expect(TASK_TO_MD['backlog']).toBe('todo');
    expect(TASK_TO_MD['todo']).toBe('todo');
    expect(TASK_TO_MD['in_progress']).toBe('in_progress');
    expect(TASK_TO_MD['done']).toBe('done');
  });

  test('(e) stableTaskId is deterministic for same (id, title)', () => {
    const a = stableTaskId('p', 'Build auth');
    const b = stableTaskId('p', 'Build auth');
    const c = stableTaskId('p', 'Other');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('task_')).toBe(true);
  });
});

describe('(10.8) createProject', () => {
  test('(a) creates a project with defaults', () => {
    const { board } = newBoard();
    const p = board.createProject({ id: 'demo', name: 'Demo', description: 'd' });
    expect(p.id).toBe('demo');
    expect(p.name).toBe('Demo');
    expect(p.description).toBe('d');
    expect(p.tasks).toEqual([]);
    expect(p.milestones).toEqual([]);
    expect(p.sprints).toEqual([]);
    expect(p.backlog).toEqual([]);
    expect(typeof p.createdAt).toBe('string');
  });

  test('(b) rejects duplicate project id', () => {
    const { board } = newBoard();
    board.createProject({ id: 'dup' });
    expect(() => board.createProject({ id: 'dup' })).toThrow('already exists');
  });

  test('(c) rejects missing id', () => {
    const { board } = newBoard();
    expect(() => board.createProject({})).toThrow('requires a non-empty id');
  });

  test('(d) rejects id with invalid characters', () => {
    const { board } = newBoard();
    expect(() => board.createProject({ id: 'bad id!' })).toThrow();
  });

  test('(e) persists to <projectsDir>/<id>.json', () => {
    const { board, dir } = newBoard();
    board.createProject({ id: 'persisted' });
    expect(fs.existsSync(path.join(dir, 'persisted.json'))).toBe(true);
  });

  test('(f) getProject roundtrips', () => {
    const { board } = newBoard();
    board.createProject({ id: 'rt', name: 'X' });
    const p = board.getProject('rt');
    expect(p.id).toBe('rt');
    expect(p.name).toBe('X');
  });

  test('(g) listProjects returns all projects in creation order', () => {
    const { board } = newBoard();
    board.createProject({ id: 'a' });
    board.createProject({ id: 'b' });
    const list = board.listProjects();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('a');
    expect(list[1].id).toBe('b');
  });
});

describe('(10.8) addTask', () => {
  test('(a) appends a task with defaults', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'Implement X' });
    expect(t.title).toBe('Implement X');
    expect(t.status).toBe('backlog');
    expect(t.assignee).toBe(null);
    expect(t.estimate).toBe(0);
    expect(t.milestoneId).toBe(null);
    expect(t.sprintId).toBe(null);
    expect(typeof t.createdAt).toBe('string');
    expect(typeof t.updatedAt).toBe('string');
  });

  test('(b) appends multiple tasks in order', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.addTask('p1', { title: 'one' });
    board.addTask('p1', { title: 'two' });
    board.addTask('p1', { title: 'three' });
    const p = board.getProject('p1');
    expect(p.tasks).toHaveLength(3);
    expect(p.tasks.map((t) => t.title)).toEqual(['one', 'two', 'three']);
  });

  test('(c) backlog list updates when status=backlog', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a' });
    const p = board.getProject('p1');
    expect(p.backlog).toContain(t.id);
  });

  test('(d) non-backlog task stays out of backlog list', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a', status: 'in_progress' });
    const p = board.getProject('p1');
    expect(p.backlog).not.toContain(t.id);
  });

  test('(e) dedup: addTask with same title returns the existing task', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const a = board.addTask('p1', { title: 'dup' });
    const b = board.addTask('p1', { title: 'dup' });
    expect(a.id).toBe(b.id);
    const p = board.getProject('p1');
    expect(p.tasks).toHaveLength(1);
  });

  test('(f) rejects missing title', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    expect(() => board.addTask('p1', {})).toThrow('title');
  });

  test('(g) unknown project throws', () => {
    const { board } = newBoard();
    expect(() => board.addTask('missing', { title: 'x' })).toThrow('not found');
  });
});

describe('(10.8) updateTask', () => {
  test('(a) patches only provided fields', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a', assignee: 'alice', estimate: 3 });
    const updated = board.updateTask('p1', t.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
    expect(updated.assignee).toBe('alice');
    expect(updated.estimate).toBe(3);
    expect(updated.title).toBe('a');
  });

  test('(b) updatedAt changes, createdAt does not', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a' });
    const originalCreatedAt = t.createdAt;
    // advance clock by at least 1ms so ISO strings differ
    const before = t.updatedAt;
    const end = Date.now() + 5;
    while (Date.now() < end) { /* spin briefly */ }
    const u = board.updateTask('p1', t.id, { title: 'b' });
    expect(u.createdAt).toBe(originalCreatedAt);
    expect(u.updatedAt).not.toBe(before);
  });

  test('(c) status invariant: backlog list reflects status transitions', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a' });
    let p = board.getProject('p1');
    expect(p.backlog).toContain(t.id);
    board.updateTask('p1', t.id, { status: 'in_progress' });
    p = board.getProject('p1');
    expect(p.backlog).not.toContain(t.id);
    board.updateTask('p1', t.id, { status: 'backlog' });
    p = board.getProject('p1');
    expect(p.backlog).toContain(t.id);
  });

  test('(d) rejects invalid status', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a' });
    expect(() => board.updateTask('p1', t.id, { status: 'nope' })).toThrow('Invalid status');
  });

  test('(e) sprintId patch syncs sprint.taskIds', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const s = board.createSprint('p1', { id: 'sp1', name: 'S1' });
    const t = board.addTask('p1', { title: 'a', status: 'todo' });
    board.updateTask('p1', t.id, { sprintId: s.id });
    const p = board.getProject('p1');
    expect(p.sprints[0].taskIds).toContain(t.id);
  });

  test('(f) unknown task throws', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    expect(() => board.updateTask('p1', 'bogus', { title: 'x' })).toThrow('not found');
  });
});

describe('(10.8) moveTaskToSprint', () => {
  test('(a) moves task into a sprint', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const s1 = board.createSprint('p1', { id: 'sp1', name: 'S1' });
    const t = board.addTask('p1', { title: 'a' });
    const moved = board.moveTaskToSprint('p1', t.id, s1.id);
    expect(moved.sprintId).toBe(s1.id);
    const p = board.getProject('p1');
    expect(p.sprints[0].taskIds).toContain(t.id);
  });

  test('(b) cross-sprint move removes from old and adds to new', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const s1 = board.createSprint('p1', { id: 'sp1', name: 'S1' });
    const s2 = board.createSprint('p1', { id: 'sp2', name: 'S2' });
    const t = board.addTask('p1', { title: 'a' });
    board.moveTaskToSprint('p1', t.id, s1.id);
    board.moveTaskToSprint('p1', t.id, s2.id);
    const p = board.getProject('p1');
    expect(p.sprints[0].taskIds).not.toContain(t.id);
    expect(p.sprints[1].taskIds).toContain(t.id);
  });

  test('(c) null sprintId clears membership', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const s1 = board.createSprint('p1', { id: 'sp1', name: 'S1' });
    const t = board.addTask('p1', { title: 'a' });
    board.moveTaskToSprint('p1', t.id, s1.id);
    const cleared = board.moveTaskToSprint('p1', t.id, null);
    expect(cleared.sprintId).toBe(null);
    const p = board.getProject('p1');
    expect(p.sprints[0].taskIds).not.toContain(t.id);
  });

  test('(d) backlog task is promoted to todo when entering a sprint', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const s1 = board.createSprint('p1', { id: 'sp1', name: 'S1' });
    const t = board.addTask('p1', { title: 'a' });
    expect(t.status).toBe('backlog');
    const moved = board.moveTaskToSprint('p1', t.id, s1.id);
    expect(moved.status).toBe('todo');
    const p = board.getProject('p1');
    expect(p.backlog).not.toContain(t.id);
  });

  test('(e) unknown sprint throws', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const t = board.addTask('p1', { title: 'a' });
    expect(() => board.moveTaskToSprint('p1', t.id, 'nope')).toThrow('Sprint not found');
  });
});

describe('(10.8) createMilestone / createSprint', () => {
  test('(a) createMilestone defaults status to open', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const m = board.createMilestone('p1', { id: 'm1', name: 'Launch', dueDate: '2026-06-01' });
    expect(m.id).toBe('m1');
    expect(m.status).toBe('open');
    expect(m.dueDate).toBe('2026-06-01');
  });

  test('(b) createMilestone rejects duplicate id', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.createMilestone('p1', { id: 'm1', name: 'a' });
    expect(() => board.createMilestone('p1', { id: 'm1', name: 'b' })).toThrow('already exists');
  });

  test('(c) createSprint stores start/end dates and empty taskIds', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const s = board.createSprint('p1', { id: 'sp1', name: 'S1', startDate: '2026-04-01', endDate: '2026-04-14' });
    expect(s.taskIds).toEqual([]);
    expect(s.startDate).toBe('2026-04-01');
    expect(s.endDate).toBe('2026-04-14');
  });

  test('(d) createSprint rejects duplicate id', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.createSprint('p1', { id: 'sp1', name: 'a' });
    expect(() => board.createSprint('p1', { id: 'sp1', name: 'b' })).toThrow('already exists');
  });
});

describe('(10.8) listTasks filters', () => {
  function seed() {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const m1 = board.createMilestone('p1', { id: 'm1', name: 'Launch' });
    const s1 = board.createSprint('p1', { id: 'sp1', name: 'S1' });
    board.addTask('p1', { title: 'a', status: 'done',        assignee: 'alice', milestoneId: m1.id });
    board.addTask('p1', { title: 'b', status: 'in_progress', assignee: 'alice', sprintId:    s1.id });
    board.addTask('p1', { title: 'c', status: 'todo',        assignee: 'bob',   milestoneId: m1.id });
    board.addTask('p1', { title: 'd', status: 'backlog',     assignee: null });
    // Attach b to the sprint's taskIds too so filters match
    board.moveTaskToSprint('p1', board.listTasks('p1', { status: 'in_progress' })[0].id, s1.id);
    return board;
  }

  test('(a) filter by status (single)', () => {
    const board = seed();
    const done = board.listTasks('p1', { status: 'done' });
    expect(done).toHaveLength(1);
    expect(done[0].title).toBe('a');
  });

  test('(b) filter by status (array)', () => {
    const board = seed();
    const active = board.listTasks('p1', { status: ['todo', 'in_progress'] });
    expect(active).toHaveLength(2);
  });

  test('(c) filter by milestoneId', () => {
    const board = seed();
    const byMilestone = board.listTasks('p1', { milestoneId: 'm1' });
    expect(byMilestone.map((t) => t.title).sort()).toEqual(['a', 'c']);
  });

  test('(d) filter by assignee', () => {
    const board = seed();
    const alice = board.listTasks('p1', { assignee: 'alice' });
    expect(alice.map((t) => t.title).sort()).toEqual(['a', 'b']);
  });

  test('(e) filter by sprintId', () => {
    const board = seed();
    const inSprint = board.listTasks('p1', { sprintId: 'sp1' });
    expect(inSprint.map((t) => t.title)).toEqual(['b']);
  });

  test('(f) no filter returns all tasks', () => {
    const board = seed();
    expect(board.listTasks('p1')).toHaveLength(4);
  });

  test('(g) combined filters AND together', () => {
    const board = seed();
    const aliceDone = board.listTasks('p1', { assignee: 'alice', status: 'done' });
    expect(aliceDone).toHaveLength(1);
    expect(aliceDone[0].title).toBe('a');
  });
});

describe('(10.8) projectProgress', () => {
  test('(a) empty project returns zeros', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const prog = board.projectProgress('p1');
    expect(prog.totalTasks).toBe(0);
    expect(prog.doneTasks).toBe(0);
    expect(prog.percent).toBe(0);
    expect(prog.byStatus.backlog).toBe(0);
  });

  test('(b) all-done project reports 100%', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.addTask('p1', { title: 'a', status: 'done' });
    board.addTask('p1', { title: 'b', status: 'done' });
    const prog = board.projectProgress('p1');
    expect(prog.totalTasks).toBe(2);
    expect(prog.doneTasks).toBe(2);
    expect(prog.percent).toBe(100);
    expect(prog.byStatus.done).toBe(2);
  });

  test('(c) mixed project: 1/4 done is 25%', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.addTask('p1', { title: 'a', status: 'done' });
    board.addTask('p1', { title: 'b', status: 'in_progress' });
    board.addTask('p1', { title: 'c', status: 'todo' });
    board.addTask('p1', { title: 'd', status: 'backlog' });
    const prog = board.projectProgress('p1');
    expect(prog.totalTasks).toBe(4);
    expect(prog.doneTasks).toBe(1);
    expect(prog.percent).toBe(25);
    expect(prog.byStatus).toEqual({ backlog: 1, todo: 1, in_progress: 1, done: 1 });
  });

  test('(d) 1/3 done rounds to 33.33', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.addTask('p1', { title: 'a', status: 'done' });
    board.addTask('p1', { title: 'b', status: 'todo' });
    board.addTask('p1', { title: 'c', status: 'todo' });
    const prog = board.projectProgress('p1');
    expect(prog.percent).toBe(33.33);
  });
});

describe('(10.8) parseTodoMd / serializeTodoMd roundtrip', () => {
  test('(a) parse then serialize yields same rows', () => {
    const original = [
      { n: '1', title: 'Add auth',   status: 'todo',        description: 'JWT login' },
      { n: '2', title: 'Rate limit', status: 'in_progress', description: 'token bucket' },
      { n: '3', title: 'Docs',       status: 'done',        description: 'README' },
    ];
    const md = serializeTodoMd(original);
    const parsed = parseTodoMd(md);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].title).toBe('Add auth');
    expect(parsed[0].status).toBe('todo');
    expect(parsed[1].status).toBe('in_progress');
    expect(parsed[2].status).toBe('done');
  });

  test('(b) serialize then parse then serialize is stable', () => {
    const rows = [
      { n: '1', title: 'foo', status: 'todo', description: 'bar' },
    ];
    const md1 = serializeTodoMd(rows);
    const md2 = serializeTodoMd(parseTodoMd(md1));
    expect(md2).toBe(md1);
  });

  test('(c) parser ignores header and divider rows', () => {
    const md = [
      '| # | title | status | description |',
      '|---|-------|--------|-------------|',
      '| 1 | foo | todo | bar |',
    ].join('\n');
    const parsed = parseTodoMd(md);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('foo');
  });

  test('(d) parser tolerates bold markers and mixed case', () => {
    const md = [
      '| 1 | foo | **Done** | bar |',
    ].join('\n');
    const parsed = parseTodoMd(md);
    expect(parsed[0].status).toBe('done');
  });
});

describe('(10.8) syncTodoMd', () => {
  test('(a) imports rows from TODO.md on first sync', () => {
    const { board, dir } = newBoard();
    board.createProject({ id: 'p1' });
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-projmgmt-repo-'));
    fs.writeFileSync(path.join(repoDir, 'TODO.md'), serializeTodoMd([
      { n: '1', title: 'Implement auth',  status: 'todo',        description: 'JWT' },
      { n: '2', title: 'Add rate limiter', status: 'in_progress', description: 'tb' },
    ]));
    const res = board.syncTodoMd('p1', repoDir);
    expect(res.imported).toBe(2);
    expect(res.exported).toBe(2);
    const p = board.getProject('p1');
    expect(p.tasks).toHaveLength(2);
    expect(p.tasks[0].status).toBe('backlog'); // md:todo -> internal:backlog
    expect(p.tasks[1].status).toBe('in_progress');
    expect(dir).toBeDefined();
  });

  test('(b) re-sync preserves task IDs (stable hash)', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-projmgmt-repo-'));
    fs.writeFileSync(path.join(repoDir, 'TODO.md'), serializeTodoMd([
      { n: '1', title: 'A task', status: 'todo', description: '' },
    ]));
    board.syncTodoMd('p1', repoDir);
    const idBefore = board.getProject('p1').tasks[0].id;
    board.syncTodoMd('p1', repoDir);
    const idAfter = board.getProject('p1').tasks[0].id;
    expect(idBefore).toBe(idAfter);
  });

  test('(c) status change in TODO.md is reflected after sync', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-projmgmt-repo-'));
    const tomPath = path.join(repoDir, 'TODO.md');
    fs.writeFileSync(tomPath, serializeTodoMd([
      { n: '1', title: 'Work', status: 'todo', description: '' },
    ]));
    board.syncTodoMd('p1', repoDir);
    expect(board.getProject('p1').tasks[0].status).toBe('backlog');
    fs.writeFileSync(tomPath, serializeTodoMd([
      { n: '1', title: 'Work', status: 'done', description: '' },
    ]));
    board.syncTodoMd('p1', repoDir);
    expect(board.getProject('p1').tasks[0].status).toBe('done');
  });

  test('(d) syncTodoMd writes back the project state as TODO.md', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.addTask('p1', { title: 'only', status: 'in_progress', description: 'hi' });
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-projmgmt-repo-'));
    const res = board.syncTodoMd('p1', repoDir);
    expect(fs.existsSync(res.path)).toBe(true);
    const body = fs.readFileSync(res.path, 'utf8');
    const rows = parseTodoMd(body);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('in_progress');
    expect(rows[0].title).toBe('only');
  });

  test('(e) roundtrip: export, edit nothing, re-import yields same task set', () => {
    const { board } = newBoard();
    board.createProject({ id: 'p1' });
    board.addTask('p1', { title: 'one',   status: 'todo' });
    board.addTask('p1', { title: 'two',   status: 'in_progress' });
    board.addTask('p1', { title: 'three', status: 'done' });
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-projmgmt-repo-'));
    board.syncTodoMd('p1', repoDir);
    const mdAfter1 = fs.readFileSync(path.join(repoDir, 'TODO.md'), 'utf8');
    board.syncTodoMd('p1', repoDir);
    const mdAfter2 = fs.readFileSync(path.join(repoDir, 'TODO.md'), 'utf8');
    expect(mdAfter2).toBe(mdAfter1);
    const ids = board.getProject('p1').tasks.map((t) => t.id).sort();
    expect(new Set(ids).size).toBe(3);
  });
});
