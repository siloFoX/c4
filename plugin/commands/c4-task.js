'use strict';

const { create } = require('../../src/sdk');

module.exports = async function (args, ctx = {}) {
  const name = (args && args[0]) || '';
  const task = (args || []).slice(1).join(' ').trim();
  if (!name || !task) return { error: 'Usage: /c4-task <name> <task...>' };
  const cfg = (ctx && ctx.config && ctx.config.daemon) || {};
  const c4 = create({ host: cfg.host, port: cfg.port });
  return c4.task(name, task);
};
