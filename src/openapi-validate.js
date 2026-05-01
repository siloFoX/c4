'use strict';

// Tiny JSON Schema validator covering the subset that
// `openapi-gen.ROUTE_SCHEMAS` actually emits. Pure-node, zero deps.
// Not a full draft-07 validator — supports:
//   - type: string | integer | number | boolean | array | object
//   - required: [<key>, ...]
//   - properties: {<key>: <schema>}
//   - items: <schema> (for type: array)
//   - enum: [...] (string or number unions)
//   - nullable: true (allows null in addition to the typed branch)
//
// Each call returns `{ valid: boolean, errors: string[] }` where
// errors are dotted-path strings like `body.user: required` or
// `body.role: not in enum [admin, manager, viewer]`.

const PRIMS = new Set(['string', 'integer', 'number', 'boolean']);

function _typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function _validate(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return; // no schema → no constraint

  // Nullable: allow null without further checks.
  if (value === null) {
    if (schema.nullable) return;
    if (PRIMS.has(schema.type) || schema.type === 'object' || schema.type === 'array') {
      errors.push(`${path}: expected ${schema.type}, got null`);
      return;
    }
  }

  // Enum first — wins over type when present (a literal-union schema
  // is still type-typed for validators that don't grok enum).
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      errors.push(`${path}: not in enum [${schema.enum.map((v) => JSON.stringify(v)).join(', ')}]`);
      return;
    }
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string, got ${_typeOf(value)}`);
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        errors.push(`${path}: expected integer, got ${_typeOf(value)}`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected number, got ${_typeOf(value)}`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${_typeOf(value)}`);
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${_typeOf(value)}`);
        break;
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          _validate(schema.items, value[i], `${path}[${i}]`, errors);
        }
      }
      break;
    case 'object':
    case undefined:
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        // Skip the check when no `type: object` is declared and the
        // schema only carries `enum`/`required` — we already handled
        // enum above. Re-emit the type error when type was explicit.
        if (schema.type === 'object') {
          errors.push(`${path}: expected object, got ${_typeOf(value)}`);
        }
        break;
      }
      if (Array.isArray(schema.required)) {
        for (const key of schema.required) {
          if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) {
            errors.push(`${path}.${key}: required`);
          }
        }
      }
      if (schema.properties) {
        for (const [k, sub] of Object.entries(schema.properties)) {
          if (Object.prototype.hasOwnProperty.call(value, k) && value[k] !== undefined) {
            _validate(sub, value[k], `${path}.${k}`, errors);
          }
        }
      }
      break;
  }
}

function validate(schema, value, root) {
  const errors = [];
  _validate(schema, value, root || 'body', errors);
  return { valid: errors.length === 0, errors };
}

// Look up the requestBody schema for a (method, path) and validate
// the parsed body. Returns the same `{valid, errors}` shape; when
// no schema exists for the route, returns `{valid: true, errors: []}`
// so callers can short-circuit.
function validateRequestBody(method, route, body, ROUTE_SCHEMAS) {
  if (!ROUTE_SCHEMAS) return { valid: true, errors: [] };
  const key = `${method} ${route}`;
  const schemas = ROUTE_SCHEMAS[key];
  if (!schemas || !schemas.requestBody) return { valid: true, errors: [] };
  // ROUTE_SCHEMAS stores body schema directly under `requestBody`
  // (without the OpenAPI mediaType envelope) — see openapi-gen.js
  // buildSpec where it wraps these into content.application/json.schema.
  const schema = { type: 'object', ...schemas.requestBody };
  return validate(schema, body, 'body');
}

module.exports = { validate, validateRequestBody };
