'use strict';

// (v1.10.536) Component extraction boundary tests. Locks in the
// extracted component files so future refactors don't accidentally
// re-inline them into their parent megacomponents. Each split was
// done because the parent had grown unwieldy (1300+ lines); folding
// them back would silently negate that work.
//
// Pure source-grep — no browser, no jsdom. Just asserts that the
// extracted file exists, exports the expected default, and that
// the parent imports + renders it.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = path.join(ROOT, 'web', 'src', 'components');

function read(file) {
  return fs.readFileSync(path.join(COMPONENTS, file), 'utf8');
}

describe('extracted: MeetingsMaintenancePanel (v1.10.529)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsMaintenancePanel.tsx');
    assert.match(src, /export default function MeetingsMaintenancePanel/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsMaintenancePanel\s+from\s+'\.\/MeetingsMaintenancePanel'/);
    assert.match(parent, /<MeetingsMaintenancePanel\s/);
  });

  it('owns its own state (integrity, backup, fts, prune)', () => {
    const src = read('MeetingsMaintenancePanel.tsx');
    // Sanity-check that state lives in the panel, not inherited from parent.
    assert.match(src, /useState/);
  });
});

describe('extracted: SessionsTour (v1.10.530)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsTour.tsx');
    assert.match(src, /export default function SessionsTour/);
  });

  it('is imported and rendered by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsTour\s+from\s+'\.\/SessionsTour'/);
    assert.match(parent, /<SessionsTour\s/);
  });

  it('reuses TOUR_STEPS exported from SessionsView', () => {
    const src = read('SessionsTour.tsx');
    assert.match(src, /import\s+\{[^}]*TOUR_STEPS[^}]*\}\s+from\s+'\.\/SessionsView'/);
  });
});

describe('extracted: SpecialistsAuditPanel (v1.10.531)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /export default function SpecialistsAuditPanel/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsAuditPanel\s+from\s+'\.\/SpecialistsAuditPanel'/);
    assert.match(parent, /<SpecialistsAuditPanel\s*\/>/);
  });

  it('owns the audit polling effect (gated on auditOpen)', () => {
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /if \(!auditOpen\) return/);
    assert.match(src, /window\.setInterval\(fetchAudit, 30000\)/);
  });

  it('owns the chain-verify handler', () => {
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /handleVerify/);
    assert.match(src, /\/api\/audit\/verify/);
  });
});

describe('extracted: MeetingsStagesView (v1.10.547)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsStagesView.tsx');
    assert.match(src, /export default function MeetingsStagesView/);
  });

  it('exports the StageView type', () => {
    const src = read('MeetingsStagesView.tsx');
    assert.match(src, /export interface StageView/);
  });

  it('takes stages + transcripts arrays', () => {
    const src = read('MeetingsStagesView.tsx');
    assert.match(src, /stages:\s*StageView\[\]/);
    assert.match(src, /transcripts:\s*Turn\[\]\[\]/);
  });

  it('is imported and rendered by MeetingsView with detail.stages + detail.transcripts', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import MeetingsStagesView,\s*\{\s*type StageView\s*\}\s*from\s*'\.\/MeetingsStagesView'/);
    assert.match(parent, /<MeetingsStagesView\s+stages=\{detail\.stages\}\s+transcripts=\{detail\.transcripts\}/);
  });

  it('parent MeetingsView no longer holds inline StageView interface nor the stages JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /^interface StageView/m);
    assert.doesNotMatch(parent, /detail\.stages\.map\(\(stage, idx\) =>/);
  });
});

describe('extracted: SpecialistsAddPanel (v1.10.546)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /export default function SpecialistsAddPanel/);
  });

  it('takes open / onClose / onAdded props', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAdded:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('owns both Add (POST /specialists) and Propose (POST /specialists/propose) handlers', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /handleAdd/);
    assert.match(src, /handlePropose/);
    assert.match(src, /\/api\/specialists\/propose/);
  });

  it('owns its form / busy / message state internally', () => {
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /useState\(''\)/);
    assert.match(src, /useState\(false\)/);
    assert.match(src, /proposeRejected/);
  });

  it('is imported and rendered by SpecialistsView with onAdded wired to setSelectedId + refresh', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsAddPanel\s+from\s+'\.\/SpecialistsAddPanel'/);
    assert.match(parent, /<SpecialistsAddPanel/);
    assert.match(parent, /setSelectedId\(newId\)/);
  });

  it('parent SpecialistsView no longer holds add/propose state nor handlers', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[addJson, setAddJson\]/);
    assert.doesNotMatch(parent, /const \[proposeBusy, setProposeBusy\]/);
    assert.doesNotMatch(parent, /const handleAdd /);
    assert.doesNotMatch(parent, /const handlePropose /);
  });
});

describe('extracted: SpecialistsSummaryBar (v1.10.545)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /export default function SpecialistsSummaryBar/);
  });

  it('owns its own polling effect (30s tick)', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /window\.setInterval\(fetchSummary, 30000\)/);
  });

  it('hits /api/specialists/summary directly (zero-prop self-fetch)', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /apiGet<OrganismSummary>\('\/api\/specialists\/summary'\)/);
  });

  it('renders nothing when summary fetch has not yet succeeded', () => {
    const src = read('SpecialistsSummaryBar.tsx');
    assert.match(src, /if \(!summary\) return null/);
  });

  it('is imported and rendered by SpecialistsView with no props', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsSummaryBar\s+from\s+'\.\/SpecialistsSummaryBar'/);
    assert.match(parent, /<SpecialistsSummaryBar\s*\/>/);
  });

  it('parent SpecialistsView no longer holds OrganismSummary state', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /interface OrganismSummary/);
    assert.doesNotMatch(parent, /const \[summary, setSummary\]/);
  });
});

describe('extracted: MeetingsForkForm (v1.10.544)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /export default function MeetingsForkForm/);
  });

  it('takes open / meeting / busy / onClose / onForked props', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /meeting:\s*MeetingDetail/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForked:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('owns its own form state (mode / task / title / track / busy / error)', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /useState<'replan' \| 'reuse'>/);
    assert.match(src, /useState<'auto' \| 'lightweight' \| 'standard' \| 'full'>/);
  });

  it('resets on meeting change so form state does not leak across meetings', () => {
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /useEffect/);
    assert.match(src, /\[meeting\.id\]/);
  });

  it('is imported and rendered by MeetingsView with refresh + selectedId callbacks', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsForkForm\s+from\s+'\.\/MeetingsForkForm'/);
    assert.match(parent, /<MeetingsForkForm/);
    assert.match(parent, /onForked=/);
  });

  it('parent MeetingsView no longer holds fork form state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[forkMode, setForkMode\]/);
    assert.doesNotMatch(parent, /const \[forkTask, setForkTask\]/);
    assert.doesNotMatch(parent, /const \[forkTitle, setForkTitle\]/);
    assert.doesNotMatch(parent, /const \[forkBusy, setForkBusy\]/);
    assert.doesNotMatch(parent, /const handleFork/);
  });
});

describe('extracted: MeetingsLineageStrip (v1.10.543)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /export default function MeetingsLineageStrip/);
  });

  it('exports the LineageResponse type', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /export interface LineageResponse/);
  });

  it('takes lineage / currentId / onNavigate props', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /lineage:\s*LineageResponse\s*\|\s*null/);
    assert.match(src, /currentId:\s*string/);
    assert.match(src, /onNavigate:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('renders nothing when depth <= 1 (no ancestry to show)', () => {
    const src = read('MeetingsLineageStrip.tsx');
    assert.match(src, /lineage\.depth <= 1.*return null/s);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import MeetingsLineageStrip,\s*\{\s*type LineageResponse\s*\}\s*from\s*'\.\/MeetingsLineageStrip'/);
    assert.match(parent, /<MeetingsLineageStrip/);
  });

  it('parent MeetingsView no longer holds LineageEntry / LineageResponse', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /^interface LineageEntry/m);
    assert.doesNotMatch(parent, /^interface LineageResponse/m);
  });
});

describe('extracted: MeetingsStuckBanner (v1.10.543)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /export default function MeetingsStuckBanner/);
  });

  it('exports the StuckResponse type', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /export interface StuckResponse/);
  });

  it('takes stuck / onNavigate props', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /stuck:\s*StuckResponse\s*\|\s*null/);
    assert.match(src, /onNavigate:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('renders nothing when count is 0', () => {
    const src = read('MeetingsStuckBanner.tsx');
    assert.match(src, /stuck\.count === 0.*return null/s);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import MeetingsStuckBanner,\s*\{\s*type StuckResponse\s*\}\s*from\s*'\.\/MeetingsStuckBanner'/);
    assert.match(parent, /<MeetingsStuckBanner/);
  });

  it('parent MeetingsView no longer holds inline StuckEntry interface', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /interface StuckEntry/);
  });
});

describe('extracted: MeetingsActionItemsPanel (v1.10.542)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /export default function MeetingsActionItemsPanel/);
  });

  it('exports the ActionItemsResponse type', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /export interface ActionItemsResponse/);
  });

  it('owns its own filter state (4 categories + null)', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /useState<ActionItemType \| null>/);
  });

  it('owns the JSON download + Markdown copy export handlers', () => {
    const src = read('MeetingsActionItemsPanel.tsx');
    assert.match(src, /handleDownloadJson/);
    assert.match(src, /handleCopyMd/);
    assert.match(src, /navigator\.clipboard\.writeText/);
  });

  it('is imported and rendered by MeetingsView with actions + meetingId props', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import MeetingsActionItemsPanel,\s*\{\s*type ActionItemsResponse\s*\}\s*from\s*'\.\/MeetingsActionItemsPanel'/);
    assert.match(parent, /<MeetingsActionItemsPanel\s+actions=\{actions\}\s+meetingId=\{selectedId\}/);
  });

  it('parent MeetingsView no longer holds actionsFilter state nor inline UI', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[actionsFilter, setActionsFilter\]/);
    assert.doesNotMatch(parent, /interface ActionItemsResponse/);
  });
});

describe('extracted: MeetingsRecapPanel (v1.10.541)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /export default function MeetingsRecapPanel/);
  });

  it('exports the RecapResponse type', () => {
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /export interface RecapResponse/);
  });

  it('owns its open/closed state (collapsed by default)', () => {
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /useState\(false\)/);
    assert.match(src, /aria-expanded=\{open\}/);
  });

  it('is imported and rendered by MeetingsView with recap prop', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import MeetingsRecapPanel,\s*\{\s*type RecapResponse\s*\}\s*from\s*'\.\/MeetingsRecapPanel'/);
    assert.match(parent, /<MeetingsRecapPanel\s+recap=\{recap\}\s*\/>/);
  });

  it('parent MeetingsView no longer holds recapOpen state nor RecapResponse type', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[recapOpen, setRecapOpen\]/);
    assert.doesNotMatch(parent, /^interface RecapResponse/m);
    assert.doesNotMatch(parent, /^interface RecapStage/m);
  });
});

describe('extracted: AttachModal (v1.10.540)', () => {
  it('lives in its own file with default export', () => {
    const src = read('AttachModal.tsx');
    assert.match(src, /export default function AttachModal/);
  });

  it('exports its props interface', () => {
    const src = read('AttachModal.tsx');
    assert.match(src, /export interface AttachModalProps/);
  });

  it('imports formatRelative + shortId + help-key constants from SessionsView', () => {
    const src = read('AttachModal.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /formatRelative/);
    assert.match(src, /shortId/);
    assert.match(src, /POST_ATTACH_HELP_TITLE_KEY/);
    assert.match(src, /POST_ATTACH_HELP_ITEM_KEYS/);
  });

  it('is imported by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+AttachModal\s+from\s+'\.\/AttachModal'/);
    assert.match(parent, /<AttachModal/);
  });

  it('parent SessionsView no longer holds the modal definition', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function AttachModal\(\{/);
    assert.doesNotMatch(parent, /interface AttachModalProps/);
  });
});

describe('extracted: NewChatModal (v1.10.539)', () => {
  it('lives in its own file with default export', () => {
    const src = read('NewChatModal.tsx');
    assert.match(src, /export default function NewChatModal/);
  });

  it('exports its props interface (consumed by SessionsView via type)', () => {
    const src = read('NewChatModal.tsx');
    assert.match(src, /export interface NewChatModalProps/);
  });

  it('hosts MODEL_CHOICES + AGENT_CHOICES constants (used only here)', () => {
    const src = read('NewChatModal.tsx');
    assert.match(src, /const MODEL_CHOICES:/);
    assert.match(src, /const AGENT_CHOICES:/);
  });

  it('is imported by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+NewChatModal\s+from\s+'\.\/NewChatModal'/);
    assert.match(parent, /<NewChatModal/);
  });

  it('parent SessionsView no longer holds the modal definition', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function NewChatModal\(/);
    assert.doesNotMatch(parent, /interface NewChatModalProps/);
    assert.doesNotMatch(parent, /const MODEL_CHOICES:/);
  });
});

describe('extracted: MeetingsTemplateEditor (v1.10.538)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsTemplateEditor.tsx');
    assert.match(src, /export default function MeetingsTemplateEditor/);
  });

  it('is a controlled component (open / tpl / onClose / onSaved / onDeleted props)', () => {
    const src = read('MeetingsTemplateEditor.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /tpl:\s*TemplateLike\s*\|\s*null/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onSaved:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDeleted:\s*\(deletedName:\s*string\)\s*=>\s*void/);
  });

  it('is imported and rendered by MeetingsView with all props wired', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsTemplateEditor\s+from\s+'\.\/MeetingsTemplateEditor'/);
    assert.match(parent, /<MeetingsTemplateEditor/);
    assert.match(parent, /open=\{tplEditorOpen\}/);
    assert.match(parent, /tpl=\{tplEditTarget\}/);
    assert.match(parent, /onClose=\{\(\)\s*=>\s*setTplEditorOpen\(false\)\}/);
  });

  it('parent MeetingsView no longer holds template form state', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[tplName, setTplName\]/);
    assert.doesNotMatch(parent, /const \[tplTask, setTplTask\]/);
    assert.doesNotMatch(parent, /const \[tplBusy, setTplBusy\]/);
    assert.doesNotMatch(parent, /const handleTplSave/);
    assert.doesNotMatch(parent, /const handleTplDelete/);
  });
});

describe('extracted: SpecialistsBulkOpsToolbar (v1.10.532)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsBulkOpsToolbar.tsx');
    assert.match(src, /export default function SpecialistsBulkOpsToolbar/);
  });

  it('takes an onChange prop (parent refresh callback)', () => {
    const src = read('SpecialistsBulkOpsToolbar.tsx');
    assert.match(src, /onChange:\s*\(\)\s*=>\s*void\s*\|\s*Promise<void>/);
  });

  it('is imported and rendered by SpecialistsView with onChange wired to refresh', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsBulkOpsToolbar\s+from\s+'\.\/SpecialistsBulkOpsToolbar'/);
    assert.match(parent, /<SpecialistsBulkOpsToolbar\s+onChange=\{refresh\}\s*\/>/);
  });

  it('owns the export / import / audit-rotate handlers', () => {
    const src = read('SpecialistsBulkOpsToolbar.tsx');
    assert.match(src, /handleExport/);
    assert.match(src, /handleImportFile/);
    assert.match(src, /handleImportApply/);
    assert.match(src, /handleAuditRotate/);
  });

  it('parent SpecialistsView no longer holds bulk-ops state', () => {
    // After v1.10.532, the parent must not declare these.
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[exportBusy, setExportBusy\]/);
    assert.doesNotMatch(parent, /const \[rotateBusy, setRotateBusy\]/);
    assert.doesNotMatch(parent, /const \[importPreview, setImportPreview\]/);
  });
});
