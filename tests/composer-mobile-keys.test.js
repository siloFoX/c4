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
// (v1.10.610) The "Keys" row was extracted into its own
// component; the md:hidden + i18n heading invariants now live
// in the sibling.
const KEYS_ROW = path.join(ROOT, 'web/src/components/WorkerDetailKeysRow.tsx');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('WorkerDetail composer special-keys row is mobile-only', () => {
  const parentSrc = readText(WORKER_DETAIL);
  const rowSrc = readText(KEYS_ROW);

  it('the "Keys" row carries md:hidden so desktop hides it entirely', () => {
    // Match the row container — flex + gap + md:hidden + the
    // "Keys" heading reference inside it.
    assert.match(rowSrc, /<div className="flex flex-wrap items-center gap-2 md:hidden">/);
    // (v1.10.387) Heading migrated to i18n: t('workerDetail.keys.heading').
    assert.match(rowSrc, /workerDetail\.keys\.heading/);
  });

  it('the comment explains the desktop-hide reasoning', () => {
    // (v1.10.610) The TODO 8.42 / soft-keyboard explainer stays
    // in the parent right above the <WorkerDetailKeysRow /> call.
    assert.match(parentSrc, /\(TODO 8\.42\)[^<]*Special-key buttons/);
    assert.match(parentSrc, /soft-keyboard/);
  });
});
