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

  // -- targets (custom remote/local target definitions)
  for (const [name, t] of Object.entries(config.targets || {})) {
    if (!t || typeof t !== 'object') {
      errors.push({ path: `targets.${name}`, message: 'must be an object' });
      continue;
    }
    if (t.type && !['local', 'ssh'].includes(t.type)) {
      errors.push({ path: `targets.${name}.type`, message: `must be 'local' or 'ssh', got '${t.type}'` });
    }
    if (t.type === 'ssh') {
      if (!t.host) {
        errors.push({ path: `targets.${name}.host`, message: "ssh target requires 'host'" });
      }
    }
  }

  // -- riskClassifier.* (v1.10.49): same typo-guard pattern as openapi.
  // enabled=true with autoDenyLevel='high' is the L4 production setting
  // — flag misspelt levels here so the daemon doesn't silently fall back
  // to 'critical' (the safe default).
  if (config.riskClassifier && typeof config.riskClassifier === 'object') {
    const KNOWN_RISK_KEYS = new Set([
      'enabled',
      'dryRun',
      'autoDenyLevel',
      'notifySlack',
      'allowList',
      'denyList',
      'customRules',
    ]);
    const BOOL_KEYS = new Set(['enabled', 'dryRun', 'notifySlack']);
    for (const [k, v] of Object.entries(config.riskClassifier)) {
      if (k.startsWith('_') && k.endsWith('_doc')) continue;
      if (!KNOWN_RISK_KEYS.has(k)) {
        warnings.push({
          path: `riskClassifier.${k}`,
          message: `unknown riskClassifier key — known: ${[...KNOWN_RISK_KEYS].join(', ')}`,
        });
        continue;
      }
      if (k === 'autoDenyLevel') {
        if (typeof v !== 'string' || !['low', 'medium', 'high', 'critical'].includes(v)) {
          errors.push({
            path: 'riskClassifier.autoDenyLevel',
            message: `must be one of low|medium|high|critical, got ${JSON.stringify(v)}`,
          });
        }
        continue;
      }
      if (BOOL_KEYS.has(k)) {
        if (typeof v !== 'boolean') {
          errors.push({
            path: `riskClassifier.${k}`,
            message: `must be a boolean, got ${typeof v}`,
          });
        }
        continue;
      }
      if (k === 'allowList' || k === 'denyList') {
        if (!Array.isArray(v)) {
          errors.push({
            path: `riskClassifier.${k}`,
            message: `must be an array of regex strings or {pattern, flags} objects, got ${typeof v}`,
          });
          continue;
        }
        for (let i = 0; i < v.length; i++) {
          const entry = v[i];
          if (typeof entry === 'string') {
            try { new RegExp(entry); }
            catch (e) {
              errors.push({
                path: `riskClassifier.${k}[${i}]`,
                message: `invalid regex: ${e.message}`,
              });
            }
          } else if (entry && typeof entry === 'object' && typeof entry.pattern === 'string') {
            try { new RegExp(entry.pattern, entry.flags || ''); }
            catch (e) {
              errors.push({
                path: `riskClassifier.${k}[${i}].pattern`,
                message: `invalid regex: ${e.message}`,
              });
            }
          } else {
            errors.push({
              path: `riskClassifier.${k}[${i}]`,
              message: 'must be a regex string or {pattern, flags?} object',
            });
          }
        }
        continue;
      }
      if (k === 'customRules') {
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
          errors.push({
            path: 'riskClassifier.customRules',
            message: 'must be an object keyed by tier (critical | high | medium)',
          });
          continue;
        }
        for (const tier of Object.keys(v)) {
          if (!['critical', 'high', 'medium'].includes(tier)) {
            warnings.push({
              path: `riskClassifier.customRules.${tier}`,
              message: 'unknown tier — known: critical, high, medium',
            });
            continue;
          }
          const rules = v[tier];
          if (!Array.isArray(rules)) {
            errors.push({
              path: `riskClassifier.customRules.${tier}`,
              message: `must be an array of {code, label, pattern, flags?} rules, got ${typeof rules}`,
            });
            continue;
          }
          for (let i = 0; i < rules.length; i++) {
            const r = rules[i];
            const base = `riskClassifier.customRules.${tier}[${i}]`;
            if (!r || typeof r !== 'object') {
              errors.push({ path: base, message: 'must be an object' });
              continue;
            }
            if (typeof r.code !== 'string' || !r.code) {
              errors.push({ path: `${base}.code`, message: 'required string' });
            }
            if (typeof r.label !== 'string' || !r.label) {
              errors.push({ path: `${base}.label`, message: 'required string' });
            }
            if (typeof r.pattern !== 'string' || !r.pattern) {
              errors.push({ path: `${base}.pattern`, message: 'required regex source string' });
            } else {
              try { new RegExp(r.pattern, r.flags || ''); }
              catch (e) {
                errors.push({ path: `${base}.pattern`, message: `invalid regex: ${e.message}` });
              }
            }
          }
        }
      }
    }
  }

  // -- openapi.* (v1.10.43): catch typos before they silently no-op.
  // Fields that look like booleans get a type check; unknown sibling
  // keys get a warning so `validateRequsts: true` (typo) doesn't sit
  // there as a dormant flag forever.
  if (config.openapi && typeof config.openapi === 'object') {
    const KNOWN_OPENAPI_KEYS = new Set([
      'validateRequests',
      'validateResponses',
      // _doc-suffix keys are sibling annotations from config.example.json
      // — keep them legal so users can paste the example verbatim.
    ]);
    for (const [k, v] of Object.entries(config.openapi)) {
      if (k.startsWith('_') && k.endsWith('_doc')) continue;
      if (!KNOWN_OPENAPI_KEYS.has(k)) {
        warnings.push({
          path: `openapi.${k}`,
          message: `unknown openapi key — known: ${[...KNOWN_OPENAPI_KEYS].join(', ')}`,
        });
        continue;
      }
      if (typeof v !== 'boolean') {
        errors.push({
          path: `openapi.${k}`,
          message: `must be a boolean, got ${typeof v}`,
        });
      }
    }
  }

  // -- fleet.peers
  for (const [name, peer] of Object.entries((config.fleet && config.fleet.peers) || {})) {
    if (!peer || typeof peer !== 'object') {
      errors.push({ path: `fleet.peers.${name}`, message: 'must be an object' });
      continue;
    }
    if (!peer.host && !peer.url) {
      warnings.push({
        path: `fleet.peers.${name}`,
        message: 'no host/url — peer is unreachable',
      });
    }
    if (peer.port != null && (typeof peer.port !== 'number' || peer.port < 1 || peer.port > 65535)) {
      errors.push({ path: `fleet.peers.${name}.port`, message: 'must be 1-65535' });
    }
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
