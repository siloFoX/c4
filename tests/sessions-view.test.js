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
const SESSIONS_VIEW = path.join(
  ROOT,
  'web',
  'src',
  'components',
  'SessionsView.tsx',
);

const src = fs.readFileSync(SESSIONS_VIEW, 'utf8');

describe('SessionsView.tsx - empty-state banner', () => {
  it('exports the attach banner title constant', () => {
    assert.match(src, /EMPTY_ATTACH_BANNER_TITLE\s*=\s*'What is attach\?'/);
  });

  it('exports the attach banner body that names ~/.claude/projects JSONLs', () => {
    assert.match(src, /EMPTY_ATTACH_BANNER_BODY\s*=/);
    assert.match(
      src,
      /Import external Claude Code sessions \(~\/\.claude\/projects\/\*\.jsonl\)/,
    );
    assert.match(src, /view conversation history in c4 Web UI/);
  });

  it('renders the banner component with an Info icon and a call-to-action', () => {
    assert.match(src, /function EmptyAttachBanner/);
    assert.match(src, /<Info/);
    assert.match(src, /Attach your first session/);
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

describe('SessionsView.tsx - attach modal preview + help', () => {
  it('AttachModal accepts an available session list prop', () => {
    assert.match(src, /interface AttachModalProps/);
    assert.match(src, /available:\s*SessionSummary\[\]/);
  });

  it('renders an available-sessions preview with project / timestamp / msg count', () => {
    assert.match(src, /Available sessions/);
    assert.match(src, /\{s\.projectPath \|\| s\.projectDir \|\| 'unknown project'\}/);
    assert.match(src, /formatRelative\(s\.updatedAt\)/);
    assert.match(src, /\{s\.turnCount\} msgs/);
    assert.match(src, /\{s\.lastAssistantSnippet\}/);
  });

  it('includes a "Use this id" button that autofills the sessionId input', () => {
    assert.match(src, /Use this id/);
    assert.match(src, /setPathValue\(s\.sessionId\)/);
  });

  it('exports the post-attach help literals shown below the modal form', () => {
    assert.match(src, /POST_ATTACH_HELP_TITLE\s*=\s*'After attach you can:'/);
    assert.match(
      src,
      /POST_ATTACH_HELP_ITEMS\s*=\s*\[[\s\S]*?'view full conversation timeline'[\s\S]*?'search messages across sessions'[\s\S]*?'resume the session via claude --resume'/,
    );
  });

  it('renders the help block inside the modal with aria labelling', () => {
    assert.match(src, /aria-label="Post-attach help"/);
    assert.match(src, /\{POST_ATTACH_HELP_TITLE\}/);
    assert.match(src, /POST_ATTACH_HELP_ITEMS\.map/);
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
    assert.match(src, /View conversation/);
    assert.match(src, /Resume in terminal/);
    assert.match(src, />\s*Detach\s*</);
  });

  it('wires the buttons through aria-label for screen readers', () => {
    assert.match(src, /aria-label=\{`View conversation for \$\{session\.name\}`\}/);
    assert.match(src, /aria-label=\{`Resume \$\{session\.name\} in terminal`\}/);
    assert.match(src, /aria-label=\{`Detach \$\{session\.name\}`\}/);
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
  it('defines a comparison title constant', () => {
    assert.match(
      src,
      /COMPARISON_TITLE\s*=\s*'Attached session vs Live worker'/,
    );
  });

  it('defines a table of comparison rows covering mode / source / updates / resume', () => {
    assert.match(src, /COMPARISON_ROWS/);
    assert.match(src, /'Mode'/);
    assert.match(src, /'Source'/);
    assert.match(src, /'Updates'/);
    assert.match(src, /'Resume'/);
    assert.match(src, /'Read-only view'/);
    assert.match(src, /'Interactive PTY'/);
    assert.match(src, /'JSONL transcript'/);
    assert.match(src, /'Live pty stream'/);
    assert.match(src, /'claude --resume <id>'/);
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
    assert.match(src, /TOUR_STEPS\s*:\s*Array/);
    assert.match(src, /'Welcome to Sessions'/);
    assert.match(src, /'Attach external sessions'/);
    assert.match(src, /'View or resume'/);
    // Sanity: exactly three entries in the const array.
    const stepMatches = src.match(/title:\s*'[^']+',[\s\S]{0,120}body:/g) || [];
    assert.ok(
      stepMatches.length >= 3,
      `expected 3+ tour steps, saw ${stepMatches.length}`,
    );
  });

  it('renders a Tour component behind the TOUR_STORAGE_KEY gate', () => {
    assert.match(src, /function Tour/);
    assert.match(src, /localStorage\.getItem\(TOUR_STORAGE_KEY\)/);
    assert.match(src, /localStorage\.setItem\(TOUR_STORAGE_KEY, 'done'\)/);
    assert.match(src, /\{showTour \? <Tour onDismiss=\{dismissTour\} \/> : null\}/);
  });

  it('tour dismisses via either Skip or Done and advances via Next', () => {
    assert.match(src, /Skip tour/);
    assert.match(src, /\bDone\b/);
    assert.match(src, /\bNext\b/);
    assert.match(src, /setStep\(\(s\) => s \+ 1\)/);
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
