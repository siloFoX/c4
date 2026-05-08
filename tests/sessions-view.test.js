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
    // (v1.10.549) EmptyAttachBanner extracted to its own file —
    // contract assertions now source-grep there.
    const BANNER = path.join(repoRoot, 'web/src/components/SessionsEmptyAttachBanner.tsx');
    const bannerSrc = fs.readFileSync(BANNER, 'utf8');
    assert.match(bannerSrc, /export default function SessionsEmptyAttachBanner/);
    assert.match(bannerSrc, /<Info/);
    assert.match(bannerSrc, /t\('sessions\.attach\.firstSession'\)/);
    assert.match(bannerSrc, /role="note"/);
  });

  it('shows the banner when no attached sessions exist instead of the old plain text', () => {
    // The pre-8.31 empty-state line must be gone - we replaced it with
    // the richer banner component.
    assert.doesNotMatch(
      src,
      /No attached sessions\. Use "Attach new\.\.\." to import an external/,
    );
    // (v1.10.578) The banner now lives inside SessionsAttachedSection.
    const SECTION = path.join(repoRoot, 'web/src/components/SessionsAttachedSection.tsx');
    const sectionSrc = fs.readFileSync(SECTION, 'utf8');
    assert.match(sectionSrc, /<SessionsEmptyAttachBanner[\s\S]*?onAttachClick=/);
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

describe('SessionsAttachedRowActions.tsx (extracted v1.10.550) - post-attach row actions', () => {
  // (v1.10.550) AttachedRowActions extracted out of SessionsView.
  // Contract assertions now source-grep its new home.
  const ROW_ACTIONS = path.join(repoRoot, 'web/src/components/SessionsAttachedRowActions.tsx');
  const rowSrc = fs.readFileSync(ROW_ACTIONS, 'utf8');

  it('exposes a SessionsAttachedRowActions default-exported component', () => {
    assert.match(rowSrc, /export default function SessionsAttachedRowActions/);
  });

  it('renders View / Resume / Detach buttons for each attached row', () => {
    // Copy lives in i18n; verify the key wirings.
    assert.match(rowSrc, /t\('sessions\.row\.viewConversation'\)/);
    assert.match(rowSrc, /t\('sessions\.row\.resumeInTerminal'\)/);
    assert.match(rowSrc, /t\('sessions\.row\.detach'\)/);
  });

  it('wires the buttons through aria-label for screen readers', () => {
    // aria-labels are now i18n + tFormat with a {worker} placeholder.
    assert.match(rowSrc, /sessions\.row\.viewConversationAria/);
    assert.match(rowSrc, /sessions\.row\.resumeInTerminalAria/);
    assert.match(rowSrc, /sessions\.row\.detachAria/);
  });

  it('uses Eye / Terminal / Trash2 icons from lucide-react', () => {
    assert.match(rowSrc, /from 'lucide-react'/);
    assert.match(rowSrc, /\bEye\b/);
    assert.match(rowSrc, /\bTerminal\b/);
    assert.match(rowSrc, /\bTrash2\b/);
  });

  it('reveals the claude --resume command and copies it to clipboard', () => {
    assert.match(rowSrc, /claude --resume \$\{session\.sessionId\}/);
    assert.match(rowSrc, /function copyToClipboard/);
    assert.match(rowSrc, /navigator\.clipboard\.writeText/);
  });

  it('parent SessionsAttachedSection routes onView back into the Selection state machine', () => {
    // (v1.10.578) Row mapping moved into SessionsAttachedSection.
    // The wrapping section uses an `onSelect(name)` prop the parent
    // wires to setSelection.
    // (v1.10.622) The parent's onSelectAttached callback moved from
    // SessionsView straight into SessionsListCard's prop wiring; the
    // inline lambda still lives in SessionsView (it then flows
    // through the SessionsListCard composite).
    const SECTION = path.join(repoRoot, 'web/src/components/SessionsAttachedSection.tsx');
    const sectionSrc = fs.readFileSync(SECTION, 'utf8');
    assert.match(sectionSrc, /onView=\{\(\) => onSelect\(a\.name\)\}/);
    assert.match(src, /onSelectAttached=\{\(name\) => setSelection\(\{ kind: 'attached', name \}\)\}/);
  });

  it('parent SessionsAttachedSection routes onDetach back into the handleDetach callback', () => {
    const SECTION = path.join(repoRoot, 'web/src/components/SessionsAttachedSection.tsx');
    const sectionSrc = fs.readFileSync(SECTION, 'utf8');
    assert.match(sectionSrc, /onDetach=\{\(\) => onDetach\(a\.name\)\}/);
    assert.match(src, /onDetach=\{handleDetach\}/);
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
    // (v1.10.549) ComparisonCard extracted to its own file.
    // (v1.10.601) Empty-pane site moved into SessionsEmptyPanel.
    // (v1.10.607) Attached-pane site moved into SessionsRightPane.
    // Count all the containers to keep the original "2+ usages"
    // intent intact.
    const CARD = path.join(repoRoot, 'web/src/components/SessionsComparisonCard.tsx');
    const EMPTY = path.join(repoRoot, 'web/src/components/SessionsEmptyPanel.tsx');
    const RIGHT = path.join(repoRoot, 'web/src/components/SessionsRightPane.tsx');
    const cardSrc = fs.readFileSync(CARD, 'utf8');
    const emptySrc = fs.readFileSync(EMPTY, 'utf8');
    const rightSrc = fs.readFileSync(RIGHT, 'utf8');
    assert.match(cardSrc, /export default function SessionsComparisonCard/);
    const emptyCalls = emptySrc.match(/<SessionsComparisonCard/g) || [];
    const rightCalls = rightSrc.match(/<SessionsComparisonCard/g) || [];
    const total = emptyCalls.length + rightCalls.length;
    assert.ok(
      total >= 2,
      `expected SessionsComparisonCard rendered >=2 times across SessionsRightPane+SessionsEmptyPanel, saw ${total} (right=${rightCalls.length}, empty=${emptyCalls.length})`,
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
    // (v1.10.629) Tour gate state moved into useSessionsTour hook;
    // the localStorage read/write sites moved with it.
    const HOOK = path.join(repoRoot, 'web/src/lib/use-sessions-tour.ts');
    const hookSrc = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /import SessionsTour from '\.\/SessionsTour'/);
    assert.match(hookSrc, /localStorage\.getItem\(TOUR_STORAGE_KEY\)/);
    assert.match(hookSrc, /localStorage\.setItem\(TOUR_STORAGE_KEY, 'done'\)/);
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
    // (v1.10.629) Sites moved into useSessionsTour hook.
    const HOOK = path.join(repoRoot, 'web/src/lib/use-sessions-tour.ts');
    const hookSrc = fs.readFileSync(HOOK, 'utf8');
    const tries = hookSrc.match(/try \{\s*[\s\S]*?localStorage\.(getItem|setItem)/g) || [];
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
    // (v1.10.607) ConversationView's attached call moved into
    // SessionsRightPane.
    const RIGHT = path.join(repoRoot, 'web/src/components/SessionsRightPane.tsx');
    const rightSrc = fs.readFileSync(RIGHT, 'utf8');
    assert.match(rightSrc, /import ConversationView from '\.\/ConversationView'/);
    assert.match(
      rightSrc,
      /snapshotUrl=\{`\/api\/attach\/\$\{encodeURIComponent\(selection\.name\)\}\/conversation`\}/,
    );
  });
});
