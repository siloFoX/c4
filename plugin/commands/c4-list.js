'use strict';

const { create } = require('../../src/sdk');

module.exports = async function (_args, ctx = {}) {
  const cfg = (ctx && ctx.config && ctx.config.daemon) || {};
  const c4 = create({ host: cfg.host, port: cfg.port });
  return c4.list();
};
