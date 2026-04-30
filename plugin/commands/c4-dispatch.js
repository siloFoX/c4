'use strict';

const { create } = require('../../src/sdk');

module.exports = async function (args, ctx = {}) {
  const task = (args || []).join(' ').trim();
  if (!task) return { error: 'Usage: /c4-dispatch <task...>' };
  const cfg = (ctx && ctx.config && ctx.config.daemon) || {};
  const c4 = create({ host: cfg.host, port: cfg.port });
  return c4.dispatch({ task });
};
