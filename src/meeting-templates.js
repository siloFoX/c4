'use strict';

// Meeting templates (Phase 8.1 of multi-specialist system).
//
// Persisted at ~/.c4/meeting-templates.json (configurable). Each
// template carries enough context to spawn a meeting in one
// click — a name, a task description (which the dispatcher's
// keyword scorer uses), an optional track override, and an
// optional default brain/track preference. Operators define
// templates once for recurring patterns ("rotate-secret",
// "add-endpoint", "rename-column") and reuse them via
// `c4 meeting create --template <name>` or the web UI's
// new-meeting composer.
//
// Out of scope for this slice: parameterized templates (mustache
// variables), template versioning, and team-wide template
// repositories. Phase 8.2 may revisit if the user asks.

const fs = require('fs');
const path = require('path');

const DEFAULT_TEMPLATES_PATH = path.join(process.env.HOME || '/tmp', '.c4', 'meeting-templates.json');

const VALID_TRACKS = Object.freeze(['lightweight', 'standard', 'full']);
const VALID_BRAINS = Object.freeze(['mock', 'claude']);

function _ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// Reasonable kebab-only id with no ambiguity. Templates are
// addressed by name in URLs, so we keep them URL-safe.
function isValidName(name) {
  return typeof name === 'string'
    && name.length > 0
    && name.length <= 64
    && /^[a-z0-9][a-z0-9-]*[a-z0-9]?$/.test(name);
}

function validateTemplate(tpl) {
  if (!tpl || typeof tpl !== 'object') {
    throw new Error('template must be an object');
  }
  if (!isValidName(tpl.name)) {
    throw new Error(`template.name must be lowercase-kebab (got ${JSON.stringify(tpl.name)})`);
  }
  if (typeof tpl.task !== 'string' || tpl.task.trim().length === 0) {
    throw new Error('template.task must be a non-empty string');
  }
  if (tpl.track !== undefined && tpl.track !== null && !VALID_TRACKS.includes(tpl.track)) {
    throw new Error(`template.track must be one of ${VALID_TRACKS.join('|')}`);
  }
  if (tpl.brain !== undefined && tpl.brain !== null && !VALID_BRAINS.includes(tpl.brain)) {
    throw new Error(`template.brain must be one of ${VALID_BRAINS.join('|')}`);
  }
  if (tpl.description !== undefined && typeof tpl.description !== 'string') {
    throw new Error('template.description must be a string when set');
  }
  if (tpl.notes !== undefined && typeof tpl.notes !== 'string') {
    throw new Error('template.notes must be a string when set');
  }
  return true;
}

function _read(templatesPath) {
  let raw;
  try { raw = fs.readFileSync(templatesPath, 'utf8'); }
  catch (err) {
    if (err && err.code === 'ENOENT') return { templates: [] };
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) {
    process.stderr.write(`[meeting-templates] parse failed at ${templatesPath}: ${err.message}\n`);
    return { templates: [] };
  }
  return parsed && Array.isArray(parsed.templates) ? parsed : { templates: [] };
}

function _write(templatesPath, doc) {
  _ensureDir(templatesPath);
  const out = {
    version: 1,
    savedAt: new Date().toISOString(),
    templates: doc.templates || [],
  };
  fs.writeFileSync(templatesPath, JSON.stringify(out, null, 2) + '\n');
}

function listTemplates(opts = {}) {
  const templatesPath = opts.templatesPath || DEFAULT_TEMPLATES_PATH;
  const doc = _read(templatesPath);
  return doc.templates.slice();
}

function getTemplate(name, opts = {}) {
  const list = listTemplates(opts);
  return list.find((t) => t.name === name) || null;
}

function saveTemplate(template, opts = {}) {
  validateTemplate(template);
  const templatesPath = opts.templatesPath || DEFAULT_TEMPLATES_PATH;
  const doc = _read(templatesPath);
  const idx = doc.templates.findIndex((t) => t.name === template.name);
  const stamped = {
    ...template,
    createdAt: idx >= 0 ? doc.templates[idx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) doc.templates[idx] = stamped;
  else doc.templates.push(stamped);
  _write(templatesPath, doc);
  return stamped;
}

function deleteTemplate(name, opts = {}) {
  const templatesPath = opts.templatesPath || DEFAULT_TEMPLATES_PATH;
  const doc = _read(templatesPath);
  const idx = doc.templates.findIndex((t) => t.name === name);
  if (idx < 0) return false;
  doc.templates.splice(idx, 1);
  _write(templatesPath, doc);
  return true;
}

// (Phase 8.4) Mustache-light variable substitution. Templates can
// embed `{{var}}` placeholders in their `task` body; callers supply
// `vars: {var: 'value'}` to expand them. We deliberately keep this
// minimal — no helpers, no nesting, no escape syntax. Variables
// that don't appear in `vars` are flagged in `missing` so the
// caller can decide whether to error.
//
// Returns { task, missing: string[], replaced: string[] }.
function expandVars(text, vars) {
  if (typeof text !== 'string') return { task: text, missing: [], replaced: [] };
  const provided = (vars && typeof vars === 'object') ? vars : {};
  const missing = new Set();
  const replaced = new Set();
  const task = text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(provided, name)) {
      replaced.add(name);
      return String(provided[name]);
    }
    missing.add(name);
    return _;
  });
  return {
    task,
    missing: [...missing],
    replaced: [...replaced],
  };
}

// Walk a template body to find every `{{var}}` placeholder name —
// useful for surfacing the contract to the operator before they
// run the template (web UI form generation, CLI prompt).
function extractVarNames(text) {
  if (typeof text !== 'string') return [];
  const out = new Set();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

module.exports = {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  validateTemplate,
  expandVars,
  extractVarNames,
  isValidName,
  VALID_TRACKS,
  VALID_BRAINS,
  DEFAULT_TEMPLATES_PATH,
};
