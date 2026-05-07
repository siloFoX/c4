'use strict';

// (v1.10.513) ErrorBoundary regression guard. The boundary is the
// only thing standing between a leaf render error and a blank
// screen, so its source contract gets pinned via grep so refactors
// don't accidentally break the catch path. We don't run a JSX-aware
// runtime here — the rest of the suite is source-grep based.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'src', 'components', 'ErrorBoundary.tsx'),
  'utf8',
);
const MAIN = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'src', 'main.tsx'),
  'utf8',
);

describe('ErrorBoundary contract', () => {
  it('declares a class component (must be classy — boundaries are not hookable)', () => {
    assert.match(SRC, /class\s+ErrorBoundary\s+extends\s+Component/);
  });

  it('implements getDerivedStateFromError to flip state on throw', () => {
    assert.match(SRC, /static\s+getDerivedStateFromError/);
  });

  it('implements componentDidCatch and logs the stack to console.error', () => {
    assert.match(SRC, /componentDidCatch/);
    assert.match(SRC, /console\.error\(['"]\[ErrorBoundary\]['"]/);
  });

  it('renders the fallback panel via i18n keys (no hardcoded English copy)', () => {
    assert.match(SRC, /errorBoundary\.title/);
    assert.match(SRC, /errorBoundary\.message/);
    assert.match(SRC, /errorBoundary\.tryAgain/);
    assert.match(SRC, /errorBoundary\.reload/);
  });

  it('exposes both Try Again (state reset) and Reload (window.location.reload) recovery paths', () => {
    assert.match(SRC, /this\.setState\(\s*\{\s*error:\s*null\s*\}\s*\)/);
    assert.match(SRC, /window\.location\.reload\(\)/);
  });

  it('shows the stack trace inside a <pre> for operator copy/paste', () => {
    assert.match(SRC, /<pre[^>]*>\s*\{this\.state\.error\.stack\s*\|\|\s*message\}/);
  });

  it('passes children through unchanged when there is no error', () => {
    // The early-return shape: `if (!this.state.error) return this.props.children;`
    assert.match(SRC, /if\s*\(\s*!this\.state\.error\s*\)\s*return\s+this\.props\.children/);
  });
});

describe('main.tsx wires ErrorBoundary at the root', () => {
  it('imports ErrorBoundary', () => {
    assert.match(MAIN, /import\s+ErrorBoundary\s+from\s+['"]\.\/components\/ErrorBoundary['"]/);
  });

  it('wraps <App /> with <ErrorBoundary>', () => {
    assert.match(MAIN, /<ErrorBoundary>[\s\S]*?<App\s*\/>[\s\S]*?<\/ErrorBoundary>/);
  });

  it('keeps StrictMode as the outermost wrapper (boundary is inside StrictMode for dev double-invoke)', () => {
    // <StrictMode><ErrorBoundary>...</ErrorBoundary></StrictMode>
    assert.match(MAIN, /<React\.StrictMode>[\s\S]*?<ErrorBoundary>/);
  });
});
