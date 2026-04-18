'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'web', 'src', 'components', 'ui');
const primitives = [
  'button.tsx',
  'card.tsx',
  'panel.tsx',
  'input.tsx',
  'label.tsx',
  'badge.tsx',
  'icon-button.tsx',
  'index.ts',
];

describe('web ui primitives', () => {
  it('every primitive file is present and has a non-empty module body', () => {
    for (const file of primitives) {
      const full = path.join(uiDir, file);
      assert.ok(fs.existsSync(full), `${file} should exist at ${full}`);
      const src = fs.readFileSync(full, 'utf8').trim();
      assert.ok(src.length > 0, `${file} should not be empty`);
      if (file === 'index.ts') {
        assert.ok(/export \*/.test(src), 'index.ts should re-export primitives');
      } else {
        assert.ok(
          /\bexport\b/.test(src),
          `${file} should declare at least one export`
        );
      }
    }
  });
});
