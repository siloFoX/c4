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

module.exports = {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  validateTemplate,
  isValidName,
  VALID_TRACKS,
  VALID_BRAINS,
  DEFAULT_TEMPLATES_PATH,
};
