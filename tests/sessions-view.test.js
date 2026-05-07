'use strict';

// 8.31 - SessionsView.tsx attach UX guidance.
//
// Pure source-grep test file (no browser, no jsdom). The Web UI
// primitives are rendered by React/TypeScript which this repo only
// builds via vite; unit-level assertions here lock the UX strings +
// wiring that 8.31 introduces on top of the 8.17 attach surface. If
// this file fails, the SessionsView rewrite has drifted from the
// onboarding / comparison / row-action contract the operator-facing
// docs promise.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const repoRoot = ROOT;
const SESSIONS_VIEW = path.join(
  ROOT,
  'web',
  'src',
  'components',
  'SessionsView.tsx',
);

const src = fs.readFileSync(SESSIONS_VIEW, 'utf8');

describe('SessionsView.tsx - empty-state banner', () => {
  it('exports the attach banner title key constant', () => {
    // (v1.10.475) migrated to i18n: const points at sessions.banner.emptyTitle key.
    assert.match(src, /EMPTY_ATTACH_BANNER_TITLE_KEY\s*=\s*'sessions\.banner\.emptyTitle'/);
  });

  it('exports the attach banner body key constant', () => {
    // (v1.10.475) migrated to i18n: const points at sessions.banner.emptyBody key.
    // The English copy lives in the bundle, not the source — checked here:
    assert.match(src, /EMPTY_ATTACH_BANNER_BODY_KEY\s*=\s*'sessions\.banner\.emptyBody'/);
    const bundle = fs.readFileSync(
      path.join(repoRoot, 'web', 'src', 'i18n', 'en.json'),
      'utf8',
    );
    assert.match(bundle, /Import external Claude Code sessions \(~\/\.claude\/projects\/\*\.jsonl\)/);
    assert.match(bundle, /view conversation history in c4 Web UI/);
  });

  it('renders the banner component with an Info icon and a call-to-action', () => {
    assert.match(src, /function EmptyAttachBanner/);
    assert.match(src, /<Info/);
    assert.match(src, /t\('sessions\.attach\.firstSession'\)/);
    assert.match(src, /role="note"/);
  });

  it('shows the banner when no attached sessions exist instead of the old plain text', () => {
    // The pre-8.31 empty-state line must be gone - we replaced it with
    // the richer EmptyAttachBanner component.
    assert.doesNotMatch(
      src,
      /No attached sessions\. Use "Attach new\.\.\." to import an external/,
    );
    assert.match(src, /<EmptyAttachBanner[\s\S]*?onAttachClick=/);
  });
});

describe('AttachModal.tsx (extracted v1.10.540) - attach modal preview + help', () => {
  // (v1.10.540) AttachModal extracted out of SessionsView. The
  // contract assertions below source-grep its new home.
  const ATTACH_MODAL = path.join(repoRoot, 'web/src/components/AttachModal.tsx');
  const modalSrc = fs.readFileSync(ATTACH_MODAL, 'utf8');

  it('AttachModal accepts an available session list prop', () => {
    assert.match(modalSrc, /interface AttachModalProps/);
    assert.match(modalSrc, /available:\s*SessionSummary\[\]/);
  });

  it('renders an available-sessions preview with project / timestamp / msg count', () => {
    // Heading + "unknown project" fallback + msg count are now i18n'd
    // through sessions.preview.* keys, surfaced via t() / tFormat().
    assert.match(modalSrc, /t\('sessions\.preview\.heading'\)/);
    assert.match(modalSrc, /\{s\.projectPath \|\| s\.projectDir \|\| t\('sessions\.preview\.unknownProject'\)\}/);
    assert.match(modalSrc, /formatRelative\(s\.updatedAt\)/);
    assert.match(modalSrc, /tFormat\('sessions\.preview\.msgs',\s*\{\s*count:\s*s\.turnCount\s*\}\)/);
    assert.match(modalSrc, /\{s\.lastAssistantSnippet\}/);
  });

  it('includes a "Use this id" button that autofills the sessionId input', () => {
    // Copy lives in i18n now; check the key wiring.
    assert.match(modalSrc, /t\('sessions\.attach\.useThisId'\)/);
    assert.match(modalSrc, /setPathValue\(s\.sessionId\)/);
  });

  it('exports the post-attach help title + item keys shown below the modal form', () => {
    // (v1.10.475) migrated to i18n: const points at sessions.help.* keys.
    // The key-name constants live in SessionsView (source of truth);
    // AttachModal imports + uses them.
    assert.match(src, /POST_ATTACH_HELP_TITLE_KEY\s*=\s*'sessions\.help\.afterAttachTitle'/);
    assert.match(src, /POST_ATTACH_HELP_ITEM_KEYS/);
    const bundle = fs.readFileSync(
      path.join(repoRoot, 'web', 'src', 'i18n', 'en.json'),
      'utf8',
    );
    assert.match(bundle, /view full conversation timeline/);
    assert.match(bundle, /search messages across sessions/);
    assert.match(bundle, /resume the session via claude --resume/);
  });

  it('renders the help block inside the modal with aria labelling', () => {
    // (v1.10.421) aria-label migrated to i18n: t('sessions.aria.postAttachHelp').
    assert.match(modalSrc, /aria-label=\{t\('sessions\.aria\.postAttachHelp'\)\}/);
    assert.match(modalSrc, /t\(POST_ATTACH_HELP_TITLE_KEY\)/);
    assert.match(modalSrc, /POST_ATTACH_HELP_ITEM_KEYS\.map/);
  });

  it('threads availableSessions from /api/sessions into the modal', () => {
    assert.match(src, /const availableSessions\s*=\s*data\?\.sessions \?\? \[\]/);
    assert.match(src, /available=\{availableSessions\}/);
  });
});

describe('SessionsView.tsx - post-attach row actions', () => {
  it('exposes an AttachedRowActions component', () => {
    assert.match(src, /function AttachedRowActions/);
    assert.match(src, /interface AttachedRowActionsProps/);
  });

  it('renders View / Resume / Detach buttons for each attached row', () => {
    // Copy lives in i18n; verify the key wirings.
    assert.match(src, /t\('sessions\.row\.viewConversation'\)/);
    assert.match(src, /t\('sessions\.row\.resumeInTerminal'\)/);
    assert.match(src, /t\('sessions\.row\.detach'\)/);
  });

  it('wires the buttons through aria-label for screen readers', () => {
    // aria-labels are now i18n + tFormat with a {worker} placeholder.
    assert.match(src, /sessions\.row\.viewConversationAria/);
    assert.match(src, /sessions\.row\.resumeInTerminalAria/);
    assert.match(src, /sessions\.row\.detachAria/);
  });

  it('uses Eye / Terminal / Trash2 icons from lucide-react', () => {
    assert.match(src, /from 'lucide-react'/);
    assert.match(src, /\bEye\b/);
    assert.match(src, /\bTerminal\b/);
    assert.match(src, /\bTrash2\b/);
  });

  it('reveals the claude --resume command and copies it to clipboard', () => {
    assert.match(src, /claude --resume \$\{session\.sessionId\}/);
    assert.match(src, /function copyToClipboard/);
    assert.match(src, /navigator\.clipboard\.writeText/);
  });

  it('routes onView back into the Selection state machine', () => {
    // Row actions must reuse setSelection so the conversation pane
    // stays in sync with the button click.
    assert.match(src, /onView=\{\(\) =>\s*setSelection\(\{ kind: 'attached', name: a\.name \}\)/);
  });

  it('routes onDetach back into the existing handleDetach callback', () => {
    assert.match(src, /onDetach=\{\(\) => handleDetach\(a\.name\)\}/);
  });
});

describe('SessionsView.tsx - comparison card', () => {
  it('defines a comparison title key constant', () => {
    // (v1.10.475) migrated to i18n: const points at sessions.compare.title key.
    assert.match(
      src,
      /COMPARISON_TITLE_KEY\s*=\s*'sessions\.compare\.title'/,
    );
  });

  it('defines a table of comparison rows covering mode / source / updates / resume', () => {
    assert.match(src, /COMPARISON_ROW_KEYS/);
    // (v1.10.475) row labels live in the i18n bundle now.
    const bundle = fs.readFileSync(
      path.join(repoRoot, 'web', 'src', 'i18n', 'en.json'),
      'utf8',
    );
    assert.match(bundle, /"sessions\.compare\.modeLabel":\s*"Mode"/);
    assert.match(bundle, /"sessions\.compare\.sourceLabel":\s*"Source"/);
    assert.match(bundle, /"sessions\.compare\.updatesLabel":\s*"Updates"/);
    assert.match(bundle, /"sessions\.compare\.resumeLabel":\s*"Resume"/);
    assert.match(bundle, /Read-only view/);
    assert.match(bundle, /Interactive PTY/);
    assert.match(bundle, /JSONL transcript/);
    assert.match(bundle, /Live pty stream/);
    assert.match(bundle, /claude --resume <id>/);
  });

  it('renders the ComparisonCard component in both selected + empty panes', () => {
    assert.match(src, /function ComparisonCard/);
    // At least two call sites so the operator sees it regardless of
    // whether they landed on an attached row or an empty pane.
    const calls = src.match(/<ComparisonCard/g) || [];
    assert.ok(
      calls.length >= 2,
      `expected ComparisonCard rendered >=2 times, saw ${calls.length}`,
    );
  });
});

describe('SessionsView.tsx - onboarding tour', () => {
  it('defines a stable localStorage key for the tour-done flag', () => {
    assert.match(src, /TOUR_STORAGE_KEY\s*=\s*'sessions-tour-v1'/);
  });

  it('defines 3 tour steps (welcome / attach / view-resume)', () => {
    // TOUR_STEPS now stores i18n key references; copy lives in
    // web/src/i18n/{en,ko}.json under sessions.tour.*.
    assert.match(src, /TOUR_STEPS\s*:\s*Array/);
    assert.match(src, /'sessions\.tour\.welcome\.title'/);
    assert.match(src, /'sessions\.tour\.attach\.title'/);
    assert.match(src, /'sessions\.tour\.view\.title'/);
    // Sanity: exactly three entries in the const array.
    const stepMatches = src.match(/titleKey:\s*'[^']+',[\s\S]{0,120}?bodyKey:/g) || [];
    assert.ok(
      stepMatches.length >= 3,
      `expected 3+ tour steps, saw ${stepMatches.length}`,
    );
  });

  it('renders a Tour component behind the TOUR_STORAGE_KEY gate', () => {
    // (v1.10.530) Tour extracted to ./SessionsTour.tsx
    assert.match(src, /import SessionsTour from '\.\/SessionsTour'/);
    assert.match(src, /localStorage\.getItem\(TOUR_STORAGE_KEY\)/);
    assert.match(src, /localStorage\.setItem\(TOUR_STORAGE_KEY, 'done'\)/);
    assert.match(src, /\{showTour \? <SessionsTour onDismiss=\{dismissTour\} \/> : null\}/);
  });

  it('tour dismisses via either Skip or Done and advances via Next', () => {
    // (v1.10.530) Tour body is in SessionsTour.tsx now.
    const tourSrc = fs.readFileSync(
      path.join(repoRoot, 'web', 'src', 'components', 'SessionsTour.tsx'),
      'utf8',
    );
    assert.match(tourSrc, /sessions\.tour\.skip/);
    assert.match(tourSrc, /common\.done/);
    assert.match(tourSrc, /common\.next/);
    assert.match(tourSrc, /setStep\(\(s\) => s \+ 1\)/);
  });

  it('guards localStorage access so private-mode throws do not crash the page', () => {
    // Both read + write sites must be wrapped.
    const tries = src.match(/try \{\s*[\s\S]*?localStorage\.(getItem|setItem)/g) || [];
    assert.ok(
      tries.length >= 2,
      `expected 2 guarded localStorage sites, saw ${tries.length}`,
    );
  });
});

describe('SessionsView.tsx - 8.17 wiring regression guards', () => {
  // These pre-8.31 invariants must stay intact so session-attach.test.js
  // does not regress when this UX work lands.

  it('still fetches /api/sessions and /api/attach/list', () => {
    assert.match(src, /apiGet<SessionsResponse>\('\/api\/sessions'\)/);
    assert.match(src, /apiGet<AttachedListResponse>\('\/api\/attach\/list'\)/);
  });

  it('still POSTs /api/attach with {path|sessionId, name?}', () => {
    assert.match(src, /apiPost<AttachResponse>\('\/api\/attach'/);
  });

  it('still DELETEs /api/attach/:name for the detach action', () => {
    assert.match(
      src,
      /apiDelete\(`\/api\/attach\/\$\{encodeURIComponent\(name\)\}`\)/,
    );
  });

  it('still embeds ConversationView with the snapshotUrl override', () => {
    assert.match(src, /import ConversationView from '\.\/ConversationView'/);
    assert.match(
      src,
      /snapshotUrl=\{`\/api\/attach\/\$\{encodeURIComponent\(selection\.name\)\}\/conversation`\}/,
    );
  });
});
