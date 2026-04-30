// Config validator (TODO #113).
//
// Surface configuration issues as soon as the daemon starts (warnings)
// or as a `c4 config validate` exit-code-bearing run. Errors fall into
// three categories:
//
//   - error:   broken state — references that won't resolve, malformed
//              types. The daemon may still start but features keyed to
//              the broken section are dead.
//   - warning: working but suspicious — e.g. enabled auth without a
//              stable secret, unused fields.
//   - info:    informational hints (file paths that don't exist yet,
//              etc.)

'use strict';

const fs = require('fs');
const path = require('path');

const ROLES = new Set(['viewer', 'manager', 'admin']);

/**
 * Walk a config object and return { errors, warnings, info } entries.
 * Each entry is `{ path: '<dotted path>', message: '<human-readable>' }`.
 */
function validate(config = {}) {
  const errors = [];
  const warnings = [];
  const info = [];

  // -- daemon.port
  const port = config.daemon && config.daemon.port;
  if (port != null && (typeof port !== 'number' || port < 1 || port > 65535)) {
    errors.push({ path: 'daemon.port', message: `must be 1-65535, got ${JSON.stringify(port)}` });
  }

  // -- auth: enabled requires a stable secret
  if (config.auth && config.auth.enabled) {
    const secret = config.auth.secret;
    if (typeof secret !== 'string' || secret.length < 16) {
      warnings.push({
        path: 'auth.secret',
        message: 'auth.enabled=true but secret is missing or shorter than 16 chars; daemon will use an ephemeral secret',
      });
    }
    const users = config.auth.users || {};
    if (Object.keys(users).length === 0) {
      warnings.push({
        path: 'auth.users',
        message: 'auth.enabled=true but no users configured — every request will return 401',
      });
    }
    for (const [name, u] of Object.entries(users)) {
      if (u && u.role && !ROLES.has(u.role)) {
        errors.push({
          path: `auth.users.${name}.role`,
          message: `unknown role '${u.role}'; expected one of viewer/manager/admin`,
        });
      }
      if (u && Array.isArray(u.projects)) {
        for (const p of u.projects) {
          if (!(config.projects && config.projects[p])) {
            warnings.push({
              path: `auth.users.${name}.projects`,
              message: `references undefined project '${p}'`,
            });
          }
        }
      }
    }
  }

  // -- workspaces (TODO #98)
  for (const [name, p] of Object.entries(config.workspaces || {})) {
    if (typeof p !== 'string' || !p) {
      warnings.push({ path: `workspaces.${name}`, message: 'path is empty or non-string — entry ignored' });
      continue;
    }
    if (!fs.existsSync(p)) {
      info.push({ path: `workspaces.${name}`, message: `path does not exist: ${p}` });
    } else if (!fs.existsSync(path.join(p, '.git'))) {
      info.push({ path: `workspaces.${name}`, message: `path exists but is not a git repo: ${p}` });
    }
  }

  // -- departments (TODO 8.3 / #100)
  const projectNames = new Set(Object.keys(config.projects || {}));
  for (const [name, dept] of Object.entries(config.departments || {})) {
    if (dept && Array.isArray(dept.projects)) {
      for (const p of dept.projects) {
        if (!projectNames.has(p)) {
          warnings.push({
            path: `departments.${name}.projects`,
            message: `references undefined project '${p}'`,
          });
        }
      }
    }
    if (dept && dept.workerQuota != null && (typeof dept.workerQuota !== 'number' || dept.workerQuota < 0)) {
      errors.push({
        path: `departments.${name}.workerQuota`,
        message: `must be a non-negative number, got ${JSON.stringify(dept.workerQuota)}`,
      });
    }
    if (dept && dept.monthlyBudgetUSD != null && (typeof dept.monthlyBudgetUSD !== 'number' || dept.monthlyBudgetUSD < 0)) {
      errors.push({
        path: `departments.${name}.monthlyBudgetUSD`,
        message: `must be a non-negative number, got ${JSON.stringify(dept.monthlyBudgetUSD)}`,
      });
    }
  }

  // -- projects (TODO 10.3)
  for (const [name, p] of Object.entries(config.projects || {})) {
    if (p && p.root && !fs.existsSync(p.root)) {
      info.push({ path: `projects.${name}.root`, message: `path does not exist: ${p.root}` });
    }
  }

  // -- audit (TODO #107)
  if (config.audit) {
    if (config.audit.maxSizeBytes != null && (typeof config.audit.maxSizeBytes !== 'number' || config.audit.maxSizeBytes < 0)) {
      errors.push({ path: 'audit.maxSizeBytes', message: 'must be a non-negative number' });
    }
    if (config.audit.keep != null && (typeof config.audit.keep !== 'number' || config.audit.keep < 0)) {
      errors.push({ path: 'audit.keep', message: 'must be a non-negative number' });
    }
  }

  // -- pool (3.4)
  if (config.pool && config.pool.enabled) {
    const ms = config.pool.maxIdleMs;
    if (ms != null && (typeof ms !== 'number' || ms < 1000)) {
      warnings.push({ path: 'pool.maxIdleMs', message: 'should be ≥1000ms; smaller values disable pooling in practice' });
    }
  }

  // -- pm board (10.8)
  if (config.pm && config.pm.todoSync) {
    if (!config.pm.todoFile) {
      warnings.push({ path: 'pm.todoSync', message: 'enabled without pm.todoFile — sync is a no-op' });
    } else if (!fs.existsSync(config.pm.todoFile)) {
      info.push({ path: 'pm.todoFile', message: `file does not exist: ${config.pm.todoFile}` });
    }
  }

  // -- nl.llm (TODO #104)
  if (config.nl && config.nl.llm && config.nl.llm.enabled) {
    if (!config.nl.llm.apiKey && !process.env.ANTHROPIC_API_KEY) {
      warnings.push({
        path: 'nl.llm.apiKey',
        message: 'nl.llm.enabled=true but no apiKey configured and ANTHROPIC_API_KEY env not set — fallback will skip silently',
      });
    }
  }

  // -- maxWorkers
  if (config.maxWorkers != null && (typeof config.maxWorkers !== 'number' || config.maxWorkers < 0)) {
    errors.push({ path: 'maxWorkers', message: 'must be a non-negative number' });
  }

  return { errors, warnings, info };
}

/**
 * Print a validation report to stdout/stderr. Returns true when there are
 * no errors so the caller can use it as an exit predicate.
 */
function printReport(report, { color = true } = {}) {
  const c = color
    ? { red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` }
    : { red: (s) => s, yellow: (s) => s, dim: (s) => s };
  for (const e of report.errors) {
    console.error(`${c.red('error  ')} ${e.path}: ${e.message}`);
  }
  for (const w of report.warnings) {
    console.error(`${c.yellow('warn   ')} ${w.path}: ${w.message}`);
  }
  for (const i of report.info) {
    console.error(`${c.dim('info   ')} ${i.path}: ${i.message}`);
  }
  const total = report.errors.length + report.warnings.length + report.info.length;
  if (total === 0) {
    console.log('Config OK — no issues found.');
  } else {
    console.error(c.dim(
      `\n${report.errors.length} error(s), ${report.warnings.length} warning(s), ${report.info.length} info`
    ));
  }
  return report.errors.length === 0;
}

module.exports = { validate, printReport };
