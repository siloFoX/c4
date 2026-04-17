'use strict';

// Tiny argv parser for the plugin CLI entry points. Not a general-purpose
// parser - just what the five c4 slash commands need:
//   - positional args indexed into `_`
//   - --flag / --flag=value / --flag value long options
//   - repeated flags coalesce into the last value
//
// The handler modules accept `args` directly, so tests bypass this parser
// entirely and construct `args` objects by hand.

function parseArgv(argv, opts = {}) {
  const positional = Array.isArray(opts.positional) ? opts.positional : [];
  const boolFlags = new Set(Array.isArray(opts.boolFlags) ? opts.boolFlags : []);
  const out = { _: [] };

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (typeof tok !== 'string') continue;
    if (tok === '--') {
      for (let j = i + 1; j < argv.length; j++) out._.push(argv[j]);
      break;
    }
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const key = eq >= 0 ? tok.slice(2, eq) : tok.slice(2);
      if (!key) continue;
      if (eq >= 0) {
        out[key] = tok.slice(eq + 1);
      } else if (boolFlags.has(key)) {
        out[key] = true;
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !(typeof next === 'string' && next.startsWith('--'))) {
          out[key] = next;
          i++;
        } else {
          out[key] = true;
        }
      }
    } else {
      out._.push(tok);
    }
  }

  for (let i = 0; i < positional.length; i++) {
    const name = positional[i];
    if (out[name] === undefined && out._[i] !== undefined) {
      out[name] = out._[i];
    }
  }

  return out;
}

module.exports = { parseArgv };
