// 9.5 Claude Code plugin command — /c4-new
// Receives the slash-command argv from Claude Code and calls c4 daemon
// via the SDK. Output is the JSON body Claude renders inline.

'use strict';

const { create } = require('../../src/sdk');

module.exports = async function (args, ctx = {}) {
  const name = (args && args[0]) || '';
  if (!name) return { error: 'Usage: /c4-new <name>' };
  const cfg = (ctx && ctx.config && ctx.config.daemon) || {};
  const c4 = create({ host: cfg.host, port: cfg.port });
  return c4.create(name);
};
