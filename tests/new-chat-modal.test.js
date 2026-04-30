// (TODO 8.39) Tests for the New Chat modal in SessionsView and the
// daemon-side `/task` resolvedName fallback that PR #35 added.
// Source-grep over the React side (no jsdom) + a behavioural shim
// around the resolvedName logic.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SESSIONS_VIEW = path.join(ROOT, 'web/src/components/SessionsView.tsx');
const DAEMON = path.join(ROOT, 'src/daemon.js');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('NewChatModal contract', () => {
  const src = readText(SESSIONS_VIEW);

  it('exists as an internal component with the expected props', () => {
    assert.match(src, /interface NewChatModalProps/);
    assert.match(src, /function NewChatModal\(\{ open, busy, error, onClose, onSubmit \}: NewChatModalProps\)/);
  });

  it('declares MODEL_CHOICES + AGENT_CHOICES with default + four-or-five options each', () => {
    assert.match(src, /const MODEL_CHOICES:/);
    assert.match(src, /value: 'default'/);
    assert.match(src, /value: 'claude-opus-4-7'/);
    assert.match(src, /value: 'claude-sonnet-4-6'/);
    assert.match(src, /value: 'claude-haiku-4-5'/);
    assert.match(src, /const AGENT_CHOICES:/);
    assert.match(src, /value: 'generic'/);
  });

  it('renders the dialog with proper ARIA attributes', () => {
    assert.match(src, /role="dialog"/);
    assert.match(src, /aria-modal="true"/);
    assert.match(src, /aria-labelledby="new-chat-title"/);
    assert.match(src, /id="new-chat-title"/);
  });

  it('uses labels bound to the prompt textarea + model + agent selects', () => {
    assert.match(src, /htmlFor="new-chat-prompt"/);
    assert.match(src, /id="new-chat-prompt"/);
    assert.match(src, /htmlFor="new-chat-model"/);
    assert.match(src, /id="new-chat-model"/);
    assert.match(src, /htmlFor="new-chat-agent"/);
    assert.match(src, /id="new-chat-agent"/);
  });

  it('shows error in role="alert" region when present', () => {
    assert.match(src, /role="alert"[^>]*>\s*\n\s*\{error\}/);
  });

  it('disables Submit when prompt is empty or busy', () => {
    assert.match(src, /const trimmed = prompt\.trim\(\);/);
    assert.match(src, /canSubmit = !busy && trimmed\.length > 0/);
    assert.match(src, /disabled=\{!canSubmit\}/);
  });

  it('submits the trimmed prompt + model + agent', () => {
    assert.match(src, /onSubmit\(\{ prompt: trimmed, model, agent \}\)/);
  });

  it('resets fields when re-opened', () => {
    assert.match(src, /if \(open\) \{\s*\n\s*setPrompt\(''\);\s*\n\s*setModel\('default'\);\s*\n\s*setAgent\('generic'\);/);
  });

  // (review fix 2026-05-01) Standard dialogs close on Escape;
  // the listener is no-op while busy so an accidental Esc during
  // submit doesn't drop the in-flight POST result.
  it('binds Escape to close (skipped while busy)', () => {
    assert.match(src, /e\.key === 'Escape' && !busy/);
    assert.match(src, /onClose\(\)/);
  });

  // (review fix 2026-05-01) Backdrop click closes only when not
  // submitting — original code unconditionally fired onClose
  // which could unmount the modal mid-POST.
  it('backdrop click is busy-guarded', () => {
    assert.match(src, /const handleBackdropClick = \(\) => \{\s*\n\s*if \(!busy\) onClose\(\);/);
    assert.match(src, /onClick=\{handleBackdropClick\}/);
  });
});

describe('handleNewChatSubmit shape', () => {
  const src = readText(SESSIONS_VIEW);

  it('POSTs to /api/task with the trimmed prompt as task', () => {
    assert.match(src, /apiPost<\{ name\?: string; error\?: string \}>\(\s*\n\s*'\/api\/task',\s*\n\s*body,\s*\n\s*\)/);
    assert.match(src, /task: req\.prompt/);
  });

  it("only attaches model when not 'default'", () => {
    assert.match(src, /if \(req\.model && req\.model !== 'default'\) body\.model = req\.model/);
  });

  it("only attaches profile when agent isn't 'generic'", () => {
    assert.match(src, /if \(req\.agent && req\.agent !== 'generic'\) body\.profile = req\.agent/);
  });

  it('sends autoMode: false (plain chat spawn, not a manager auto)', () => {
    assert.match(src, /autoMode: false/);
  });

  it('refreshes both sessions + attached lists on success', () => {
    assert.match(src, /await Promise\.all\(\[refreshSessions\(\), refreshAttached\(\)\]\)/);
  });
});

// (review fix 2026-05-01) The daemon-side resolvedName fallback —
// when the Web UI New Chat modal POSTs without a `name`, the daemon
// auto-generates one via `_generateTaskName(prompt)` and uses that
// resolved name in audit / Slack / history records. Without this
// fallback, every Web UI spawn logged `worker: undefined`.
describe('daemon /task resolvedName fallback', () => {
  const src = readText(DAEMON);

  it('declares resolvedName variable derived from name OR result.name', () => {
    assert.match(src, /resolvedName/);
    assert.match(src, /typeof result\.name === 'string'/);
  });

  it('audit, Slack, history records all reference resolvedName (not raw name)', () => {
    // Pull the /task block region (rough — search the relevant
    // sub-string and make sure the new identifier appears in all
    // three downstream calls).
    const slice = src.slice(src.indexOf("'/task'"), src.indexOf("'/merge'"));
    assert.match(slice, /target: resolvedName/);
    assert.match(slice, /worker: resolvedName/);
  });

  it('passes resolvedName to planner.setPlanDocPath', () => {
    const slice = src.slice(src.indexOf("'/task'"), src.indexOf("'/merge'"));
    assert.match(slice, /planner\.setPlanDocPath\(resolvedName, planDocPath\)/);
  });

  // Behavioural shim mirroring the resolvedName algorithm. If the
  // daemon's logic drifts (e.g. someone reverts to using raw name)
  // the source-grep tests above flag it; this shim documents the
  // exact semantics.
  function resolvedNameFor(name, result) {
    if (name && typeof name === 'string') return name;
    if (result && typeof result === 'object' && typeof result.name === 'string') return result.name;
    return '';
  }

  it('shim: explicit name wins', () => {
    assert.strictEqual(resolvedNameFor('my-worker', { name: 'auto-name' }), 'my-worker');
  });
  it('shim: missing name falls back to result.name', () => {
    assert.strictEqual(resolvedNameFor(undefined, { name: 'auto-w-foo' }), 'auto-w-foo');
  });
  it('shim: both missing -> empty string (audit logs empty target)', () => {
    assert.strictEqual(resolvedNameFor(undefined, undefined), '');
    assert.strictEqual(resolvedNameFor('', null), '');
  });
});
