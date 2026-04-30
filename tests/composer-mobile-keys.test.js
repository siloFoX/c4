// (TODO 8.42 partial) Lock in the desktop-hides-special-keys
// contract — WorkerDetail's "Keys" row (Esc / Ctrl-C / Ctrl-D /
// Tab / arrows) is mobile-only. Source-grep so a future composer
// refactor can't silently bring the row back to desktop and clutter
// the input area.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WORKER_DETAIL = path.join(ROOT, 'web/src/components/WorkerDetail.tsx');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('WorkerDetail composer special-keys row is mobile-only', () => {
  const src = readText(WORKER_DETAIL);

  it('the "Keys" row carries md:hidden so desktop hides it entirely', () => {
    // Match the row container — flex + gap + md:hidden + the
    // "Keys" label inside it.
    assert.match(src, /<div className="flex flex-wrap items-center gap-2 md:hidden">/);
    assert.match(src, /Keys<\/span>/);
  });

  it('the comment explains the desktop-hide reasoning', () => {
    assert.match(src, /\(TODO 8\.42\)[^<]*Special-key buttons/);
    assert.match(src, /soft-keyboard/);
  });
});
