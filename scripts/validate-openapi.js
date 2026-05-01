#!/usr/bin/env node
'use strict';

// Lightweight OpenAPI 3.0 spec linter — runs the auto-generated spec
// through structural sanity checks without pulling in a full validator
// dependency. Designed to be cheap enough to call from CI / pre-commit
// hooks (no network, no large parser).
//
// Checks:
//   1. Required top-level fields (openapi, info, paths)
//   2. info.title + info.version are non-empty strings
//   3. Every path entry has at least one HTTP method operation
//   4. Every operation has a summary + responses
//   5. Every response code key matches HTTP status (3 digits or 'default')
//   6. requestBody.content keys are mime types
//   7. parameters[].in matches the OpenAPI enum
//   8. No duplicate operationIds (warn, not error)
//
// Exit code 0 = clean, 1 = errors found, 2 = warnings only.

const path = require('path');
const { buildSpec } = require(path.join(__dirname, '..', 'src', 'openapi-gen'));

function lint(spec) {
  const errors = [];
  const warnings = [];

  // 1. Required top-level fields
  if (!spec.openapi) errors.push('missing top-level "openapi"');
  else if (!/^3\./.test(spec.openapi)) warnings.push(`unexpected openapi version: ${spec.openapi}`);
  if (!spec.info) errors.push('missing top-level "info"');
  if (!spec.paths || typeof spec.paths !== 'object') errors.push('missing top-level "paths"');

  // 2. info shape
  if (spec.info) {
    if (!spec.info.title || typeof spec.info.title !== 'string') errors.push('info.title missing');
    if (!spec.info.version) errors.push('info.version missing');
  }

  // 3-7. Walk paths
  const validIn = new Set(['query', 'header', 'path', 'cookie']);
  const validMethods = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace']);
  const opIdSeen = new Map();
  let opCount = 0;

  for (const [pathKey, ops] of Object.entries(spec.paths || {})) {
    if (typeof ops !== 'object' || ops === null) {
      errors.push(`path ${pathKey}: not an object`);
      continue;
    }
    const methods = Object.keys(ops).filter((k) => validMethods.has(k));
    if (methods.length === 0) {
      errors.push(`path ${pathKey}: no HTTP method operations`);
      continue;
    }
    for (const method of methods) {
      const op = ops[method];
      opCount++;

      // 4. summary + responses
      if (!op.summary || typeof op.summary !== 'string') {
        errors.push(`${method.toUpperCase()} ${pathKey}: missing summary`);
      }
      if (!op.responses || typeof op.responses !== 'object') {
        errors.push(`${method.toUpperCase()} ${pathKey}: missing responses`);
      } else {
        // 5. response code keys
        for (const code of Object.keys(op.responses)) {
          if (code !== 'default' && !/^\d{3}$/.test(code)) {
            errors.push(`${method.toUpperCase()} ${pathKey}: bad response code "${code}"`);
          }
        }
      }

      // 6. requestBody.content
      if (op.requestBody) {
        if (!op.requestBody.content || typeof op.requestBody.content !== 'object') {
          errors.push(`${method.toUpperCase()} ${pathKey}: requestBody.content missing`);
        } else {
          for (const mime of Object.keys(op.requestBody.content)) {
            if (!/^[\w-]+\/[\w.+-]+$/.test(mime)) {
              errors.push(`${method.toUpperCase()} ${pathKey}: bad content mime "${mime}"`);
            }
          }
        }
      }

      // 7. parameters[].in
      if (op.parameters && Array.isArray(op.parameters)) {
        for (const p of op.parameters) {
          if (!p.name) errors.push(`${method.toUpperCase()} ${pathKey}: parameter without name`);
          if (!validIn.has(p.in)) errors.push(`${method.toUpperCase()} ${pathKey}: parameter ${p.name} bad "in": ${p.in}`);
        }
      }

      // 8. operationId uniqueness
      if (op.operationId) {
        if (opIdSeen.has(op.operationId)) {
          warnings.push(`duplicate operationId "${op.operationId}" (${method.toUpperCase()} ${pathKey})`);
        }
        opIdSeen.set(op.operationId, `${method.toUpperCase()} ${pathKey}`);
      }
    }
  }

  return { errors, warnings, opCount };
}

if (require.main === module) {
  const spec = buildSpec();
  const { errors, warnings, opCount } = lint(spec);

  console.log(`OpenAPI spec: ${Object.keys(spec.paths || {}).length} paths, ${opCount} operations`);
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)`);

  if (errors.length) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  ✗ ${e}`);
  }
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  if (errors.length) process.exit(1);
  if (warnings.length) process.exit(2);
  console.log('\nSpec lint clean.');
  process.exit(0);
}

module.exports = { lint };
