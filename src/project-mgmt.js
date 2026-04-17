'use strict';

// (10.8) Project management.
//
// Per-project task board stored as a single JSON file under
// ~/.c4/projects/<projectId>.json. Schema per project:
//   { id, name, description, createdAt,
//     milestones: [{ id, name, dueDate, status }],
//     sprints:    [{ id, name, startDate, endDate, taskIds }],
//     tasks:      [{ id, title, status, assignee, estimate,
//                    milestoneId, sprintId, description,
//                    createdAt, updatedAt }],
//     backlog:    [taskId...]
//   }
//
// Internal task status is one of 'backlog' | 'todo' | 'in_progress' |
// 'done'. TODO.md only exposes three MD states — todo / in_progress /
// done — so syncTodoMd() maps MD.todo <-> internal.backlog and keeps
// task IDs stable across roundtrips via a SHA-1 hash of projectId + title.
//
// The module is a pure storage layer: it never shells out, never touches
// the daemon, and accepts an explicit projectsDir option so tests can run
// against an isolated tmpdir without polluting the operator's real
// ~/.c4/projects directory.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const VALID_TASK_STATUS = Object.freeze(['backlog', 'todo', 'in_progress', 'done']);

// TODO.md exposes three states; map both directions so syncTodoMd is
// roundtrip-stable for the common case (backlog <-> md:todo).
const MD_TO_TASK = Object.freeze({
  'todo': 'backlog',
  'in_progress': 'in_progress',
  'done': 'done',
});
const TASK_TO_MD = Object.freeze({
  'backlog': 'todo',
  'todo': 'todo',
  'in_progress': 'in_progress',
  'done': 'done',
});

function defaultProjectsDir() {
  return path.join(os.homedir(), '.c4', 'projects');
}

// Stable task ID from (projectId, title). Re-importing the same row from
// TODO.md produces the same ID so metadata (assignee, estimate, sprint
// membership) survives a sync cycle.
function stableTaskId(projectId, title) {
  const base = String(projectId || '') + '::' + String(title || '');
  const hash = crypto.createHash('sha1').update(base).digest('hex');
  return 'task_' + hash.slice(0, 10);
}

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(5).toString('hex');
}

// Parse a markdown table body of the form:
//   | # | title | status | description |
//   |---|-------|--------|-------------|
//   | 1 | foo   | todo   | bar         |
// Returns array of { n, title, status, description } with status lowered
// and stripped of bold markers so the lookup table handles it.
function parseTodoMd(content) {
  if (typeof content !== 'string') return [];
  const rows = [];
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').slice(1, -1).map((s) => s.trim());
    if (parts.length < 4) continue;
    const first = parts[0];
    if (/^#$/.test(first) || /^N$/i.test(first)) continue; // header
    if (parts.every((p) => /^[-:]+$/.test(p))) continue;   // divider
    const statusCell = parts[2].replace(/\*\*/g, '').toLowerCase();
    rows.push({
      n: parts[0],
      title: parts[1],
      status: statusCell,
      description: parts[3],
    });
  }
  return rows;
}

function serializeTodoMd(rows) {
  const header = '| # | title | status | description |';
  const divider = '|---|-------|--------|-------------|';
  const body = [];
  for (const r of rows) {
    const status = r && r.status ? r.status : 'todo';
    const title = r && r.title ? r.title : '';
    const desc = r && r.description ? r.description : '';
    const n = r && r.n !== undefined && r.n !== null ? String(r.n) : '';
    body.push('| ' + n + ' | ' + title + ' | ' + status + ' | ' + desc + ' |');
  }
  return [header, divider, ...body].join('\n') + '\n';
}

class ProjectBoard {
  constructor(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.projectsDir = typeof o.projectsDir === 'string' && o.projectsDir.length > 0
      ? o.projectsDir
      : defaultProjectsDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  _projectPath(id) {
    return path.join(this.projectsDir, String(id) + '.json');
  }

  _read(projectId) {
    const p = this._projectPath(projectId);
    if (!fs.existsSync(p)) return null;
    try {
      const text = fs.readFileSync(p, 'utf8');
      const obj = JSON.parse(text);
      return this._normalize(obj);
    } catch {
      return null;
    }
  }

  _normalize(project) {
    if (!project || typeof project !== 'object') return project;
    project.milestones = Array.isArray(project.milestones) ? project.milestones : [];
    project.sprints = Array.isArray(project.sprints) ? project.sprints : [];
    project.tasks = Array.isArray(project.tasks) ? project.tasks : [];
    project.backlog = Array.isArray(project.backlog) ? project.backlog : [];
    for (const s of project.sprints) {
      if (!Array.isArray(s.taskIds)) s.taskIds = [];
    }
    return project;
  }

  _write(project) {
    this._ensureDir();
    this._normalize(project);
    fs.writeFileSync(this._projectPath(project.id), JSON.stringify(project, null, 2));
  }

  // --- CRUD ---------------------------------------------------------

  createProject(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const id = o.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('createProject requires a non-empty id');
    }
    if (!/^[A-Za-z0-9._-]+$/.test(id)) {
      throw new Error('Project id must match [A-Za-z0-9._-]+');
    }
    if (this._read(id)) throw new Error('Project already exists: ' + id);
    const project = {
      id,
      name: typeof o.name === 'string' && o.name.length > 0 ? o.name : id,
      description: typeof o.description === 'string' ? o.description : '',
      createdAt: new Date().toISOString(),
      milestones: [],
      sprints: [],
      tasks: [],
      backlog: [],
    };
    this._write(project);
    return project;
  }

  getProject(projectId) {
    return this._read(projectId);
  }

  listProjects() {
    this._ensureDir();
    const entries = fs.readdirSync(this.projectsDir);
    const out = [];
    for (const f of entries) {
      if (!f.endsWith('.json')) continue;
      let obj;
      try { obj = JSON.parse(fs.readFileSync(path.join(this.projectsDir, f), 'utf8')); }
      catch { continue; }
      if (!obj || !obj.id) continue;
      out.push(this._normalize(obj));
    }
    // Stable order by creation so list output is deterministic.
    out.sort((a, b) => {
      const ac = a.createdAt || '';
      const bc = b.createdAt || '';
      if (ac !== bc) return ac < bc ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });
    return out;
  }

  addTask(projectId, taskInput) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const t = taskInput && typeof taskInput === 'object' ? taskInput : {};
    const title = typeof t.title === 'string' ? t.title : '';
    if (title.length === 0) throw new Error('Task title is required');
    const id = typeof t.id === 'string' && t.id.length > 0
      ? t.id
      : stableTaskId(projectId, title);
    const existing = project.tasks.find((x) => x.id === id);
    if (existing) return existing;
    const status = VALID_TASK_STATUS.includes(t.status) ? t.status : 'backlog';
    const now = new Date().toISOString();
    const task = {
      id,
      title,
      status,
      assignee: typeof t.assignee === 'string' && t.assignee.length > 0 ? t.assignee : null,
      estimate: Number.isFinite(t.estimate) ? t.estimate : 0,
      milestoneId: typeof t.milestoneId === 'string' && t.milestoneId.length > 0 ? t.milestoneId : null,
      sprintId: typeof t.sprintId === 'string' && t.sprintId.length > 0 ? t.sprintId : null,
      description: typeof t.description === 'string' ? t.description : '',
      createdAt: now,
      updatedAt: now,
    };
    project.tasks.push(task);
    if (task.status === 'backlog' && !project.backlog.includes(id)) {
      project.backlog.push(id);
    }
    if (task.sprintId) {
      const sprint = project.sprints.find((s) => s.id === task.sprintId);
      if (sprint && !sprint.taskIds.includes(id)) sprint.taskIds.push(id);
    }
    this._write(project);
    return task;
  }

  updateTask(projectId, taskId, patch) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found: ' + taskId);
    const p = patch && typeof patch === 'object' ? patch : {};
    const patchableKeys = ['title', 'status', 'assignee', 'estimate', 'milestoneId', 'sprintId', 'description'];
    for (const key of patchableKeys) {
      if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
      if (key === 'status') {
        if (!VALID_TASK_STATUS.includes(p.status)) {
          throw new Error('Invalid status: ' + p.status);
        }
      }
      task[key] = p[key];
    }
    task.updatedAt = new Date().toISOString();
    // Backlog invariant: membership tracks task.status === 'backlog'.
    const inBacklog = project.backlog.indexOf(taskId);
    if (task.status === 'backlog' && inBacklog === -1) {
      project.backlog.push(taskId);
    } else if (task.status !== 'backlog' && inBacklog !== -1) {
      project.backlog.splice(inBacklog, 1);
    }
    // Sprint invariant: membership tracks task.sprintId.
    for (const s of project.sprints) {
      const idx = s.taskIds.indexOf(taskId);
      if (s.id === task.sprintId) {
        if (idx === -1) s.taskIds.push(taskId);
      } else if (idx !== -1) {
        s.taskIds.splice(idx, 1);
      }
    }
    this._write(project);
    return task;
  }

  moveTaskToSprint(projectId, taskId, sprintId) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found: ' + taskId);
    const targetSprint = sprintId === null || sprintId === undefined
      ? null
      : project.sprints.find((s) => s.id === sprintId);
    if ((sprintId !== null && sprintId !== undefined) && !targetSprint) {
      throw new Error('Sprint not found: ' + sprintId);
    }
    for (const s of project.sprints) {
      const idx = s.taskIds.indexOf(taskId);
      if (idx !== -1) s.taskIds.splice(idx, 1);
    }
    if (targetSprint && !targetSprint.taskIds.includes(taskId)) {
      targetSprint.taskIds.push(taskId);
    }
    task.sprintId = targetSprint ? targetSprint.id : null;
    // Moving into an active sprint promotes a backlog task to 'todo' so
    // the sprint view picks it up. Non-backlog statuses stay as they are.
    if (targetSprint && task.status === 'backlog') {
      task.status = 'todo';
      const bi = project.backlog.indexOf(taskId);
      if (bi !== -1) project.backlog.splice(bi, 1);
    }
    task.updatedAt = new Date().toISOString();
    this._write(project);
    return task;
  }

  createMilestone(projectId, m) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const input = m && typeof m === 'object' ? m : {};
    const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : genId('ms');
    if (project.milestones.find((x) => x.id === id)) {
      throw new Error('Milestone already exists: ' + id);
    }
    const milestone = {
      id,
      name: typeof input.name === 'string' && input.name.length > 0 ? input.name : id,
      dueDate: typeof input.dueDate === 'string' && input.dueDate.length > 0 ? input.dueDate : null,
      status: typeof input.status === 'string' && input.status.length > 0 ? input.status : 'open',
    };
    project.milestones.push(milestone);
    this._write(project);
    return milestone;
  }

  createSprint(projectId, s) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const input = s && typeof s === 'object' ? s : {};
    const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : genId('sp');
    if (project.sprints.find((x) => x.id === id)) {
      throw new Error('Sprint already exists: ' + id);
    }
    const sprint = {
      id,
      name: typeof input.name === 'string' && input.name.length > 0 ? input.name : id,
      startDate: typeof input.startDate === 'string' && input.startDate.length > 0 ? input.startDate : null,
      endDate: typeof input.endDate === 'string' && input.endDate.length > 0 ? input.endDate : null,
      taskIds: Array.isArray(input.taskIds) ? input.taskIds.slice() : [],
    };
    project.sprints.push(sprint);
    this._write(project);
    return sprint;
  }

  listTasks(projectId, filter) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const f = filter && typeof filter === 'object' ? filter : {};
    let tasks = project.tasks.slice();
    if (f.status !== undefined && f.status !== null) {
      const statuses = Array.isArray(f.status) ? f.status : [f.status];
      tasks = tasks.filter((t) => statuses.includes(t.status));
    }
    if (typeof f.milestoneId === 'string' && f.milestoneId.length > 0) {
      tasks = tasks.filter((t) => t.milestoneId === f.milestoneId);
    }
    if (typeof f.sprintId === 'string' && f.sprintId.length > 0) {
      tasks = tasks.filter((t) => t.sprintId === f.sprintId);
    }
    if (typeof f.assignee === 'string' && f.assignee.length > 0) {
      tasks = tasks.filter((t) => t.assignee === f.assignee);
    }
    return tasks;
  }

  projectProgress(projectId) {
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const total = project.tasks.length;
    const byStatus = { backlog: 0, todo: 0, in_progress: 0, done: 0 };
    for (const t of project.tasks) {
      if (byStatus[t.status] === undefined) byStatus[t.status] = 0;
      byStatus[t.status] += 1;
    }
    const doneTasks = byStatus.done || 0;
    const percent = total === 0 ? 0 : Math.round((doneTasks / total) * 10000) / 100;
    return {
      totalTasks: total,
      doneTasks,
      percent,
      byStatus,
    };
  }

  // --- TODO.md bidirectional sync ----------------------------------

  syncTodoMd(projectId, repoPath, opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const project = this._read(projectId);
    if (!project) throw new Error('Project not found: ' + projectId);
    const tomPath = typeof options.todoPath === 'string' && options.todoPath.length > 0
      ? options.todoPath
      : path.join(repoPath || '.', 'TODO.md');

    let imported = 0;
    if (fs.existsSync(tomPath)) {
      const content = fs.readFileSync(tomPath, 'utf8');
      const rows = parseTodoMd(content);
      for (const row of rows) {
        if (!row.title) continue;
        const id = stableTaskId(projectId, row.title);
        const mdStatus = MD_TO_TASK[row.status] || 'backlog';
        const existing = project.tasks.find((t) => t.id === id);
        if (!existing) {
          const now = new Date().toISOString();
          project.tasks.push({
            id,
            title: row.title,
            status: mdStatus,
            assignee: null,
            estimate: 0,
            milestoneId: null,
            sprintId: null,
            description: row.description || '',
            createdAt: now,
            updatedAt: now,
          });
          if (mdStatus === 'backlog' && !project.backlog.includes(id)) {
            project.backlog.push(id);
          }
          imported += 1;
        } else if (existing.status !== mdStatus) {
          existing.status = mdStatus;
          existing.updatedAt = new Date().toISOString();
          const bi = project.backlog.indexOf(id);
          if (mdStatus === 'backlog' && bi === -1) project.backlog.push(id);
          if (mdStatus !== 'backlog' && bi !== -1) project.backlog.splice(bi, 1);
        }
      }
    }

    // Always flush project first — a crash between writing the project
    // JSON and writing TODO.md still leaves the project as source of truth.
    this._write(project);

    const rowsOut = project.tasks
      .slice()
      .sort((a, b) => {
        const ac = a.createdAt || '';
        const bc = b.createdAt || '';
        if (ac !== bc) return ac < bc ? -1 : 1;
        return String(a.id).localeCompare(String(b.id));
      })
      .map((t, i) => ({
        n: String(i + 1),
        title: t.title,
        status: TASK_TO_MD[t.status] || 'todo',
        description: t.description || '',
      }));

    const md = serializeTodoMd(rowsOut);
    if (!fs.existsSync(path.dirname(tomPath))) {
      fs.mkdirSync(path.dirname(tomPath), { recursive: true });
    }
    fs.writeFileSync(tomPath, md);
    return { imported, exported: rowsOut.length, path: tomPath };
  }
}

module.exports = {
  ProjectBoard,
  VALID_TASK_STATUS,
  MD_TO_TASK,
  TASK_TO_MD,
  defaultProjectsDir,
  stableTaskId,
  parseTodoMd,
  serializeTodoMd,
};
