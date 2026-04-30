// Claude Code plugin scaffold tests (1.6.16 — real spec).
//
// The plugin layout follows `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md`,
// validated against `claude plugin validate`. We don't shell out to claude
// here (test host doesn't always have the CLI), but we mirror the
// schema validation it performs.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'plugin');

describe('Claude Code plugin scaffold', () => {
  it('has .claude-plugin/plugin.json with required fields', () => {
    const file = path.join(PLUGIN, '.claude-plugin', 'plugin.json');
    assert.ok(fs.existsSync(file), 'plugin.json missing');
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(m.name, 'c4');
    assert.ok(m.description && m.description.length > 0);
    assert.ok(m.version);
  });

  it('ships at least one skill with valid frontmatter', () => {
    const skillsDir = path.join(PLUGIN, 'skills');
    assert.ok(fs.existsSync(skillsDir), 'skills/ missing');
    const skills = fs.readdirSync(skillsDir).filter((d) =>
      fs.existsSync(path.join(skillsDir, d, 'SKILL.md')));
    assert.ok(skills.length >= 1, 'no SKILL.md found');
    const first = path.join(skillsDir, skills[0], 'SKILL.md');
    const text = fs.readFileSync(first, 'utf8');
    assert.match(text, /^---\n[\s\S]+?\n---/, 'SKILL.md missing frontmatter block');
    assert.match(text, /\nname:\s*\S+/);
    assert.match(text, /\ndescription:\s*\S+/);
  });

  it('skill description triggers on c4-style asks', () => {
    const file = path.join(PLUGIN, 'skills', 'c4-orchestrator', 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8');
    for (const trigger of ['spawn a worker', 'use c4', 'schedule', 'fleet peer']) {
      assert.ok(text.toLowerCase().includes(trigger.toLowerCase()),
        `skill description should hint at "${trigger}"`);
    }
  });

  it('does not ship the legacy manifest.json or commands/*.js (1.6.16 cleanup)', () => {
    assert.ok(!fs.existsSync(path.join(PLUGIN, 'manifest.json')),
      'legacy manifest.json should be removed (1.6.16)');
    assert.ok(!fs.existsSync(path.join(PLUGIN, 'commands')),
      'legacy commands/ should be removed (1.6.16)');
  });
});
