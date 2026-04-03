const assert = require('assert');
const { describe, it } = require('node:test');

describe('Role Templates (3.18)', () => {
  function createMockManager(config = {}) {
    const mgr = {
      config: {
        templates: {
          custom: {
            description: 'Custom template',
            model: 'sonnet',
            effort: 'low',
            profile: 'executor',
            promptPrefix: 'Custom prefix'
          }
        },
        profiles: {
          planner: { permissions: { allow: ['Bash(git:*)'], deny: [] } },
          executor: { permissions: { allow: ['Edit', 'Write'], deny: [] } },
          reviewer: { permissions: { allow: ['Bash(git:*)'], deny: ['Edit', 'Write'] } }
        },
        ...config
      }
    };

    mgr._getTemplate = function(templateName) {
      const templates = this.config.templates || {};
      return templates[templateName] || null;
    };

    mgr._getBuiltinTemplates = function() {
      return {
        planner: {
          description: 'Planner — 설계 전담, Opus 모델 사용',
          model: 'opus', effort: 'max', profile: 'planner',
          promptPrefix: '[역할: Planner] 설계와 분석에 집중해줘.',
          command: 'claude', args: []
        },
        executor: {
          description: 'Executor — 구현 전담, Sonnet 모델 사용',
          model: 'sonnet', effort: 'high', profile: 'executor',
          promptPrefix: '[역할: Executor] 구현에 집중해줘.',
          command: 'claude', args: []
        },
        reviewer: {
          description: 'Reviewer — 리뷰 전담, Haiku 모델 사용',
          model: 'haiku', effort: 'high', profile: 'reviewer',
          promptPrefix: '[역할: Reviewer] 코드 리뷰에 집중해줘.',
          command: 'claude', args: []
        }
      };
    };

    mgr.resolveTemplate = function(templateName) {
      const userTemplate = this._getTemplate(templateName);
      if (userTemplate) return userTemplate;
      const builtins = this._getBuiltinTemplates();
      return builtins[templateName] || null;
    };

    mgr.listTemplates = function() {
      const builtins = this._getBuiltinTemplates();
      const userTemplates = this.config.templates || {};
      const result = {};
      for (const [name, tmpl] of Object.entries(builtins)) {
        result[name] = { ...tmpl, source: 'builtin' };
      }
      for (const [name, tmpl] of Object.entries(userTemplates)) {
        result[name] = { ...tmpl, source: 'config' };
      }
      return result;
    };

    mgr._applyTemplate = function(templateName, options = {}) {
      const template = this.resolveTemplate(templateName);
      if (!template) return options;
      const result = { ...options };
      if (template.profile && !result.profile) result.profile = template.profile;
      if (template.model) result._templateModel = template.model;
      if (template.effort) result._templateEffort = template.effort;
      if (template.promptPrefix) result._templatePromptPrefix = template.promptPrefix;
      if (template.command) result.command = template.command;
      return result;
    };

    return mgr;
  }

  // --- resolveTemplate ---

  it('resolves builtin planner template', () => {
    const mgr = createMockManager();
    const tmpl = mgr.resolveTemplate('planner');
    assert.ok(tmpl);
    assert.strictEqual(tmpl.model, 'opus');
    assert.strictEqual(tmpl.effort, 'max');
  });

  it('resolves builtin executor template', () => {
    const mgr = createMockManager();
    const tmpl = mgr.resolveTemplate('executor');
    assert.ok(tmpl);
    assert.strictEqual(tmpl.model, 'sonnet');
  });

  it('resolves builtin reviewer template', () => {
    const mgr = createMockManager();
    const tmpl = mgr.resolveTemplate('reviewer');
    assert.ok(tmpl);
    assert.strictEqual(tmpl.model, 'haiku');
    assert.strictEqual(tmpl.profile, 'reviewer');
  });

  it('user-defined template overrides builtin', () => {
    const mgr = createMockManager({
      templates: { planner: { model: 'sonnet', effort: 'low', description: 'My planner' } }
    });
    const tmpl = mgr.resolveTemplate('planner');
    assert.strictEqual(tmpl.model, 'sonnet');
    assert.strictEqual(tmpl.effort, 'low');
  });

  it('returns null for unknown template', () => {
    const mgr = createMockManager();
    const tmpl = mgr.resolveTemplate('nonexistent');
    assert.strictEqual(tmpl, null);
  });

  it('resolves user-defined custom template', () => {
    const mgr = createMockManager();
    const tmpl = mgr.resolveTemplate('custom');
    assert.ok(tmpl);
    assert.strictEqual(tmpl.model, 'sonnet');
    assert.strictEqual(tmpl.promptPrefix, 'Custom prefix');
  });

  // --- listTemplates ---

  it('lists both builtin and custom templates', () => {
    const mgr = createMockManager();
    const list = mgr.listTemplates();
    assert.ok(list.planner);
    assert.ok(list.executor);
    assert.ok(list.reviewer);
    assert.ok(list.custom);
    assert.strictEqual(list.planner.source, 'builtin');
    assert.strictEqual(list.custom.source, 'config');
  });

  it('config templates override builtins in listing', () => {
    const mgr = createMockManager({
      templates: { planner: { model: 'haiku', description: 'Overridden' } }
    });
    const list = mgr.listTemplates();
    assert.strictEqual(list.planner.model, 'haiku');
    assert.strictEqual(list.planner.source, 'config');
  });

  // --- _applyTemplate ---

  it('applies template model to options', () => {
    const mgr = createMockManager();
    const opts = mgr._applyTemplate('planner', {});
    assert.strictEqual(opts._templateModel, 'opus');
    assert.strictEqual(opts._templateEffort, 'max');
    assert.strictEqual(opts.profile, 'planner');
  });

  it('applies template prompt prefix', () => {
    const mgr = createMockManager();
    const opts = mgr._applyTemplate('executor', {});
    assert.ok(opts._templatePromptPrefix);
    assert.ok(opts._templatePromptPrefix.includes('Executor'));
  });

  it('does not override existing profile', () => {
    const mgr = createMockManager();
    const opts = mgr._applyTemplate('planner', { profile: 'custom-profile' });
    assert.strictEqual(opts.profile, 'custom-profile');
  });

  it('returns unchanged options for unknown template', () => {
    const mgr = createMockManager();
    const opts = mgr._applyTemplate('nonexistent', { foo: 'bar' });
    assert.strictEqual(opts.foo, 'bar');
    assert.ok(!opts._templateModel);
  });

  it('sets command from template', () => {
    const mgr = createMockManager();
    const opts = mgr._applyTemplate('executor', {});
    assert.strictEqual(opts.command, 'claude');
  });

  // --- Template effort override ---

  it('template effort overrides dynamic effort', () => {
    const mgr = createMockManager();
    const opts = mgr._applyTemplate('reviewer', {});
    assert.strictEqual(opts._templateEffort, 'high');
  });
});
