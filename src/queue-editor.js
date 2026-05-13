'use strict';

// (11.76) Queue web editor backend.
//
// Parses docs/autonomous-queue-v10.md into structured rows + scaffolding
// and rebuilds it from a user-supplied rows[] array. The scaffolding
// fields preserve preamble + postamble verbatim, so the operator's
// edits round-trip without disturbing surrounding prose.
//
// The doc layout we treat as canonical:
//
//   preamble                  -- everything before the first `|`-line
//   header                    -- e.g. `| # | Task | Status | Detail |`
//   separator                 -- e.g. `|---|------|--------|--------|`
//   data rows + interlude     -- rows are `|`-lines with parseable
//                                cells; interlude is any non-`|` lines
//                                that appear between data rows
//   postamble                 -- everything after the last `|`-line
//
// On write, we emit `preamble + header + sep + rows + interlude +
// postamble`. The interlude (e.g. an `## Operating rules` block that
// sits between two table rows) lands at the end of the table block
// since row reordering makes any positional anchor meaningless.
//
// Status legend: todo | doing | done | partial.
//   `partial` is new in 1.11.94 and represents a row that shipped some
//   of the deliverables but deferred the rest -- matches the manual
//   convention already used in autonomous-queue-v10.md (see 11.72).

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_STATUSES = Object.freeze(['todo', 'doing', 'done', 'partial']);
const STATUS_SET = new Set(VALID_STATUSES);
const DEFAULT_HEADER = '| # | Task | Status | Detail |';
const DEFAULT_SEPARATOR = '|---|------|--------|--------|';
const RELATIVE_PATH = path.join('docs', 'autonomous-queue-v10.md');

function isTableLine(line) {
  return typeof line === 'string' && line.startsWith('|');
}

function isSeparatorLine(line) {
  if (!isTableLine(line)) return false;
  return /^\|\s*-+/.test(line.trim());
}

function splitCells(line) {
  // Markdown table cells; the leading + trailing `|` produce empty
  // segments which slice() trims. We do NOT honour `\|` escapes because
  // the current canonical doc has none and adding that machinery would
  // mostly just bury bugs.
  return line.trim().split('|').slice(1, -1).map((c) => c.trim());
}

function normaliseStatus(raw) {
  if (typeof raw !== 'string') return 'todo';
  const lower = raw.trim().toLowerCase();
  return STATUS_SET.has(lower) ? lower : 'todo';
}

// parseQueue(content) -> {
//   rows: [{ id, title, status, detail }],
//   preamble, header, separator, interlude, postamble,
//   trailingNewline: boolean,
// }
//
// Pure -- accepts a string, returns a structured snapshot. Survives a
// file with no table block at all (returns empty rows + the original
// content as preamble) so the UI never sees a parser exception.
function parseQueue(content) {
  const text = typeof content === 'string' ? content : '';
  const trailingNewline = text.endsWith('\n');
  const stripped = trailingNewline ? text.slice(0, -1) : text;
  const lines = stripped.split('\n');

  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isTableLine(lines[i])) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
  }

  if (firstIdx === -1) {
    return {
      rows: [],
      preamble: stripped,
      header: DEFAULT_HEADER,
      separator: DEFAULT_SEPARATOR,
      interlude: '',
      postamble: '',
      trailingNewline,
    };
  }

  const preambleLines = lines.slice(0, firstIdx);
  const postambleLines = lines.slice(lastIdx + 1);
  const tableLines = lines.slice(firstIdx, lastIdx + 1);

  let header = DEFAULT_HEADER;
  let separator = DEFAULT_SEPARATOR;
  const rows = [];
  const interludeLines = [];

  let cursor = 0;
  if (cursor < tableLines.length) {
    header = tableLines[cursor];
    cursor++;
  }
  if (cursor < tableLines.length && isSeparatorLine(tableLines[cursor])) {
    separator = tableLines[cursor];
    cursor++;
  }

  for (; cursor < tableLines.length; cursor++) {
    const line = tableLines[cursor];
    if (isTableLine(line)) {
      const cells = splitCells(line);
      if (cells.length < 4) continue;
      const [id, title, status, ...rest] = cells;
      // Skip an embedded header line (id === '#') in case someone left
      // an artifact behind; also skip an extra separator.
      if (!id || id === '#') continue;
      if (isSeparatorLine(line)) continue;
      const detail = rest.join(' | ').trim();
      rows.push({
        id,
        title: title || '',
        status: normaliseStatus(status),
        detail,
      });
    } else {
      interludeLines.push(line);
    }
  }

  const preamble = preambleLines.join('\n');
  const postamble = postambleLines.join('\n');
  const interlude = interludeLines.join('\n');

  return {
    rows,
    preamble,
    header,
    separator,
    interlude,
    postamble,
    trailingNewline,
  };
}

// stripCellPipes(s) -> string. Replaces literal `|` with `/` so the
// emitted row stays parseable. We don't use the standard `\|` escape
// because not every markdown renderer honours it and the round-trip
// would round through plain `|` anyway.
function stripCellPipes(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}

function formatRow(row) {
  const id = stripCellPipes(row.id);
  const title = stripCellPipes(row.title);
  const status = normaliseStatus(row.status);
  const detail = stripCellPipes(row.detail || '');
  return `| ${id} | ${title} | ${status} | ${detail} |`;
}

// serializeQueue(snapshot, newRows) -> string. snapshot is the object
// returned by parseQueue; newRows is the user-supplied array which
// becomes the new table body in order. We never touch preamble /
// postamble, only the rows + the interlude land between them.
function serializeQueue(snapshot, newRows) {
  const parts = [];
  if (snapshot.preamble) parts.push(snapshot.preamble);
  parts.push(snapshot.header || DEFAULT_HEADER);
  parts.push(snapshot.separator || DEFAULT_SEPARATOR);
  for (const row of newRows) parts.push(formatRow(row));
  if (snapshot.interlude) parts.push(snapshot.interlude);
  if (snapshot.postamble) parts.push(snapshot.postamble);
  let out = parts.join('\n');
  if (snapshot.trailingNewline && !out.endsWith('\n')) out += '\n';
  return out;
}

// validateRows(rows) -> { valid, errors }. errors is an array of
// strings -- one per fault -- so the caller can return them all in a
// single 400 instead of trickling failures.
function validateRows(rows) {
  const errors = [];
  if (!Array.isArray(rows)) {
    return { valid: false, errors: ['rows: expected array'] };
  }
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') {
      errors.push(`rows[${i}]: expected object`);
      continue;
    }
    if (typeof row.id !== 'string' || row.id.trim() === '') {
      errors.push(`rows[${i}].id: required string`);
    } else if (seen.has(row.id.trim())) {
      errors.push(`rows[${i}].id: duplicate '${row.id.trim()}'`);
    } else {
      seen.add(row.id.trim());
    }
    if (typeof row.title !== 'string') {
      errors.push(`rows[${i}].title: required string`);
    }
    if (typeof row.status !== 'string' || !STATUS_SET.has(row.status.toLowerCase())) {
      errors.push(`rows[${i}].status: must be one of ${VALID_STATUSES.join(' | ')}`);
    }
    if (row.detail !== undefined && row.detail !== null && typeof row.detail !== 'string') {
      errors.push(`rows[${i}].detail: must be string when present`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// writeAtomic(filePath, content) -> void. Stages to a sibling tmp file
// then renames into place so a half-written queue never lands on disk.
// Honours an optional injected fs for tests.
function writeAtomic(filePath, content, options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const tmpDir = opts.tmpDir || os.tmpdir();
  const base = path.basename(filePath);
  const tmpPath = path.join(tmpDir, `${base}.${process.pid}.${Date.now()}.tmp`);
  fsModule.writeFileSync(tmpPath, content, 'utf8');
  try {
    fsModule.renameSync(tmpPath, filePath);
  } catch (e) {
    // Cross-device rename can fail on tmpfs setups -- fall back to copy
    // + unlink so the write still completes atomically from the
    // reader's perspective on the final path.
    if (e && e.code === 'EXDEV') {
      fsModule.copyFileSync(tmpPath, filePath);
      try { fsModule.unlinkSync(tmpPath); } catch { /* best effort */ }
    } else {
      try { fsModule.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw e;
    }
  }
  return { tmpPath, finalPath: filePath };
}

function resolveQueuePath(repoRoot) {
  return path.join(repoRoot, RELATIVE_PATH);
}

// handleGetQueueRequest({ repoRoot, fs? }) -> { status, body }
//
// Pure -- mirrors the daemon's GET /api/autonomous/queue handler so the
// test suite can exercise the contract without spinning up the full
// daemon. The daemon route does the actual fs.readFileSync + writeHead;
// this function decides the response shape.
function handleGetQueueRequest(options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const repoRoot = opts.repoRoot;
  if (!repoRoot) {
    return { status: 500, body: { error: 'repoRoot required' } };
  }
  const queuePath = resolveQueuePath(repoRoot);
  let content = '';
  try {
    content = fsModule.readFileSync(queuePath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return {
        status: 200,
        body: {
          rows: [],
          raw: '',
          source: RELATIVE_PATH,
          notFound: true,
        },
      };
    }
    return {
      status: 500,
      body: { error: 'failed to read autonomous queue: ' + e.message },
    };
  }
  const snapshot = parseQueue(content);
  return {
    status: 200,
    body: {
      rows: snapshot.rows,
      raw: content,
      source: RELATIVE_PATH,
    },
  };
}

// handlePostQueueRequest({ repoRoot, body, fs?, audit?, actor? })
// -> { status, body }
//
// Body shape: { rows: [{ id, title, status, detail }, ...] }. Returns
// 400 for malformed bodies, 500 for fs errors, 200 on success. Writes
// docs/autonomous-queue-v10.md atomically when validation passes.
// audit is an optional `(type, details) => void` hook; the daemon
// passes _safeAudit so editor activity hits the shared audit trail.
function handlePostQueueRequest(options) {
  const opts = options || {};
  const fsModule = opts.fs || fs;
  const repoRoot = opts.repoRoot;
  const body = opts.body;
  if (!repoRoot) {
    return { status: 500, body: { error: 'repoRoot required' } };
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.rows)) {
    return { status: 400, body: { error: 'rows: required array' } };
  }
  const validation = validateRows(body.rows);
  if (!validation.valid) {
    return {
      status: 400,
      body: { error: 'validation failed', details: validation.errors },
    };
  }
  const queuePath = resolveQueuePath(repoRoot);
  let prevContent = '';
  try {
    prevContent = fsModule.readFileSync(queuePath, 'utf8');
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) {
      return {
        status: 500,
        body: { error: 'failed to read autonomous queue: ' + e.message },
      };
    }
  }
  const snapshot = parseQueue(prevContent);
  const normalisedRows = body.rows.map((r) => ({
    id: String(r.id).trim(),
    title: typeof r.title === 'string' ? r.title : '',
    status: String(r.status).toLowerCase(),
    detail: typeof r.detail === 'string' ? r.detail : '',
  }));
  const nextContent = serializeQueue(snapshot, normalisedRows);
  try {
    writeAtomic(queuePath, nextContent, { fs: fsModule, tmpDir: opts.tmpDir });
  } catch (e) {
    return {
      status: 500,
      body: { error: 'failed to write autonomous queue: ' + e.message },
    };
  }
  if (typeof opts.audit === 'function') {
    try {
      opts.audit('autonomous.queue.write', {
        actor: opts.actor || 'system',
        path: RELATIVE_PATH,
        rowCount: normalisedRows.length,
      });
    } catch { /* best effort */ }
  }
  return {
    status: 200,
    body: {
      ok: true,
      rows: normalisedRows,
      raw: nextContent,
      source: RELATIVE_PATH,
    },
  };
}

module.exports = {
  VALID_STATUSES,
  DEFAULT_HEADER,
  DEFAULT_SEPARATOR,
  RELATIVE_PATH,
  parseQueue,
  serializeQueue,
  validateRows,
  writeAtomic,
  formatRow,
  stripCellPipes,
  resolveQueuePath,
  handleGetQueueRequest,
  handlePostQueueRequest,
};
