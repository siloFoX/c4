'use strict';

const { create } = require('../../src/sdk');

module.exports = async function (args, ctx = {}) {
  const name = (args && args[0]) || '';
  if (!name) return { error: 'Usage: /c4-read <name>' };
  const cfg = (ctx && ctx.config && ctx.config.daemon) || {};
  const c4 = create({ host: cfg.host, port: cfg.port });
  return c4.readNow(name);
};
