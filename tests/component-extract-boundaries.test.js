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

describe('extracted: SessionsListSection (v1.10.579)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsListSection.tsx');
    assert.match(src, /export default function SessionsListSection/);
  });

  it('takes 7 props', () => {
    const src = read('SessionsListSection.tsx');
    assert.match(src, /filteredGroups:\s*SessionGroup\[\]/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /collapsed:\s*Record<string, boolean>/);
    assert.match(src, /onToggleGroup:\s*\(key:\s*string\)\s*=>\s*void/);
    assert.match(src, /selectedSessionId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(sessionId:\s*string\)\s*=>\s*void/);
  });

  it('reuses formatRelative + shortId + SessionGroup from SessionsView', () => {
    const src = read('SessionsListSection.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /formatRelative/);
    assert.match(src, /shortId/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('SessionsListSection.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by SessionsListCard (v1.10.622)', () => {
    const parent = read('SessionsListCard.tsx');
    assert.match(parent, /import\s+SessionsListSection\s+from\s+'\.\/SessionsListSection'/);
    assert.match(parent, /<SessionsListSection/);
  });

  it('parent SessionsView no longer holds the inline grouped list rendering', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /filteredGroups\.map\(\(group\) => \{/);
  });
});

describe('extracted: SessionsAttachedSection (v1.10.578)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsAttachedSection.tsx');
    assert.match(src, /export default function SessionsAttachedSection/);
  });

  it('takes 8 props', () => {
    const src = read('SessionsAttachedSection.tsx');
    assert.match(src, /collapsed:\s*boolean/);
    assert.match(src, /onToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /filtered:\s*AttachedSession\[\]/);
    assert.match(src, /selectedName:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(name:\s*string\)\s*=>\s*void/);
    assert.match(src, /onAttachClick:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDetach:\s*\(name:\s*string\)\s*=>\s*void/);
  });

  it('hosts both SessionsEmptyAttachBanner and SessionsAttachedRowActions', () => {
    const src = read('SessionsAttachedSection.tsx');
    assert.match(src, /import\s+SessionsEmptyAttachBanner/);
    assert.match(src, /import\s+SessionsAttachedRowActions/);
  });

  it('is imported and rendered by SessionsListCard (v1.10.622)', () => {
    const parent = read('SessionsListCard.tsx');
    assert.match(parent, /import\s+SessionsAttachedSection\s+from\s+'\.\/SessionsAttachedSection'/);
    assert.match(parent, /<SessionsAttachedSection/);
  });

  it('parent SessionsView no longer imports the children directly', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /import\s+SessionsEmptyAttachBanner/);
    assert.doesNotMatch(parent, /import\s+SessionsAttachedRowActions/);
  });
});

describe('extracted: SpecialistsList (v1.10.577)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsList.tsx');
    assert.match(src, /export default function SpecialistsList/);
  });

  it('takes 6 props (filtered / error / loading / selectedId / onSelect / flaggedIds)', () => {
    const src = read('SpecialistsList.tsx');
    assert.match(src, /filtered:\s*Specialist\[\]/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(id:\s*string\)\s*=>\s*void/);
    assert.match(src, /flaggedIds:\s*Set<string>/);
  });

  it('reuses TIER_BADGE + Specialist type from SpecialistsView', () => {
    const src = read('SpecialistsList.tsx');
    assert.match(src, /from\s+'\.\/SpecialistsView'/);
    assert.match(src, /TIER_BADGE/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('SpecialistsList.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsList\s+from\s+'\.\/SpecialistsList'/);
    assert.match(parent, /<SpecialistsList/);
  });

  it('parent SpecialistsView no longer holds the inline list rendering', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /filtered\.map\(\(s\) => \{/);
  });
});

describe('extracted: MeetingsList (v1.10.576)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsList.tsx');
    assert.match(src, /export default function MeetingsList/);
  });

  it('takes 7 props (displayList / isSearchMode / searchQuery / error / loading / selectedId / onSelect)', () => {
    const src = read('MeetingsList.tsx');
    assert.match(src, /displayList:\s*MeetingSummary\[\]/);
    assert.match(src, /isSearchMode:\s*boolean/);
    assert.match(src, /searchQuery:\s*string/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('reuses STATUS_BADGE + formatRelative + MeetingSummary from MeetingsView', () => {
    const src = read('MeetingsList.tsx');
    assert.match(src, /from\s+'\.\/MeetingsView'/);
    assert.match(src, /STATUS_BADGE/);
    assert.match(src, /formatRelative/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('MeetingsList.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsList\s+from\s+'\.\/MeetingsList'/);
    assert.match(parent, /<MeetingsList/);
  });

  it('parent MeetingsView no longer holds the inline list rendering', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /displayList\.map\(\(m\) => \{/);
  });
});

describe('extracted: MeetingsListFilterRow (v1.10.575)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsListFilterRow.tsx');
    assert.match(src, /export default function MeetingsListFilterRow/);
  });

  it('takes 4 props (status / track + 2 setters)', () => {
    const src = read('MeetingsListFilterRow.tsx');
    assert.match(src, /status:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /track:\s*Track\s*\|\s*''/);
    assert.match(src, /onStatusChange/);
    assert.match(src, /onTrackChange/);
  });

  it('is a pure controlled-input component (no internal state)', () => {
    const src = read('MeetingsListFilterRow.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsListCardHeader (v1.10.615)', () => {
    const parent = read('MeetingsListCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsListFilterRow\s+from\s+'\.\/MeetingsListFilterRow'/);
    assert.match(parent, /<MeetingsListFilterRow/);
  });

  it('parent MeetingsView no longer holds the inline list filter JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /aria-label=\{t\('meetings\.action\.listFilterStatus'\)\}/);
  });
});

describe('extracted: MeetingsSearchFilterRow (v1.10.574)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchFilterRow.tsx');
    assert.match(src, /export default function MeetingsSearchFilterRow/);
  });

  it('takes 8 props (status / track / since / until + 4 setters)', () => {
    const src = read('MeetingsSearchFilterRow.tsx');
    assert.match(src, /status:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /onStatusChange/);
    assert.match(src, /track:\s*Track\s*\|\s*''/);
    assert.match(src, /since:\s*string/);
    assert.match(src, /until:\s*string/);
    assert.match(src, /onSinceChange/);
    assert.match(src, /onUntilChange/);
  });

  it('is a pure controlled-input component (no internal state)', () => {
    const src = read('MeetingsSearchFilterRow.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsSearchSection (v1.10.613)', () => {
    const parent = read('MeetingsSearchSection.tsx');
    assert.match(parent, /import\s+MeetingsSearchFilterRow\s+from\s+'\.\/MeetingsSearchFilterRow'/);
    assert.match(parent, /<MeetingsSearchFilterRow/);
  });

  it('parent MeetingsView no longer holds the inline filter row JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /searchSince\}\s*\n\s*onChange=/);
    assert.doesNotMatch(parent, /searchUntil\}\s*\n\s*onChange=/);
  });
});

describe('extracted: MeetingsSearchFacets (v1.10.573)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchFacets.tsx');
    assert.match(src, /export default function MeetingsSearchFacets/);
  });

  it('takes 7 props (counts + facets + selected status/track + toggle callbacks)', () => {
    const src = read('MeetingsSearchFacets.tsx');
    assert.match(src, /resultCount:\s*number/);
    assert.match(src, /total:\s*number\s*\|\s*null/);
    assert.match(src, /facets:\s*SearchFacets/);
    assert.match(src, /selectedStatus:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /onStatusToggle/);
    assert.match(src, /onTrackToggle/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('MeetingsSearchFacets.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by MeetingsSearchSection (v1.10.613)', () => {
    const parent = read('MeetingsSearchSection.tsx');
    assert.match(parent, /import\s+MeetingsSearchFacets/);
    assert.match(parent, /<MeetingsSearchFacets/);
  });

  it('parent MeetingsView no longer holds the inline facets JSX', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /facets\.status\}\s*&&\s*Object\.keys/);
  });
});

describe('extracted: worker-classify lib (v1.10.572)', () => {
  it('lives in lib/worker-classify.ts with all 4 helpers exported', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'worker-classify.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export function isInterventionActive/);
    assert.match(src, /export function mapWorkerStatusToBadgeVariant/);
    assert.match(src, /export function statusLabel/);
    assert.match(src, /export function groupOf/);
  });

  it('isInterventionActive handles the v8.21 string-enum form', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'worker-classify.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /typeof w\.intervention === 'string'/);
    assert.match(src, /'approval_pending'/);
  });

  it('is imported by WorkerList', () => {
    const parent = read('WorkerList.tsx');
    assert.match(parent, /from\s+'\.\.\/lib\/worker-classify'/);
    assert.match(parent, /isInterventionActive/);
    assert.match(parent, /groupOf/);
  });

  it('is imported by HierarchyTree (bug fix: no longer drifts on string enum)', () => {
    const parent = read('HierarchyTree.tsx');
    assert.match(parent, /from\s+'\.\.\/lib\/worker-classify'/);
    assert.match(parent, /isInterventionActive/);
  });

  it('parents no longer hold inline duplicates', () => {
    const wl = read('WorkerList.tsx');
    const ht = read('HierarchyTree.tsx');
    assert.doesNotMatch(wl, /^function isInterventionActive/m);
    assert.doesNotMatch(wl, /^function groupOf/m);
    assert.doesNotMatch(ht, /^function isInterventionActive/m);
    assert.doesNotMatch(ht, /^function statusLabel/m);
    assert.doesNotMatch(ht, /^function statusVariant/m);
  });
});

describe('extracted: AutonomousDigestMetrics (v1.10.570)', () => {
  it('lives in its own file with default export', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.match(src, /export default function AutonomousDigestMetrics/);
  });

  it('takes a digest prop typed as DigestResponse', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.match(src, /digest:\s*DigestResponse/);
  });

  it('owns its fmtDuration helper internally', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.match(src, /function fmtDuration/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('AutonomousDigestMetrics.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by AutonomousView', () => {
    const parent = read('AutonomousView.tsx');
    assert.match(parent, /import\s+AutonomousDigestMetrics\s+from\s+'\.\/AutonomousDigestMetrics'/);
    assert.match(parent, /<AutonomousDigestMetrics\s+digest=\{digest\}/);
  });

  it('parent AutonomousView no longer holds the inline metrics grid nor fmtDuration', () => {
    const parent = read('AutonomousView.tsx');
    assert.doesNotMatch(parent, /^function fmtDuration/m);
    assert.doesNotMatch(parent, /grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4/);
  });
});

describe('extracted: WorkflowNodeProperties (v1.10.569)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.match(src, /export default function WorkflowNodeProperties/);
  });

  it('takes a single node prop typed as WorkflowNode | null', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.match(src, /node:\s*WorkflowNode\s*\|\s*null/);
  });

  it('imports TYPE_FILL from WorkflowGraph', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.match(src, /import\s+\{\s*TYPE_FILL\s*\}\s+from\s+'\.\/WorkflowGraph'/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('WorkflowNodeProperties.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowNodeProperties\s+from\s+'\.\/WorkflowNodeProperties'/);
    assert.match(parent, /<WorkflowNodeProperties\s+node=\{selectedNode\}/);
  });

  it('parent WorkflowEditor no longer holds the inline component', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /function NodeProperties\(/);
  });
});

describe('extracted: RiskRuleCatalogPanel (v1.10.568)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /export default function RiskRuleCatalogPanel/);
  });

  it('owns its own open / filter / patterns state', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /useState<PatternsResponse \| null>/);
    assert.match(src, /useState\(''\)/);
    assert.match(src, /useState\(false\)/);
  });

  it('lazy-fetches /api/risk/patterns only when opened', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /if \(!open \|\| patterns\) return/);
    assert.match(src, /\/api\/risk\/patterns/);
  });

  it('renders nothing when collapsed (button only)', () => {
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /aria-expanded=\{open\}/);
  });

  it('is imported and rendered by Risk page (zero-prop)', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx');
    const parent = fs.readFileSync(file, 'utf8');
    assert.match(parent, /import\s+RiskRuleCatalogPanel\s+from\s+'\.\.\/components\/RiskRuleCatalogPanel'/);
    assert.match(parent, /<RiskRuleCatalogPanel\s*\/>/);
  });

  it('parent Risk page no longer holds patterns state nor PatternsResponse type', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx');
    const parent = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(parent, /const \[patterns, setPatterns\]/);
    assert.doesNotMatch(parent, /interface PatternsResponse/);
  });
});

describe('extracted: WorkerListGroupHeader (v1.10.567)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerListGroupHeader.tsx');
    assert.match(src, /export default function WorkerListGroupHeader/);
  });

  it('takes open / onToggle / label / count / icon / accent props', () => {
    const src = read('WorkerListGroupHeader.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /icon:\s*'crown'\s*\|\s*'wrench'/);
    assert.match(src, /accent:\s*'primary'\s*\|\s*'muted'/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('WorkerListGroupHeader.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is rendered at >= 2 call sites by WorkerList (managers + workers)', () => {
    const parent = read('WorkerList.tsx');
    assert.match(parent, /import\s+WorkerListGroupHeader\s+from\s+'\.\/WorkerListGroupHeader'/);
    const calls = parent.match(/<WorkerListGroupHeader/g) || [];
    assert.ok(calls.length >= 2, `expected >= 2 call sites, saw ${calls.length}`);
  });

  it('parent WorkerList no longer holds the header definition', () => {
    const parent = read('WorkerList.tsx');
    assert.doesNotMatch(parent, /function GroupHeader\(/);
    assert.doesNotMatch(parent, /interface GroupHeaderProps/);
  });
});

describe('extracted: ConversationTurns (v1.10.566)', () => {
  it('lives in its own file with default-exported TurnRow', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /export default function TurnRow/);
  });

  it('contains all six turn renderers (User / Assistant / Thinking / ToolUse / ToolResult / System)', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /function UserTurn/);
    assert.match(src, /function AssistantTurn/);
    assert.match(src, /function ThinkingTurn/);
    assert.match(src, /function ToolUseTurn/);
    assert.match(src, /function ToolResultTurn/);
    assert.match(src, /function SystemTurn/);
  });

  it('contains the RoleHeader sub-component', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /function RoleHeader/);
  });

  it('reuses the conversation-render lib helpers', () => {
    const src = read('ConversationTurns.tsx');
    assert.match(src, /from\s+'\.\.\/lib\/conversation-render'/);
  });

  it('is imported by ConversationView (just the default)', () => {
    const parent = read('ConversationView.tsx');
    assert.match(parent, /import\s+TurnRow\s+from\s+'\.\/ConversationTurns'/);
  });

  it('parent ConversationView no longer holds the turn renderers', () => {
    const parent = read('ConversationView.tsx');
    assert.doesNotMatch(parent, /^function UserTurn/m);
    assert.doesNotMatch(parent, /^function AssistantTurn/m);
    assert.doesNotMatch(parent, /^function ThinkingTurn/m);
    assert.doesNotMatch(parent, /^function ToolUseTurn/m);
    assert.doesNotMatch(parent, /^function ToolResultTurn/m);
    assert.doesNotMatch(parent, /^function SystemTurn/m);
    assert.doesNotMatch(parent, /^function TurnRow/m);
    assert.doesNotMatch(parent, /^function RoleHeader/m);
  });
});

describe('extracted: HistoryDetailPane (v1.10.564)', () => {
  it('lives in its own file with default export', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.match(src, /export default function HistoryDetailPane/);
  });

  it('owns formatDate + recordStatusVariant helpers', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.match(src, /function formatDate/);
    assert.match(src, /function recordStatusVariant/);
  });

  it('takes a detail prop typed as HistoryWorkerDetail', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.match(src, /detail:\s*HistoryWorkerDetail/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('HistoryDetailPane.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('is imported and rendered by HistoryView', () => {
    const parent = read('HistoryView.tsx');
    assert.match(parent, /import\s+HistoryDetailPane\s+from\s+'\.\/HistoryDetailPane'/);
    assert.match(parent, /<HistoryDetailPane\s+detail=\{detail\}/);
  });

  it('parent HistoryView no longer holds the detail-pane definition or its helpers', () => {
    const parent = read('HistoryView.tsx');
    assert.doesNotMatch(parent, /function HistoryDetailPane\(/);
    assert.doesNotMatch(parent, /^function formatDate/m);
    assert.doesNotMatch(parent, /^function recordStatusVariant/m);
  });
});

describe('extracted: chat-helpers lib (v1.10.563)', () => {
  it('lives in lib/chat-helpers.ts', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'chat-helpers.ts');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export function stripAnsi/);
    assert.match(src, /export function b64decode/);
    assert.match(src, /export function makeId/);
    assert.match(src, /export function formatTime/);
    assert.match(src, /export function conversationToMessages/);
    assert.match(src, /export function scrollbackToMessages/);
    assert.match(src, /export type Role/);
    assert.match(src, /export type Source/);
    assert.match(src, /export interface ChatMessage/);
    assert.match(src, /export interface ConversationShape/);
  });

  it('is imported by ChatView (typed names + functions)', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /from\s+'\.\.\/lib\/chat-helpers'/);
    assert.match(parent, /stripAnsi/);
    assert.match(parent, /b64decode/);
    assert.match(parent, /conversationToMessages/);
    assert.match(parent, /scrollbackToMessages/);
  });

  it('parent ChatView re-exports the public API for legacy tests', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /export\s+\{[\s\S]*stripAnsi[\s\S]*b64decode[\s\S]*conversationToMessages[\s\S]*scrollbackToMessages[\s\S]*\}\s+from\s+'\.\.\/lib\/chat-helpers'/);
  });

  it('parent ChatView no longer holds inline definitions', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /^export function stripAnsi/m);
    assert.doesNotMatch(parent, /^export function b64decode/m);
    assert.doesNotMatch(parent, /^function makeId/m);
    assert.doesNotMatch(parent, /^function formatTime/m);
    assert.doesNotMatch(parent, /^export function conversationToMessages/m);
    assert.doesNotMatch(parent, /^export function scrollbackToMessages/m);
  });
});

describe('extracted: WorkflowGraph (v1.10.562)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /export default function WorkflowGraph/);
  });

  it('exports the TYPE_FILL palette (reused by NodeProperties)', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /export const TYPE_FILL/);
  });

  it('contains layoutWorkflow, NodeBox, EdgeLine helpers', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /function layoutWorkflow/);
    assert.match(src, /function NodeBox/);
    assert.match(src, /function EdgeLine/);
  });

  it('takes workflow / selectedNode / onSelectNode props', () => {
    const src = read('WorkflowGraph.tsx');
    assert.match(src, /workflow:\s*Workflow/);
    assert.match(src, /selectedNode:\s*string\s*\|\s*null/);
    assert.match(src, /onSelectNode:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    // (v1.10.569) NodeProperties extracted; the TYPE_FILL named
    // import moved with it to WorkflowNodeProperties.
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowGraph\s+from\s+'\.\/WorkflowGraph'/);
    assert.match(parent, /<WorkflowGraph/);
    // TYPE_FILL is still exported and still consumed — but now by
    // the extracted WorkflowNodeProperties (not the parent).
    const props = read('WorkflowNodeProperties.tsx');
    assert.match(props, /import\s+\{\s*TYPE_FILL\s*\}\s+from\s+'\.\/WorkflowGraph'/);
  });

  it('parent WorkflowEditor no longer holds the graph helpers', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /^function layoutWorkflow/m);
    assert.doesNotMatch(parent, /^function NodeBox/m);
    assert.doesNotMatch(parent, /^function EdgeLine/m);
    assert.doesNotMatch(parent, /^const NODE_W/m);
    assert.doesNotMatch(parent, /^const TYPE_FILL/m);
  });
});

describe('extracted: StatusMessageCard (v1.10.561)', () => {
  it('lives in its own file with default export', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /export default function StatusMessageCard/);
  });

  it('takes workerName + onToast props', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /onToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
  });

  it('owns message + sending state internally', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /useState\(''\)/);
    assert.match(src, /useState\(false\)/);
  });

  it('POSTs to /api/status-update with {worker, message}', () => {
    const src = read('StatusMessageCard.tsx');
    assert.match(src, /\/api\/status-update/);
    assert.match(src, /worker:\s*workerName/);
    assert.match(src, /message:\s*text/);
  });

  it('is imported and rendered by ControlPanel', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /import\s+StatusMessageCard\s+from\s+'\.\/StatusMessageCard'/);
    assert.match(parent, /<StatusMessageCard/);
  });

  it('parent ControlPanel no longer holds the card definition', () => {
    const parent = read('ControlPanel.tsx');
    assert.doesNotMatch(parent, /function StatusMessageCard\(/);
  });
});

describe('extracted: conversation-render lib (v1.10.560)', () => {
  it('lives in lib/conversation-render.tsx', () => {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', 'web', 'src', 'lib', 'conversation-render.tsx');
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /export function renderMarkdown/);
    assert.match(src, /export function renderInline/);
    assert.match(src, /export function truncate/);
    assert.match(src, /export function formatTime/);
    assert.match(src, /export function formatTokens/);
    assert.match(src, /export function formatToolArgs/);
    assert.match(src, /export function formatToolResult/);
  });

  it('is imported by ConversationTurns (no inline duplicates)', () => {
    // (v1.10.566) The render helpers moved with the turn renderers
    // when ConversationTurns.tsx was extracted. ConversationView
    // no longer references them directly.
    const turns = read('ConversationTurns.tsx');
    assert.match(turns, /from\s+'\.\.\/lib\/conversation-render'/);
    assert.match(turns, /renderMarkdown/);
    assert.match(turns, /formatTokens/);
  });

  it('parent ConversationView no longer holds the helper definitions', () => {
    const parent = read('ConversationView.tsx');
    assert.doesNotMatch(parent, /^function renderMarkdown/m);
    assert.doesNotMatch(parent, /^function renderInline/m);
    assert.doesNotMatch(parent, /^function truncate/m);
    assert.doesNotMatch(parent, /^function formatTime/m);
    assert.doesNotMatch(parent, /^function formatTokens/m);
    assert.doesNotMatch(parent, /^function formatToolArgs/m);
    assert.doesNotMatch(parent, /^function formatToolResult/m);
  });
});

describe('extracted: SpecialistsTagEditor (v1.10.559)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /export default function SpecialistsTagEditor/);
  });

  it('takes specialistId / tags / onSaved / onError props', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /specialistId:\s*string/);
    assert.match(src, /tags:\s*string\[\]\s*\|\s*undefined/);
    assert.match(src, /onSaved:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onError:\s*\(msg:\s*string\)\s*=>\s*void/);
  });

  it('owns open / value / busy state internally', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /useState\(false\)/);
    assert.match(src, /useState\(''\)/);
  });

  it('infers add (+...) / remove (-...) / replace from leading char', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /raw\.startsWith\('\+'\)/);
    assert.match(src, /raw\.startsWith\('-'\)/);
    assert.match(src, /'replace' \| 'add' \| 'remove'/);
  });

  it('guards against accidental clear (empty replace)', () => {
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /next\.length === 0 && mode === 'replace'/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsTagEditor\s+from\s+'\.\/SpecialistsTagEditor'/);
    assert.match(parent, /<SpecialistsTagEditor/);
  });

  it('parent SpecialistsView no longer holds tag-edit state nor handler', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[tagEditOpen, setTagEditOpen\]/);
    assert.doesNotMatch(parent, /const handleTagEdit/);
  });
});

describe('extracted: SpecialistsPromptPanel (v1.10.558)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /export default function SpecialistsPromptPanel/);
  });

  it('takes specialistId + systemPrompt props', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /specialistId:\s*string/);
    assert.match(src, /systemPrompt:\s*string/);
  });

  it('owns suggest + apply state internally', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /const \[suggestBusy, setSuggestBusy\]/);
    assert.match(src, /const \[suggestion, setSuggestion\]/);
    assert.match(src, /const \[applyBusy, setApplyBusy\]/);
    assert.match(src, /const \[applyResult, setApplyResult\]/);
  });

  it('owns the suggest-prompt and prompt-apply POST handlers', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /handleSuggest/);
    assert.match(src, /handleApply/);
    assert.match(src, /\/suggest-prompt/);
    assert.match(src, /\/prompt-apply/);
  });

  it('confirms apply (destructive — replaces systemPrompt)', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /window\.confirm\(t\('specialists\.applyConfirm'\)\)/);
  });

  it('resets state on specialistId change', () => {
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /\[specialistId\]/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsPromptPanel\s+from\s+'\.\/SpecialistsPromptPanel'/);
    assert.match(parent, /<SpecialistsPromptPanel/);
  });

  it('parent SpecialistsView no longer holds suggest/apply state nor handlers', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /const \[suggestBusy, setSuggestBusy\]/);
    assert.doesNotMatch(parent, /const \[applyBusy, setApplyBusy\]/);
    assert.doesNotMatch(parent, /const handleSuggest/);
    assert.doesNotMatch(parent, /const handleApply/);
    assert.doesNotMatch(parent, /interface ApplyResult/);
  });
});

describe('extracted: MeetingsComposer (v1.10.557)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /export default function MeetingsComposer/);
  });

  it('takes open / onClose / onCreated props', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onCreated:\s*\(newMeetingId:\s*string\)\s*=>\s*void/);
  });

  it('owns the full composer state internally', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /const \[newTask, setNewTask\]/);
    assert.match(src, /const \[newTrack, setNewTrack\]/);
    assert.match(src, /const \[templateName, setTemplateName\]/);
    assert.match(src, /const \[templateVars, setTemplateVars\]/);
    // (v1.10.647) classifyPreview moved to useMeetingClassifyPreview hook.
    // (v1.10.648) previewPlan/previewBusy moved to useMeetingPreviewPlan hook.
    // (v1.10.649) templates/loadTemplates moved to useMeetingTemplates hook.
    assert.match(src, /useMeetingClassifyPreview/);
    assert.match(src, /useMeetingPreviewPlan/);
    assert.match(src, /useMeetingTemplates/);
  });

  it('owns the handleCreate POST + the two debounced preview effects', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /handleCreate/);
    // (v1.10.647) classify-track call lives in its hook.
    // (v1.10.648) plan call lives in its hook.
    const fs = require('fs');
    const path = require('path');
    const classifySrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-classify-preview.ts'),
      'utf8',
    );
    const planSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-preview-plan.ts'),
      'utf8',
    );
    assert.match(classifySrc, /\/api\/meetings\/classify-track/);
    assert.match(planSrc, /\/api\/meetings\/plan/);
  });

  it('embeds MeetingsTemplateEditor (not in parent any more)', () => {
    const src = read('MeetingsComposer.tsx');
    assert.match(src, /import\s+MeetingsTemplateEditor\s+from\s+'\.\/MeetingsTemplateEditor'/);
    assert.match(src, /<MeetingsTemplateEditor/);
  });

  it('is imported and rendered by MeetingsListCardHeader (v1.10.615)', () => {
    const parent = read('MeetingsListCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsComposer\s+from\s+'\.\/MeetingsComposer'/);
    assert.match(parent, /<MeetingsComposer/);
  });

  it('parent MeetingsView no longer holds composer state, handleCreate, preview effects', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[newTask, setNewTask\]/);
    assert.doesNotMatch(parent, /const \[templateName, setTemplateName\]/);
    assert.doesNotMatch(parent, /const \[previewPlan, setPreviewPlan\]/);
    assert.doesNotMatch(parent, /const handleCreate/);
    assert.doesNotMatch(parent, /\/api\/meetings\/classify-track/);
  });
});

describe('extracted: MeetingsRunControls (v1.10.556)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /export default function MeetingsRunControls/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns brain / busy / error state internally', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /useState<'mock' \| 'claude'>/);
  });

  it('owns the /run POST with autoFinalize: true', () => {
    const src = read('MeetingsRunControls.tsx');
    assert.match(src, /\/run/);
    assert.match(src, /autoFinalize:\s*true/);
  });

  it('is imported and rendered by MeetingsDetailPendingActions (v1.10.595)', () => {
    const parent = read('MeetingsDetailPendingActions.tsx');
    assert.match(parent, /import\s+MeetingsRunControls\s+from\s+'\.\/MeetingsRunControls'/);
    assert.match(parent, /<MeetingsRunControls\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds run state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[runBusy, setRunBusy\]/);
    assert.doesNotMatch(parent, /const \[runBrain, setRunBrain\]/);
    assert.doesNotMatch(parent, /const handleRun/);
  });
});

describe('extracted: MeetingsStateActions (v1.10.555)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /export default function MeetingsStateActions/);
  });

  it('takes meetingId + mode props (pending | in-progress)', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /mode:\s*'pending'\s*\|\s*'in-progress'/);
  });

  it('owns busy state typed by Action union', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /useState<Action \| null>/);
  });

  it('confirm-prompts escalate + abort before firing', () => {
    const src = read('MeetingsStateActions.tsx');
    assert.match(src, /'escalate', t\('meetings\.escalateConfirm'\)/);
    assert.match(src, /'abort', t\('meetings\.abortConfirm'\)/);
  });

  it('is rendered at 2 sites — pending in MeetingsDetailPendingActions, in-progress in MeetingsDetailInProgressActions (v1.10.595)', () => {
    const pending = read('MeetingsDetailPendingActions.tsx');
    assert.match(pending, /import\s+MeetingsStateActions\s+from\s+'\.\/MeetingsStateActions'/);
    assert.match(pending, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="pending"/);
    const inProgress = read('MeetingsDetailInProgressActions.tsx');
    assert.match(inProgress, /import\s+MeetingsStateActions\s+from\s+'\.\/MeetingsStateActions'/);
    assert.match(inProgress, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="in-progress"/);
  });

  it('parent MeetingsView no longer holds state-action handler nor state', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[stateBusy, setStateBusy\]/);
    assert.doesNotMatch(parent, /const handleStateAction/);
  });
});

describe('extracted: MeetingsPeerRetroControls (v1.10.554)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /export default function MeetingsPeerRetroControls/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns brain selector state (mock | claude)', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /useState<'mock' \| 'claude'>/);
  });

  it('owns the peer-retro POST handler', () => {
    const src = read('MeetingsPeerRetroControls.tsx');
    assert.match(src, /handlePeerRetro/);
    assert.match(src, /\/peer-retro/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    // (v1.10.593) Moved into MeetingsDetailCompletedActions sibling
    // along with MeetingsPublishControls / MeetingsRetroActions /
    // MeetingsForkForm.
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsPeerRetroControls\s+from\s+'\.\/MeetingsPeerRetroControls'/);
    assert.match(parent, /<MeetingsPeerRetroControls\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds peer-retro state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[peerRetroBusy, setPeerRetroBusy\]/);
    assert.doesNotMatch(parent, /const \[peerBrain, setPeerBrain\]/);
    assert.doesNotMatch(parent, /const handlePeerRetro/);
  });
});

describe('extracted: MeetingsPublishControls (v1.10.553)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /export default function MeetingsPublishControls/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns its own busy / msg / failed / git-toggle state', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /const \[busy, setBusy\]/);
    assert.match(src, /const \[gitCommit, setGitCommit\]/);
    assert.match(src, /const \[gitPush, setGitPush\]/);
  });

  it('owns the publish POST handler with includeRetro + apply + git toggles', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /handlePublish/);
    assert.match(src, /includeRetro:\s*true/);
    assert.match(src, /apply:\s*true/);
    assert.match(src, /\/api\/meetings\//);
  });

  it('gitPush check forces gitCommit on (and gitCommit off forces gitPush off)', () => {
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /if \(!e\.target\.checked\) setGitPush\(false\)/);
    assert.match(src, /if \(e\.target\.checked\) setGitCommit\(true\)/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsPublishControls\s+from\s+'\.\/MeetingsPublishControls'/);
    assert.match(parent, /<MeetingsPublishControls\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds publish state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[publishBusy, setPublishBusy\]/);
    assert.doesNotMatch(parent, /const \[publishGitCommit, setPublishGitCommit\]/);
    assert.doesNotMatch(parent, /const handlePublish/);
  });
});

describe('extracted: MeetingsRetroActions (v1.10.552)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /export default function MeetingsRetroActions/);
  });

  it('takes meetingId prop', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns its own busy / result / error state', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /useState<'preview' \| 'finalize' \| null>/);
    assert.match(src, /useState<RetroResult \| null>/);
  });

  it('owns the retro / finalize POST handler (toggles by finalize: boolean)', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /handleRetro = useCallback/);
    assert.match(src, /finalize \? 'finalize' : 'retro'/);
  });

  it('resets on meetingId change', () => {
    const src = read('MeetingsRetroActions.tsx');
    assert.match(src, /\[meetingId\]/);
  });

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    const parent = read('MeetingsDetailCompletedActions.tsx');
    assert.match(parent, /import\s+MeetingsRetroActions\s+from\s+'\.\/MeetingsRetroActions'/);
    assert.match(parent, /<MeetingsRetroActions\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds retro state nor handler', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[retroBusy, setRetroBusy\]/);
    assert.doesNotMatch(parent, /const \[retroResult, setRetroResult\]/);
    assert.doesNotMatch(parent, /const handleRetro/);
  });
});

describe('extracted: MeetingsContributePanel (v1.10.551)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /export default function MeetingsContributePanel/);
  });

  it('takes open + meetingId props', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns its full form state internally', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /const \[specialist, setSpecialist\]/);
    assert.match(src, /const \[text, setText\]/);
    assert.match(src, /const \[vote, setVote\]/);
    assert.match(src, /const \[reason, setReason\]/);
  });

  it('owns both /contribute (with body) and /vote (vote-only) handlers', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /handleContribute/);
    assert.match(src, /handleVoteOnly/);
    assert.match(src, /\/contribute/);
    assert.match(src, /\/vote/);
  });

  it('resets form on meetingId change so state does not leak across meetings', () => {
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /\[meetingId\]/);
  });

  it('is imported and rendered by MeetingsDetailInProgressActions (v1.10.594)', () => {
    const parent = read('MeetingsDetailInProgressActions.tsx');
    assert.match(parent, /import\s+MeetingsContributePanel\s+from\s+'\.\/MeetingsContributePanel'/);
    assert.match(parent, /<MeetingsContributePanel\s+open=\{contribOpen\}\s+meetingId=\{meetingId\}/);
  });

  it('parent MeetingsView no longer holds contribute form state nor handlers', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[contribSpecialist, setContribSpecialist\]/);
    assert.doesNotMatch(parent, /const \[contribText, setContribText\]/);
    assert.doesNotMatch(parent, /const handleContribute/);
    assert.doesNotMatch(parent, /const handleVoteOnly/);
  });
});

describe('extracted: SessionsAttachedRowActions (v1.10.550)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /export default function SessionsAttachedRowActions/);
  });

  it('owns the copyToClipboard + attachedRoleStyle helpers', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /function copyToClipboard\(text: string\)/);
    assert.match(src, /function attachedRoleStyle\(role: AttachedRole/);
  });

  it('owns the AttachProcessState type internally', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /type AttachProcessState/);
  });

  it('owns its 4 internal state pieces (showResume / showDetachConfirm / copied / procState)', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /useState\(false\)/);
    assert.match(src, /useState<AttachProcessState>/);
  });

  it('polls /api/attach/<name>/process every 30s while mounted', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /window\.setInterval\(poll, 30000\)/);
    assert.match(src, /\/api\/attach\/\$\{encodeURIComponent\(session\.name\)\}\/process/);
  });

  it('takes session / isSelected / onView / onDetach props', () => {
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /session:\s*AttachedSession/);
    assert.match(src, /isSelected:\s*boolean/);
    assert.match(src, /onView:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDetach:\s*\(\)\s*=>\s*void/);
  });

  it('is imported by SessionsAttachedSection (since v1.10.578)', () => {
    // v1.10.578 wrapped the row in SessionsAttachedSection — that's
    // where the rendering now happens.
    const parent = read('SessionsAttachedSection.tsx');
    assert.match(parent, /import\s+SessionsAttachedRowActions\s+from\s+'\.\/SessionsAttachedRowActions'/);
    assert.match(parent, /<SessionsAttachedRowActions/);
  });

  it('parent SessionsView no longer holds the component definition or its helpers', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function AttachedRowActions\(/);
    assert.doesNotMatch(parent, /function copyToClipboard\b/);
    assert.doesNotMatch(parent, /function attachedRoleStyle\b/);
    assert.doesNotMatch(parent, /interface AttachedRowActionsProps/);
  });
});

describe('extracted: SessionsEmptyAttachBanner (v1.10.549)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsEmptyAttachBanner.tsx');
    assert.match(src, /export default function SessionsEmptyAttachBanner/);
  });

  it('takes onAttachClick prop', () => {
    const src = read('SessionsEmptyAttachBanner.tsx');
    assert.match(src, /onAttachClick:\s*\(\)\s*=>\s*void/);
  });

  it('reuses EMPTY_ATTACH_* key constants from SessionsView', () => {
    const src = read('SessionsEmptyAttachBanner.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /EMPTY_ATTACH_BANNER_TITLE_KEY/);
    assert.match(src, /EMPTY_ATTACH_BANNER_BODY_KEY/);
  });

  it('is imported by SessionsAttachedSection (since v1.10.578)', () => {
    const parent = read('SessionsAttachedSection.tsx');
    assert.match(parent, /import\s+SessionsEmptyAttachBanner\s+from\s+'\.\/SessionsEmptyAttachBanner'/);
    assert.match(parent, /<SessionsEmptyAttachBanner/);
  });
});

describe('extracted: SessionsComparisonCard (v1.10.549)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsComparisonCard.tsx');
    assert.match(src, /export default function SessionsComparisonCard/);
  });

  it('reuses COMPARISON_* key constants from SessionsView', () => {
    const src = read('SessionsComparisonCard.tsx');
    assert.match(src, /from\s+'\.\/SessionsView'/);
    assert.match(src, /COMPARISON_TITLE_KEY/);
    assert.match(src, /COMPARISON_ROW_KEYS/);
  });

  it('is rendered at >= 2 call sites combined (SessionsRightPane + SessionsEmptyPanel)', () => {
    // (v1.10.601) ComparisonCard's empty-pane site moved to
    // SessionsEmptyPanel.
    // (v1.10.607) ComparisonCard's attached-pane site moved to
    // SessionsRightPane. Count all containers to lock the
    // original "2+ usages" invariant.
    const right = read('SessionsRightPane.tsx');
    const empty = read('SessionsEmptyPanel.tsx');
    assert.match(right, /import\s+SessionsComparisonCard\s+from\s+'\.\/SessionsComparisonCard'/);
    assert.match(empty, /import\s+SessionsComparisonCard\s+from\s+'\.\/SessionsComparisonCard'/);
    const rightCalls = right.match(/<SessionsComparisonCard/g) || [];
    const emptyCalls = empty.match(/<SessionsComparisonCard/g) || [];
    const total = rightCalls.length + emptyCalls.length;
    assert.ok(
      total >= 2,
      `expected >= 2 call sites combined, saw ${total} (right=${rightCalls.length}, empty=${emptyCalls.length})`,
    );
  });

  it('parent SessionsView no longer holds the inline component definition', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /function ComparisonCard\(/);
    assert.doesNotMatch(parent, /function EmptyAttachBanner\(/);
  });
});

describe('extracted: MeetingsDetailHeader (v1.10.548)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailHeader.tsx');
    assert.match(src, /export default function MeetingsDetailHeader/);
  });

  it('is a pure-display component (no state, no effects)', () => {
    const src = read('MeetingsDetailHeader.tsx');
    assert.doesNotMatch(src, /useState/);
    assert.doesNotMatch(src, /useEffect/);
  });

  it('takes status / track / currentStage / currentRound / task props', () => {
    const src = read('MeetingsDetailHeader.tsx');
    assert.match(src, /status:\s*MeetingStatus/);
    assert.match(src, /currentStage:\s*string\s*\|\s*null/);
    assert.match(src, /currentRound:\s*number/);
  });

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import\s+MeetingsDetailHeader\s+from\s+'\.\/MeetingsDetailHeader'/);
    assert.match(parent, /<MeetingsDetailHeader/);
    assert.match(parent, /status=\{detail\.status\}/);
    assert.match(parent, /task=\{detail\.task\}/);
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

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
    assert.match(parent, /import\s+MeetingsStagesView\s+from\s+'\.\/MeetingsStagesView'/);
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

  it('is imported and rendered by SpecialistsListTitleBar (v1.10.617); parent owns onAdded wiring', () => {
    const parent = read('SpecialistsView.tsx');
    const titleBar = read('SpecialistsListTitleBar.tsx');
    assert.match(titleBar, /import\s+SpecialistsAddPanel\s+from\s+'\.\/SpecialistsAddPanel'/);
    assert.match(titleBar, /<SpecialistsAddPanel/);
    // Parent still wires the onAdded callback through to setSelectedId+refresh.
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

  it('is imported and rendered by MeetingsDetailCompletedActions (v1.10.593)', () => {
    const parent = read('MeetingsDetailCompletedActions.tsx');
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

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
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

  it('is imported and rendered by MeetingsView; type re-import dropped (v1.10.627)', () => {
    // (v1.10.627) StuckResponse type now consumed by useStuckMeetings;
    // the parent only needs the default import.
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsStuckBanner\s+from\s+'\.\/MeetingsStuckBanner'/);
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

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
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

  it('is imported and rendered by MeetingsDetailBody (v1.10.596)', () => {
    const parent = read('MeetingsDetailBody.tsx');
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

  it('is imported and rendered by MeetingsComposer with all props wired', () => {
    // (v1.10.557) Composer extracted; the template editor now lives
    // inside it (not directly in MeetingsView).
    const parent = read('MeetingsComposer.tsx');
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

describe('extracted: useAuthState hook (v1.10.669)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-auth-state.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'App.tsx');

  it('exports the hook + AuthState type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAuthState/);
    assert.match(src, /export type AuthState\s*=\s*'loading'\s*\|\s*'anon'\s*\|\s*'authed'\s*\|\s*'disabled'/);
  });

  it('subscribes to AUTH_EVENT for token-expiry → anon flips', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.addEventListener\(AUTH_EVENT,\s*onExpired\)/);
    assert.match(src, /onExpired = \(\) => setAuthState\('anon'\)/);
  });

  it('queries fetchAuthStatus + getToken on mount and routes the four states', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /fetchAuthStatus\(\)/);
    assert.match(src, /setAuthState\('disabled'\)/);
    assert.match(src, /setAuthState\(getToken\(\)\s*\?\s*'authed'\s*:\s*'anon'\)/);
  });

  it('returns authState + setAuthed + setAnon helpers', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /authState:\s*AuthState/);
    assert.match(src, /setAuthed:\s*\(\)\s*=>\s*void/);
    assert.match(src, /setAnon:\s*\(\)\s*=>\s*void/);
  });

  it('parent App wires the hook + drops the inline type + state + effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAuthState\s*\}\s+from\s+'\.\/lib\/use-auth-state'/);
    assert.match(src, /useAuthState\(\)/);
    assert.doesNotMatch(src, /^type AuthState\s*=/m);
    assert.doesNotMatch(src, /const refreshAuth = useCallback/);
    assert.doesNotMatch(src, /AUTH_EVENT,\s*onExpired/);
  });
});

describe('extracted: useWorkerSelection hook (v1.10.668)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-selection.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ControlPanel.tsx');

  it('exports the hook + accepts workers/postAction/showToast/fetchList', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkerSelection/);
    assert.match(src, /workers:\s*Worker\[\]/);
    assert.match(src, /postAction:[\s\S]*?Promise<\{ ok: boolean; error\?: string \}>/);
    assert.match(src, /showToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
    assert.match(src, /fetchList:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('selects via Set<string> and exposes toggle/selectAll/clear', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<Set<string>>\(new Set\(\)\)/);
    assert.match(src, /const toggleSelected = useCallback/);
    assert.match(src, /setSelected\(new Set\(workers\.map\(\(w\) => w\.name\)\)\)/);
    assert.match(src, /setSelected\(new Set\(\)\)/);
  });

  it('runBatch confirms via window.confirm + maps kind to /api/close or /api/cancel', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(confirmMsg\)/);
    assert.match(src, /kind === 'close'\s*\?\s*'\/api\/close'\s*:\s*'\/api\/cancel'/);
  });

  it('runBatch reports per-row outcomes + emits success/mixed toast + clears selection on close', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /outcomes\.push\(\{ name, ok: r\.ok, error: r\.error \}\)/);
    assert.match(src, /controlPanel\.batch\.resultOk/);
    assert.match(src, /controlPanel\.batch\.resultMixed/);
    assert.match(src, /if \(kind === 'close'\)\s*\{[\s\S]*?setSelected\(new Set\(\)\)/);
  });

  it('parent ControlPanel wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkerSelection\s*\}\s+from\s+'\.\.\/lib\/use-worker-selection'/);
    assert.match(src, /useWorkerSelection\(\{[\s\S]*?workers,\s*postAction,\s*showToast,\s*fetchList[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[selected, setSelected\]/);
    assert.doesNotMatch(src, /const \[batchBusy, setBatchBusy\]/);
    assert.doesNotMatch(src, /const runBatch = useCallback/);
    assert.doesNotMatch(src, /const toggleSelected = useCallback/);
  });
});

describe('extracted: useNlChat hook (v1.10.667)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-nl-chat.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'Chat.tsx');

  it('exports the hook + ChatMessage + ChatAction types', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useNlChat/);
    assert.match(src, /export interface ChatMessage/);
    assert.match(src, /export interface ChatAction/);
  });

  it('persists sessionId to localStorage under c4.nl.sessionId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /SESSION_KEY\s*=\s*'c4\.nl\.sessionId'/);
    assert.match(src, /localStorage\.getItem\(SESSION_KEY\)/);
    assert.match(src, /localStorage\.setItem\(SESSION_KEY,\s*id\)/);
    assert.match(src, /localStorage\.removeItem\(SESSION_KEY\)/);
  });

  it('POSTs /api/nl/chat with optional sessionId and appends both bubbles', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<ChatResponse>\('\/api\/nl\/chat'/);
    assert.match(src, /sessionId:\s*sessionId\s*\|\|\s*undefined/);
    assert.match(src, /role:\s*'user'/);
    assert.match(src, /role:\s*'assistant'/);
  });

  it('newSession clears messages + actions + error + sessionId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /const newSession = useCallback\(\(\) => \{[\s\S]*?setSessionId\(null\)[\s\S]*?setMessages\(\[\]\)[\s\S]*?setActions\(\[\]\)[\s\S]*?setError\(null\)/);
  });

  it('parent Chat wires the hook + drops the inline state + helpers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useNlChat,\s*type\s+ChatAction\s*\}\s+from\s+'\.\.\/lib\/use-nl-chat'/);
    assert.match(src, /useNlChat\(\)/);
    assert.doesNotMatch(src, /^interface ChatMessage/m);
    assert.doesNotMatch(src, /^interface ChatResponse/m);
    assert.doesNotMatch(src, /const \[messages, setMessages\]/);
    assert.doesNotMatch(src, /const \[sessionId, setSessionId\]/);
    assert.doesNotMatch(src, /^function loadSessionId/m);
    assert.doesNotMatch(src, /^function saveSessionId/m);
  });
});

describe('shared: useWorkerList consumed by HierarchyTree (v1.10.666)', () => {
  const fs = require('fs');
  const path = require('path');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HierarchyTree.tsx');

  it('HierarchyTree imports useWorkerList instead of redeclaring the fetch + SSE', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkerList\s*\}\s+from\s+'\.\.\/lib\/use-worker-list'/);
    assert.match(src, /useWorkerList\(\)/);
  });

  it('HierarchyTree no longer redeclares the inline fetch / SSE / state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.doesNotMatch(src, /const \[workers, setWorkers\]/);
    assert.doesNotMatch(src, /const \[sseConnected, setSseConnected\]/);
    assert.doesNotMatch(src, /const fetchList = useCallback/);
    assert.doesNotMatch(src, /new EventSource\(eventSourceUrl\('\/api\/events'\)\)/);
    assert.doesNotMatch(src, /apiFetch\('\/api\/list'\)/);
  });
});

describe('extracted: useWorkerBufferFlusher hook (v1.10.665)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-buffer-flusher.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ChatView.tsx');

  it('exports the hook + WORKER_FLUSH_MS constant', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkerBufferFlusher/);
    assert.match(src, /export \{ WORKER_FLUSH_MS \}/);
    assert.match(src, /WORKER_FLUSH_MS\s*=\s*1200/);
  });

  it('owns the pendingBuf + flushTimer refs internally', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useRef<string>\(''\)/);
    assert.match(src, /useRef<number\s*\|\s*null>\(null\)/);
  });

  it('flush stripsAnsi + trims + calls appendLive("worker", text)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /stripAnsi\(raw\)\.trim\(\)/);
    assert.match(src, /appendLive\('worker',\s*clean\)/);
  });

  it('schedule debounces via window.setTimeout(WORKER_FLUSH_MS)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout\(flushWorkerBuffer,\s*WORKER_FLUSH_MS\)/);
  });

  it('reset clears both refs (worker swap + SSE cleanup callsite)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /pendingBufRef\.current = ''/);
    assert.match(src, /window\.clearTimeout\(flushTimerRef\.current\)/);
  });

  it('parent ChatView wires the hook + drops the inline refs + helpers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkerBufferFlusher\s*\}\s+from\s+'\.\.\/lib\/use-worker-buffer-flusher'/);
    assert.match(src, /useWorkerBufferFlusher\(\{\s*appendLive\s*\}\)/);
    assert.doesNotMatch(src, /const flushWorkerBuffer = useCallback/);
    assert.doesNotMatch(src, /const scheduleFlush = useCallback/);
    assert.doesNotMatch(src, /^const WORKER_FLUSH_MS\s*=/m);
  });
});

describe('extracted: useMeetingBackup + useMeetingPrune (v1.10.664)', () => {
  const fs = require('fs');
  const path = require('path');
  const BACKUP = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-backup.ts');
  const PRUNE = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-prune.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsMaintenancePanel.tsx');

  it('useMeetingBackup POSTs /api/meetings/persist-backup with path + force', () => {
    const src = fs.readFileSync(BACKUP, 'utf8');
    assert.match(src, /export function useMeetingBackup/);
    assert.match(src, /apiPost<\{ ok: boolean; path: string; bytes: number \| null \}>\(\s*'\/api\/meetings\/persist-backup'/);
    assert.match(src, /\{ path, force: backupForce \}/);
    assert.match(src, /backup\.pathRequired/);
  });

  it('useMeetingPrune POSTs /api/meetings/prune-old with confirm gate (skipped on dryRun)', () => {
    const src = fs.readFileSync(PRUNE, 'utf8');
    assert.match(src, /export function useMeetingPrune/);
    assert.match(src, /apiPost<\{[\s\S]*?count: number;[\s\S]*?ids: string\[\][\s\S]*?\}>\(\s*'\/api\/meetings\/prune-old'/);
    assert.match(src, /if \(!dryRun\) \{[\s\S]*?window\.confirm/);
    assert.match(src, /prune\.daysInvalid/);
  });

  it('prune fires onPruned only on non-dryRun success', () => {
    const src = fs.readFileSync(PRUNE, 'utf8');
    assert.match(src, /if \(!res\.dryRun && onPruned\) onPruned\(\)/);
  });

  it('both hooks own their input state alongside busy/msg/failed', () => {
    const backupSrc = fs.readFileSync(BACKUP, 'utf8');
    const pruneSrc = fs.readFileSync(PRUNE, 'utf8');
    assert.match(backupSrc, /backupPath:\s*string/);
    assert.match(backupSrc, /backupForce:\s*boolean/);
    assert.match(backupSrc, /backupBusy:\s*boolean/);
    assert.match(pruneSrc, /pruneDays:\s*string/);
    assert.match(pruneSrc, /pruneTerminal:\s*boolean/);
    assert.match(pruneSrc, /pruneVacuum:\s*boolean/);
    assert.match(pruneSrc, /pruneBusy:\s*boolean/);
  });

  it('parent MeetingsMaintenancePanel wires both hooks + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingBackup\s*\}\s+from\s+'\.\.\/lib\/use-meeting-backup'/);
    assert.match(src, /import\s+\{\s*useMeetingPrune\s*\}\s+from\s+'\.\.\/lib\/use-meeting-prune'/);
    assert.match(src, /useMeetingBackup\(\)/);
    assert.match(src, /useMeetingPrune\(\{\s*onPruned\s*\}\)/);
    assert.doesNotMatch(src, /const \[backupPath, setBackupPath\]/);
    assert.doesNotMatch(src, /const \[pruneDays, setPruneDays\]/);
    assert.doesNotMatch(src, /const handleBackup = useCallback/);
    assert.doesNotMatch(src, /const handlePrune = useCallback/);
  });
});

describe('extracted: useMeetingIntegrity + useMeetingFtsRebuild (v1.10.662/663)', () => {
  const fs = require('fs');
  const path = require('path');
  const INTEGRITY = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-integrity.ts');
  const FTS = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-fts-rebuild.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsMaintenancePanel.tsx');

  it('useMeetingIntegrity GETs /api/meetings/persist-integrity with three branches', () => {
    const src = fs.readFileSync(INTEGRITY, 'utf8');
    assert.match(src, /export function useMeetingIntegrity/);
    assert.match(src, /\/api\/meetings\/persist-integrity/);
    assert.match(src, /persistDisabled/);
    assert.match(src, /integrity\.ok/);
    assert.match(src, /integrity\.failed/);
  });

  it('useMeetingFtsRebuild POSTs /api/meetings/fts-rebuild + reports indexed/before/after', () => {
    const src = fs.readFileSync(FTS, 'utf8');
    assert.match(src, /export function useMeetingFtsRebuild/);
    assert.match(src, /apiPost<\{ indexed: number; before: number; after: number \}>\(\s*'\/api\/meetings\/fts-rebuild'/);
    assert.match(src, /fts\.success/);
    assert.match(src, /fts\.failed/);
  });

  it('both hooks return busy/msg/failed/handler tuple', () => {
    const integritySrc = fs.readFileSync(INTEGRITY, 'utf8');
    const ftsSrc = fs.readFileSync(FTS, 'utf8');
    assert.match(integritySrc, /integrityBusy:\s*boolean/);
    assert.match(integritySrc, /integrityMsg:\s*string\s*\|\s*null/);
    assert.match(integritySrc, /integrityFailed:\s*boolean/);
    assert.match(integritySrc, /handleIntegrity:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(ftsSrc, /ftsBusy:\s*boolean/);
    assert.match(ftsSrc, /ftsMsg:\s*string\s*\|\s*null/);
    assert.match(ftsSrc, /ftsFailed:\s*boolean/);
    assert.match(ftsSrc, /handleFtsRebuild:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('parent MeetingsMaintenancePanel wires both hooks + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingIntegrity\s*\}\s+from\s+'\.\.\/lib\/use-meeting-integrity'/);
    assert.match(src, /import\s+\{\s*useMeetingFtsRebuild\s*\}\s+from\s+'\.\.\/lib\/use-meeting-fts-rebuild'/);
    assert.match(src, /useMeetingIntegrity\(\)/);
    assert.match(src, /useMeetingFtsRebuild\(\)/);
    assert.doesNotMatch(src, /const \[integrityBusy, setIntegrityBusy\]/);
    assert.doesNotMatch(src, /const \[ftsBusy, setFtsBusy\]/);
    assert.doesNotMatch(src, /const handleIntegrity = useCallback/);
    assert.doesNotMatch(src, /const handleFtsRebuild = useCallback/);
  });
});

describe('extracted: usePlanContent hook (v1.10.661)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-plan-content.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Plan.tsx');

  it('exports the hook + PlanResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePlanContent/);
    assert.match(src, /export interface PlanResponse/);
  });

  it('GETs /api/plan?name=<worker> with HTTP error mapping + auto-fetch', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/plan\?name=\$\{encodeURIComponent\(selected\)\}/);
    assert.match(src, /throw new Error\(`HTTP \$\{res\.status\}`\)/);
    assert.match(src, /useEffect\(\(\) => \{ loadPlan\(\); \}/);
  });

  it('clears the slot to null on error so the empty state can render', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setPlan\(null\)/);
  });

  it('returns plan + loading + error + setError + loadPlan', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /plan:\s*PlanResponse\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /setError:\s*\(message:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /loadPlan:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('parent Plan wires the hook + drops the inline state + interface', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePlanContent,\s*type\s+PlanResponse\s*\}\s+from\s+'\.\.\/lib\/use-plan-content'/);
    assert.match(src, /usePlanContent\(\{\s*selected\s*\}\)/);
    assert.doesNotMatch(src, /^interface PlanResponse/m);
    assert.doesNotMatch(src, /const \[plan, setPlan\]/);
    assert.doesNotMatch(src, /const loadPlan = useCallback/);
  });
});

describe('extracted: useWorkerList hook (v1.10.660)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-list.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkerList.tsx');

  it('exports the hook with no-arg signature', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkerList\(\)/);
  });

  it('GETs /api/list with HTTP error mapping to setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiFetch\('\/api\/list'\)/);
    assert.match(src, /throw new Error\(`HTTP \$\{res\.status\}`\)/);
  });

  it('subscribes to /api/events and refetches on every non-connected event', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /eventSourceUrl\('\/api\/events'\)/);
    assert.match(src, /evt\.type !== 'connected'/);
    assert.match(src, /refresh\(\);/);
  });

  it('keeps the 5s belt-and-braces poll interval alongside SSE', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setInterval\(refresh,\s*5000\)/);
    assert.match(src, /clearInterval\(interval\)/);
    assert.match(src, /es\.close\(\)/);
  });

  it('returns workers + error + sseConnected + refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /workers:\s*Worker\[\]/);
    assert.match(src, /sseConnected:\s*boolean/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('parent WorkerList wires the hook + drops the inline state + effects', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkerList\s*\}\s+from\s+'\.\.\/lib\/use-worker-list'/);
    assert.match(src, /useWorkerList\(\)/);
    assert.doesNotMatch(src, /const \[workers, setWorkers\]/);
    assert.doesNotMatch(src, /const \[sseConnected, setSseConnected\]/);
    assert.doesNotMatch(src, /const fetchList = useCallback/);
    assert.doesNotMatch(src, /new EventSource\(eventSourceUrl\('\/api\/events'\)\)/);
  });
});

describe('extracted: useConversation hook (v1.10.659)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-conversation.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ConversationView.tsx');

  it('exports the hook + accepts sessionId/live/snapshotUrl/streamUrl', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useConversation/);
    assert.match(src, /sessionId:\s*string/);
    assert.match(src, /live:\s*boolean/);
    assert.match(src, /snapshotUrl\?:\s*string/);
    assert.match(src, /streamUrl\?:\s*string/);
  });

  it('GETs /api/sessions/:id (or override) and falls back via t() on failure', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<Conversation>\(url\)/);
    assert.match(src, /snapshotUrl\s*\|\|\s*`\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}`/);
    assert.match(src, /common\.failedToLoadSession/);
  });

  it('subscribes to /stream when live + handles conversation + turn events', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /eventSourceUrl\(/);
    assert.match(src, /\/stream/);
    assert.match(src, /es\.addEventListener\('conversation'/);
    assert.match(src, /es\.addEventListener\('turn'/);
  });

  it('appends turn frames to the conversation atomically', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /turns:\s*\[\.\.\.prev\.turns,\s*turn\]/);
    assert.match(src, /totalInputTokens:\s*prev\.totalInputTokens\s*\+\s*\(turn\.tokens\?\.input\s*\|\|\s*0\)/);
    assert.match(src, /totalOutputTokens:\s*prev\.totalOutputTokens\s*\+\s*\(turn\.tokens\?\.output\s*\|\|\s*0\)/);
  });

  it('returns conversation/error/loading/streaming/refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /conversation:\s*Conversation\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /streaming:\s*boolean/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('parent ConversationView wires the hook + drops the inline state + effects', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useConversation\s*\}\s+from\s+'\.\.\/lib\/use-conversation'/);
    assert.match(src, /useConversation\(\{\s*sessionId,\s*live,\s*snapshotUrl,\s*streamUrl\s*\}\)/);
    assert.doesNotMatch(src, /const \[conversation, setConversation\]/);
    assert.doesNotMatch(src, /const \[streaming, setStreaming\]/);
    assert.doesNotMatch(src, /const fetchSnapshot = useCallback/);
    assert.doesNotMatch(src, /es\.addEventListener\('conversation'/);
  });
});

describe('extracted: useBatchSubmit hook (v1.10.658)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-batch-submit.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Batch.tsx');

  it('exports the hook + BatchResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useBatchSubmit/);
    assert.match(src, /export interface BatchResponse/);
    assert.match(src, /results:\s*BatchOutcome\[\]/);
  });

  it('validates count-mode (task + count) and file-mode (tasksText) before POSTing', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /batch\.error\.taskRequired/);
    assert.match(src, /batch\.error\.countOne/);
    assert.match(src, /batch\.error\.noTaskLine/);
    assert.match(src, /tasksText\.split\('\\n'\)\.map\(\(l\) => l\.trim\(\)\)\.filter\(\(l\) => l && !l\.startsWith\('#'\)\)/);
  });

  it('POSTs /api/batch with the right body shape per mode', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<BatchResponse>\('\/api\/batch',\s*body\)/);
    assert.match(src, /body\['tasks'\]\s*=\s*tasks/);
    assert.match(src, /body\['task'\]\s*=\s*task/);
    assert.match(src, /body\['count'\]\s*=\s*count/);
    assert.match(src, /if \(branch\) body\['branch'\] = branch/);
    assert.match(src, /if \(autoMode\) body\['autoMode'\] = true/);
  });

  it('emits success/partial-fail toasts via the showToast callback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /showToast\(tFormat\('batch\.toast\.dispatched'/);
    assert.match(src, /showToast\(tFormat\('batch\.toast\.failures'/);
    assert.match(src, /'success'/);
    assert.match(src, /'error'/);
  });

  it('parent Batch wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useBatchSubmit\s*\}\s+from\s+'\.\.\/lib\/use-batch-submit'/);
    assert.match(src, /useBatchSubmit\(\{[\s\S]*?mode,\s*task,\s*count,\s*tasksText[\s\S]*?showToast,?[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /^interface BatchResponse/m);
    assert.doesNotMatch(src, /const \[busy, setBusy\]/);
    assert.doesNotMatch(src, /const \[result, setResult\]/);
    assert.doesNotMatch(src, /const submit = useCallback/);
  });
});

describe('extracted: useRiskCheck + useRiskSandboxPreview (v1.10.657)', () => {
  const fs = require('fs');
  const path = require('path');
  const CHECK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-risk-check.ts');
  const PREVIEW = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-risk-sandbox-preview.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx');

  it('useRiskCheck POSTs /api/risk/check with command + includeInspected', () => {
    const src = fs.readFileSync(CHECK, 'utf8');
    assert.match(src, /export function useRiskCheck/);
    assert.match(src, /apiPost<CheckResponse>\('\/api\/risk\/check'/);
    assert.match(src, /command:\s*command\.trim\(\)/);
    assert.match(src, /includeInspected/);
  });

  it('useRiskSandboxPreview POSTs /api/risk/preview with command', () => {
    const src = fs.readFileSync(PREVIEW, 'utf8');
    assert.match(src, /export function useRiskSandboxPreview/);
    assert.match(src, /apiPost<SandboxPreview>\('\/api\/risk\/preview'/);
    assert.match(src, /command:\s*command\.trim\(\)/);
  });

  it('both hooks short-circuit on empty command + reset prior result on retry', () => {
    const checkSrc = fs.readFileSync(CHECK, 'utf8');
    const previewSrc = fs.readFileSync(PREVIEW, 'utf8');
    assert.match(checkSrc, /if \(!command\.trim\(\)\) return/);
    assert.match(checkSrc, /setCheckResult\(null\)/);
    assert.match(previewSrc, /if \(!command\.trim\(\)\) return/);
    assert.match(previewSrc, /setSandbox\(null\)/);
  });

  it('parent Risk wires both hooks + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useRiskCheck\s*\}\s+from\s+'\.\.\/lib\/use-risk-check'/);
    assert.match(src, /import\s+\{\s*useRiskSandboxPreview\s*\}\s+from\s+'\.\.\/lib\/use-risk-sandbox-preview'/);
    assert.match(src, /useRiskCheck\(\{\s*command,\s*includeInspected\s*\}\)/);
    assert.match(src, /useRiskSandboxPreview\(\{\s*command\s*\}\)/);
    assert.doesNotMatch(src, /const \[checkBusy, setCheckBusy\]/);
    assert.doesNotMatch(src, /const \[sandboxBusy, setSandboxBusy\]/);
    assert.doesNotMatch(src, /const handleCheck = useCallback/);
    assert.doesNotMatch(src, /const handleSandboxPreview = useCallback/);
  });
});

describe('extracted: useTokenUsage hook (v1.10.656)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-token-usage.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'TokenUsage.tsx');

  it('exports the hook + four payload types', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useTokenUsage/);
    assert.match(src, /export interface PerTaskEntry/);
    assert.match(src, /export interface TokenUsagePayload/);
    assert.match(src, /export interface QuotaTierSnapshot/);
    assert.match(src, /export interface QuotaPayload/);
  });

  it('GETs /api/token-usage with optional perTask=1 + /api/quota in lockstep', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /perTask\s*\?\s*'\/api\/token-usage\?perTask=1'\s*:\s*'\/api\/token-usage'/);
    assert.match(src, /apiGet<TokenUsagePayload>\(path\)/);
    assert.match(src, /apiGet<QuotaPayload>\('\/api\/quota'\)/);
  });

  it('quota failures stay silent (no error banner pollution)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /try \{[\s\S]*?const q = await apiGet<QuotaPayload>[\s\S]*?\} catch \{[\s\S]*?setQuota\(null\);[\s\S]*?\}/);
  });

  it('returns data + quota + loading + error + refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /data:\s*TokenUsagePayload\s*\|\s*null/);
    assert.match(src, /quota:\s*QuotaPayload\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /useEffect\(\(\) => \{ refresh\(\); \}/);
  });

  it('parent TokenUsage wires the hook + drops the inline state + types', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useTokenUsage\s*\}\s+from\s+'\.\.\/lib\/use-token-usage'/);
    assert.match(src, /useTokenUsage\(\{\s*perTask\s*\}\)/);
    assert.doesNotMatch(src, /^interface TokenUsagePayload/m);
    assert.doesNotMatch(src, /^interface QuotaPayload/m);
    assert.doesNotMatch(src, /const \[data, setData\]/);
    assert.doesNotMatch(src, /const \[quota, setQuota\]/);
    assert.doesNotMatch(src, /const refresh = useCallback/);
  });
});

describe('extracted: useEscalationResolve hook (v1.10.655)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-escalation-resolve.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'AutonomousView.tsx');

  it('exports the hook + accepts setEscalations from useAutonomousDigest', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useEscalationResolve/);
    assert.match(src, /setEscalations:\s*React\.Dispatch<React\.SetStateAction<Escalation\[\]>>/);
    assert.match(src, /import type \{ Escalation \} from '\.\/use-autonomous-digest'/);
  });

  it('requires a non-empty note for the modify action', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(action === 'modify'\)/);
    assert.match(src, /autonomous\.resolve\.noteRequired/);
  });

  it('confirms via window.confirm + POSTs /api/autonomous/escalations/:id', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(tFormat\('autonomous\.confirmResolve'/);
    assert.match(src, /apiPost\(`\/api\/autonomous\/escalations\/\$\{id\}`,\s*body\)/);
  });

  it('optimistically removes the row + clears its note on success', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setEscalations\(\(prev\) => prev\.filter\(\(e\) => e\.id !== id\)\)/);
    assert.match(src, /delete next\[id\];\s*return next/);
  });

  it('returns busy/error/notes triplet + setResolveNotes + handleResolve', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /resolveBusy:\s*number\s*\|\s*null/);
    assert.match(src, /resolveError:\s*string\s*\|\s*null/);
    assert.match(src, /resolveNotes:\s*Record<number,\s*string>/);
    assert.match(src, /setResolveNotes:\s*React\.Dispatch/);
    assert.match(src, /handleResolve:\s*\(id:\s*number,\s*action:\s*ResolveAction\)\s*=>\s*Promise<void>/);
  });

  it('parent AutonomousView wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useEscalationResolve\s*\}\s+from\s+'\.\.\/lib\/use-escalation-resolve'/);
    assert.match(src, /useEscalationResolve\(\{\s*setEscalations\s*\}\)/);
    assert.doesNotMatch(src, /const \[resolveBusy, setResolveBusy\]/);
    assert.doesNotMatch(src, /const \[resolveError, setResolveError\]/);
    assert.doesNotMatch(src, /const \[resolveNotes, setResolveNotes\]/);
    assert.doesNotMatch(src, /const handleResolve = useCallback/);
  });
});

describe('extracted: useAutonomousPauseToggle hook (v1.10.654)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-autonomous-pause-toggle.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'AutonomousView.tsx');

  it('exports the hook + accepts digest + refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAutonomousPauseToggle/);
    assert.match(src, /digest:\s*DigestResponse\s*\|\s*null/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('POSTs /api/autonomous/(pause|resume) based on digest.paused', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /digest\.paused\s*\?\s*'resume'\s*:\s*'pause'/);
    assert.match(src, /apiPost\(`\/api\/autonomous\/\$\{path\}`,\s*\{\}\)/);
  });

  it('clears the banner after 4s + calls refresh on success', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout\(\(\) => setPauseMsg\(null\),\s*4000\)/);
    assert.match(src, /void refresh\(\)/);
  });

  it('flips pauseFailed tone on error', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setPauseFailed\(true\)/);
    assert.match(src, /pauseToggle\.resumeFailed/);
    assert.match(src, /pauseToggle\.pauseFailed/);
  });

  it('parent AutonomousView wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAutonomousPauseToggle\s*\}\s+from\s+'\.\.\/lib\/use-autonomous-pause-toggle'/);
    assert.match(src, /useAutonomousPauseToggle\(\{\s*digest,\s*refresh\s*\}\)/);
    assert.doesNotMatch(src, /const \[pauseBusy, setPauseBusy\]/);
    assert.doesNotMatch(src, /const \[pauseMsg, setPauseMsg\]/);
    assert.doesNotMatch(src, /const \[pauseFailed, setPauseFailed\]/);
    assert.doesNotMatch(src, /const handlePauseToggle = useCallback/);
  });
});

describe('extracted: useAutonomousDigest hook (v1.10.653)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-autonomous-digest.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'AutonomousView.tsx');

  it('exports the hook + Escalation type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAutonomousDigest/);
    assert.match(src, /export type \{ Escalation \}/);
    assert.match(src, /interface Escalation \{[\s\S]*?suggestedAction:\s*string/);
  });

  it('GETs status first then digest + escalations in parallel', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<\{ enabled: boolean; reason\?: string \}>\(\s*'\/api\/autonomous\/status'/);
    assert.match(src, /Promise\.all\(\[/);
    assert.match(src, /apiGet<DigestResponse>\('\/api\/autonomous\/digest'\)/);
    assert.match(src, /\/api\/autonomous\/escalations\?status=all/);
  });

  it('blanks digest + escalations when autonomous is disabled', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!status\.enabled\)/);
    assert.match(src, /setDigest\(null\)/);
    assert.match(src, /setEscalations\(\[\]\)/);
  });

  it('refreshes every 30s via window.setInterval', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setInterval\(refresh,\s*30000\)/);
    assert.match(src, /window\.clearInterval\(id\)/);
  });

  it('returns the full state tuple including setEscalations for optimistic resolves', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /autonomousEnabled:\s*boolean\s*\|\s*null/);
    assert.match(src, /digest:\s*DigestResponse\s*\|\s*null/);
    assert.match(src, /escalations:\s*Escalation\[\]/);
    assert.match(src, /setEscalations:\s*React\.Dispatch<React\.SetStateAction<Escalation\[\]>>/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('parent AutonomousView wires the hook + drops the inline state + interface + refresh', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAutonomousDigest\s*\}\s+from\s+'\.\.\/lib\/use-autonomous-digest'/);
    assert.match(src, /useAutonomousDigest\(\{\s*showResolved\s*\}\)/);
    assert.doesNotMatch(src, /^interface Escalation \{/m);
    assert.doesNotMatch(src, /const \[digest, setDigest\]/);
    assert.doesNotMatch(src, /const \[escalations, setEscalations\]/);
    assert.doesNotMatch(src, /const refresh = useCallback/);
  });
});

describe('extracted: useHistorySummary hook (v1.10.652)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-history-summary.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HistoryView.tsx');

  it('exports the hook + accepts the four filter strings + setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useHistorySummary/);
    assert.match(src, /query:\s*string/);
    assert.match(src, /statusFilter:\s*string/);
    assert.match(src, /sinceDay:\s*string/);
    assert.match(src, /untilDay:\s*string/);
    assert.match(src, /setError:\s*\(message:\s*string\s*\|\s*null\)\s*=>\s*void/);
  });

  it('builds /api/history?qs URL from filters with day-widening', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /new URLSearchParams\(\)/);
    assert.match(src, /params\.set\('q', query\)/);
    assert.match(src, /params\.set\('status', statusFilter\)/);
    assert.match(src, /params\.set\('since', toIsoDayStart\(sinceDay\)\)/);
    assert.match(src, /params\.set\('until', toIsoDayEnd\(untilDay\)\)/);
    assert.match(src, /qs \? `\/api\/history\?\$\{qs\}` : '\/api\/history'/);
  });

  it('day-widening helpers stay private to the hook module', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /function toIsoDayStart/);
    assert.match(src, /function toIsoDayEnd/);
    assert.doesNotMatch(src, /export function toIsoDayStart/);
    assert.doesNotMatch(src, /export function toIsoDayEnd/);
    assert.match(src, /T00:00:00\.000Z/);
    assert.match(src, /T23:59:59\.999Z/);
  });

  it('returns summary array + refresh callback + auto-refetches on filter change', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /summary:\s*HistoryWorkerSummary\[\]/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /useEffect\(\(\) => \{ refresh\(\); \}/);
  });

  it('parent HistoryView wires the hook + drops summary state + helpers + fetcher', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useHistorySummary\s*\}\s+from\s+'\.\.\/lib\/use-history-summary'/);
    assert.match(src, /useHistorySummary\(\{[\s\S]*?query,\s*statusFilter,\s*sinceDay,\s*untilDay,\s*setError[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[summary, setSummary\]/);
    assert.doesNotMatch(src, /const fetchSummary = useCallback/);
    assert.doesNotMatch(src, /^function toIsoDayStart/m);
    assert.doesNotMatch(src, /^function toIsoDayEnd/m);
  });
});

describe('extracted: useHistoryWorkerDetail hook (v1.10.651)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-history-worker-detail.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HistoryView.tsx');

  it('exports the hook + accepts selected + setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useHistoryWorkerDetail/);
    assert.match(src, /selected:\s*string\s*\|\s*null/);
    assert.match(src, /setError:\s*\(message:\s*string\s*\|\s*null\)\s*=>\s*void/);
  });

  it('GETs /api/history/:name on selected change + clears on null', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/history\/\$\{encodeURIComponent\(name\)\}/);
    assert.match(src, /if \(!selected\) \{[\s\S]*?setDetail\(null\)/);
  });

  it('reports success/failure to setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setError\(null\)/);
    assert.match(src, /setError\(\(e as Error\)\.message\)/);
  });

  it('parent HistoryView wires the hook + drops the inline detail state + fetcher', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useHistoryWorkerDetail\s*\}\s+from\s+'\.\.\/lib\/use-history-worker-detail'/);
    assert.match(src, /useHistoryWorkerDetail\(\{\s*selected,\s*setError\s*\}\)/);
    assert.doesNotMatch(src, /const \[detail, setDetail\]/);
    assert.doesNotMatch(src, /const fetchDetail = useCallback/);
  });
});

describe('extracted: useScribeContext hook (v1.10.650)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-scribe-context.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HistoryView.tsx');

  it('exports the hook + ScribeContextResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useScribeContext/);
    assert.match(src, /export interface ScribeContextResponse/);
    assert.match(src, /content:\s*string/);
    assert.match(src, /updatedAt:\s*string\s*\|\s*null/);
  });

  it('GET /api/scribe-context on openScribe + clears + reports errors via setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ScribeContextResponse>\('\/api\/scribe-context'\)/);
    assert.match(src, /setError\(null\)/);
    assert.match(src, /setError\(\(e as Error\)\.message\)/);
  });

  it('returns showScribe + scribe + loadingScribe + open/close', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /showScribe:\s*boolean/);
    assert.match(src, /scribe:\s*ScribeContextResponse\s*\|\s*null/);
    assert.match(src, /loadingScribe:\s*boolean/);
    assert.match(src, /openScribe:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /closeScribe:\s*\(\)\s*=>\s*void/);
  });

  it('parent HistoryView wires the hook + drops the inline state + interface', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useScribeContext\s*\}\s+from\s+'\.\.\/lib\/use-scribe-context'/);
    assert.match(src, /useScribeContext\(\{\s*setError\s*\}\)/);
    assert.doesNotMatch(src, /^export interface ScribeContextResponse/m);
    assert.doesNotMatch(src, /const \[showScribe, setShowScribe\]/);
    assert.doesNotMatch(src, /const \[loadingScribe, setLoadingScribe\]/);
    assert.doesNotMatch(src, /const openScribe = useCallback/);
  });
});

describe('extracted: useMeetingTemplates hook (v1.10.649)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-templates.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsComposer.tsx');

  it('exports the hook + MeetingTemplate type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingTemplates/);
    assert.match(src, /export interface MeetingTemplate/);
    assert.match(src, /name:\s*string/);
    assert.match(src, /task:\s*string/);
  });

  it('GETs /api/meetings/templates with a cancellation race guard', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<\{ templates: MeetingTemplate\[\] \}>\('\/api\/meetings\/templates'\)/);
    assert.match(src, /let cancelled = false/);
    assert.match(src, /if \(!cancelled\) setTemplates\(/);
    assert.match(src, /cancelled = true/);
  });

  it('exposes a refresh callback for the template editor', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /const refresh = useCallback/);
  });

  it('parent MeetingsComposer wires the hook + drops the inline state + interface', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingTemplates,\s*type\s+MeetingTemplate\s*\}\s+from\s+'\.\.\/lib\/use-meeting-templates'/);
    assert.match(src, /useMeetingTemplates\(\{\s*open\s*\}\)/);
    assert.doesNotMatch(src, /^interface Template \{/m);
    assert.doesNotMatch(src, /const \[templates, setTemplates\]/);
    assert.doesNotMatch(src, /const loadTemplates = useCallback/);
  });
});

describe('extracted: useMeetingPreviewPlan hook (v1.10.648)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-preview-plan.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsComposer.tsx');

  it('exports the hook + PreviewPlan type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingPreviewPlan/);
    assert.match(src, /export interface PreviewPlan/);
    assert.match(src, /rosterSize:\s*number/);
    assert.match(src, /estimatedTokens:\s*number/);
  });

  it('debounces POST /api/meetings/plan at 400ms', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout\(async \(\) => \{[\s\S]*?\}, 400\)/);
    assert.match(src, /apiPost<PreviewPlan>\('\/api\/meetings\/plan', body\)/);
    assert.match(src, /window\.clearTimeout\(handle\)/);
  });

  it('forwards newTrack only when not auto', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if\s*\(newTrack\s*!==\s*'auto'\)\s*body\.track\s*=\s*newTrack/);
  });

  it('returns previewPlan + previewBusy + clears on close/empty', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /previewPlan:\s*PreviewPlan\s*\|\s*null/);
    assert.match(src, /previewBusy:\s*boolean/);
    assert.match(src, /if\s*\(!open\s*\|\|\s*!newTask\.trim\(\)\)/);
    assert.match(src, /setPreviewPlan\(null\)/);
  });

  it('parent MeetingsComposer wires the hook + drops the inline state + interface', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingPreviewPlan\s*\}\s+from\s+'\.\.\/lib\/use-meeting-preview-plan'/);
    assert.match(src, /useMeetingPreviewPlan\(\{\s*open,\s*newTask,\s*newTrack\s*\}\)/);
    assert.doesNotMatch(src, /^interface PreviewPlan/m);
    assert.doesNotMatch(src, /const \[previewPlan, setPreviewPlan\]/);
    assert.doesNotMatch(src, /const \[previewBusy, setPreviewBusy\]/);
  });
});

describe('extracted: useMeetingClassifyPreview hook (v1.10.647)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-classify-preview.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsComposer.tsx');

  it('exports the hook + ClassifyPreview type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingClassifyPreview/);
    assert.match(src, /export interface ClassifyPreview/);
    assert.match(src, /track:\s*'lightweight'\s*\|\s*'standard'\s*\|\s*'full'/);
  });

  it('debounces the GET /api/meetings/classify-track call at 250ms', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout\(async \(\) => \{[\s\S]*?\}, 250\)/);
    assert.match(src, /\/api\/meetings\/classify-track\?\$\{qs\.toString\(\)\}/);
    assert.match(src, /window\.clearTimeout\(handle\)/);
  });

  it('clears the preview when composer closes or task is empty', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if\s*\(!open\s*\|\|\s*!newTask\.trim\(\)\)/);
    assert.match(src, /setClassifyPreview\(null\)/);
  });

  it('parent MeetingsComposer wires the hook + drops the inline state + interface', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingClassifyPreview\s*\}\s+from\s+'\.\.\/lib\/use-meeting-classify-preview'/);
    assert.match(src, /useMeetingClassifyPreview\(\{\s*open,\s*newTask\s*\}\)/);
    assert.doesNotMatch(src, /^interface ClassifyPreview/m);
    assert.doesNotMatch(src, /const \[classifyPreview, setClassifyPreview\]/);
  });
});

describe('extracted: useTerminalSseStream hook (v1.10.646)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-terminal-sse-stream.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'XtermView.tsx');

  it('exports the hook + accepts termRef + workerName + onError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useTerminalSseStream/);
    assert.match(src, /termRef:\s*RefObject<Terminal\s*\|\s*null>/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /onError:\s*\(message:\s*string\)\s*=>\s*void/);
    assert.match(src, /sseConnected:\s*boolean/);
  });

  it('opens EventSource via eventSourceUrl + writes b64-decoded output to term', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /eventSourceUrl\(`\/api\/watch\?name=\$\{encodeURIComponent\(workerName\)\}`\)/);
    assert.match(src, /new EventSource\(url\)/);
    assert.match(src, /term\.write\(b64decode\(data\.data\)\)/);
    assert.match(src, /type\s*===\s*['"]output['"]/);
  });

  it('propagates EventSource construction failures via onError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /catch \(e\)\s*\{[\s\S]*?onError\(\(e as Error\)\.message\)/);
  });

  it('parent XtermView wires the hook + drops the inline state slot', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useTerminalSseStream\s*\}\s+from\s+'\.\.\/lib\/use-terminal-sse-stream'/);
    assert.match(src, /useTerminalSseStream\(\{[\s\S]*?termRef[\s\S]*?workerName[\s\S]*?onError:\s*setError[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[sseConnected, setSseConnected\]/);
    assert.doesNotMatch(src, /^interface WatchEvent/m);
  });
});

describe('extracted: useXtermThemeTracking + xterm-theme (v1.10.645)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-xterm-theme-tracking.ts');
  const THEME = path.join(__dirname, '..', 'web', 'src', 'lib', 'xterm-theme.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'XtermView.tsx');

  it('xterm-theme.ts exports buildXtermTheme + readShadcnColor stays internal', () => {
    const src = fs.readFileSync(THEME, 'utf8');
    assert.match(src, /export function buildXtermTheme/);
    assert.match(src, /function readShadcnColor/);
    assert.doesNotMatch(src, /export function readShadcnColor/);
  });

  it('xterm-theme wraps shadcn HSL triples in hsl(...)', () => {
    const src = fs.readFileSync(THEME, 'utf8');
    assert.match(src, /hsl\(\$\{raw\}\)/);
    assert.match(src, /'--background'/);
    assert.match(src, /'--foreground'/);
  });

  it('use-xterm-theme-tracking.ts exports the hook + accepts termRef + workerName', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useXtermThemeTracking/);
    assert.match(src, /termRef:\s*RefObject<Terminal\s*\|\s*null>/);
    assert.match(src, /workerName:\s*string/);
  });

  it('use-xterm-theme-tracking observes <html> classList via MutationObserver', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /new MutationObserver\(apply\)/);
    assert.match(src, /attributeFilter: \['class'\]/);
    assert.match(src, /buildXtermTheme/);
  });

  it('parent XtermView calls the hook + imports buildXtermTheme from lib', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useXtermThemeTracking\s*\}\s+from\s+'\.\.\/lib\/use-xterm-theme-tracking'/);
    assert.match(src, /import\s+\{\s*buildXtermTheme\s*\}\s+from\s+'\.\.\/lib\/xterm-theme'/);
    assert.match(src, /useXtermThemeTracking\(\{\s*termRef,\s*workerName\s*\}\)/);
    assert.doesNotMatch(src, /^function buildXtermTheme/m);
    assert.doesNotMatch(src, /^function readShadcnColor/m);
  });
});

describe('extracted: useRiskStats hook (v1.10.644)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-risk-stats.ts');

  it('lives in lib/use-risk-stats.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useRiskStats/);
  });

  it('returns windowHours/setWindowHours + stats/statsLoading/statsError + refreshStats', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /windowHours:\s*number/);
    assert.match(src, /setWindowHours:\s*\(next:\s*number\)\s*=>\s*void/);
    assert.match(src, /stats:\s*StatsResponse\s*\|\s*null/);
    assert.match(src, /statsLoading:\s*boolean/);
    assert.match(src, /statsError:\s*string\s*\|\s*null/);
    assert.match(src, /refreshStats:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns GET /api/risk/stats?windowHours=N + auto-refresh effect', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/risk\/stats\?windowHours=/);
    assert.match(src, /useEffect\(\(\) => \{ refreshStats\(\); \}/);
  });

  it('parent Risk page calls the hook; inline state + effect removed', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+\{\s*useRiskStats\s*\}\s+from\s+'\.\.\/lib\/use-risk-stats'/);
    assert.match(src, /useRiskStats\(\)/);
    assert.doesNotMatch(src, /const \[stats, setStats\]/);
    assert.doesNotMatch(src, /const \[windowHours, setWindowHours\]/);
  });
});

describe('extracted: useChatSseStream hook (v1.10.643)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-chat-sse-stream.ts');

  it('lives in lib/use-chat-sse-stream.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useChatSseStream/);
  });

  it('takes workerName + onOutput + onCleanup callbacks; returns sseConnected', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /onOutput:\s*\(raw:\s*string\)\s*=>\s*void/);
    assert.match(src, /onCleanup:\s*\(\)\s*=>\s*void/);
    assert.match(src, /sseConnected:\s*boolean/);
  });

  it('opens EventSource for /api/watch + decodes b64 output frames', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /new EventSource/);
    assert.match(src, /\/api\/watch\?name=/);
    assert.match(src, /b64decode\(data\.data\)/);
  });

  it('parent ChatView calls the hook; inline state + SSE effect removed', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+\{\s*useChatSseStream\s*\}\s+from\s+'\.\.\/lib\/use-chat-sse-stream'/);
    assert.match(parent, /useChatSseStream\(\{/);
    assert.doesNotMatch(parent, /const \[sseConnected, setSseConnected\]/);
    assert.doesNotMatch(parent, /new EventSource\(/);
  });
});

describe('extracted: useWikiSearch hook (v1.10.642)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-wiki-search.ts');

  it('lives in lib/use-wiki-search.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWikiSearch/);
  });

  it('returns 4 controlled-input pairs + search/searchError/searching/runSearch', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /query:\s*string/);
    assert.match(src, /type:\s*string/);
    assert.match(src, /includeStale:\s*boolean/);
    assert.match(src, /search:\s*SearchResponse\s*\|\s*null/);
    assert.match(src, /searching:\s*boolean/);
    assert.match(src, /runSearch:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns GET /api/wiki/search + auto-search-on-mount + 25 limit', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/wiki\/search/);
    assert.match(src, /qs\.set\('limit', '25'\)/);
    assert.match(src, /useEffect\(\(\) => \{ runSearch\(\); \}/);
  });

  it('parent WikiView calls the hook; inline state + runSearch removed', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+\{\s*useWikiSearch\s*\}\s+from\s+'\.\.\/lib\/use-wiki-search'/);
    assert.match(parent, /useWikiSearch\(\)/);
    assert.doesNotMatch(parent, /const \[query, setQuery\]/);
    assert.doesNotMatch(parent, /const runSearch = useCallback/);
  });
});

describe('extracted: useWikiBulkPublish hook (v1.10.641)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-wiki-bulk-publish.ts');

  it('lives in lib/use-wiki-bulk-publish.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWikiBulkPublish/);
  });

  it('takes runSearch arg; returns 5 state slots + 2 setters + 1 handler', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /runSearch:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /bulkBusy:\s*boolean/);
    assert.match(src, /bulkMsg:\s*string\s*\|\s*null/);
    assert.match(src, /bulkFailed:\s*boolean/);
    assert.match(src, /bulkGitCommit:\s*boolean/);
    assert.match(src, /bulkGitPush:\s*boolean/);
    assert.match(src, /handleBulkPublish:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns POST /api/wiki/publish-all + 6s toast + git commit/push toggles', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/wiki\/publish-all/);
    assert.match(src, /setTimeout\(\(\) => setBulkMsg\(null\),\s*6000\)/);
    assert.match(src, /gitCommit:\s*bulkGitCommit/);
    assert.match(src, /gitPush:\s*bulkGitPush/);
  });

  it('parent WikiView calls the hook; inline state + handler removed', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+\{\s*useWikiBulkPublish\s*\}\s+from\s+'\.\.\/lib\/use-wiki-bulk-publish'/);
    assert.match(parent, /useWikiBulkPublish\(\{/);
    assert.doesNotMatch(parent, /const \[bulkBusy, setBulkBusy\]/);
    assert.doesNotMatch(parent, /const handleBulkPublish/);
  });
});

describe('extracted: useWikiReopen hook (v1.10.640)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-wiki-reopen.ts');

  it('lives in lib/use-wiki-reopen.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWikiReopen/);
  });

  it('takes setPage + runSearch args; returns busy/msg/failed/handleReopen', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setPage:\s*\(next:\s*ReadResponse\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /runSearch:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /reopenBusy:\s*boolean/);
    assert.match(src, /reopenMsg:\s*string\s*\|\s*null/);
    assert.match(src, /reopenFailed:\s*boolean/);
    assert.match(src, /handleReopen:\s*\(relPath:\s*string\)\s*=>\s*Promise<void>/);
  });

  it('owns POST /api/wiki/reopen + the 6s timeout + post-success refetch', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/wiki\/reopen/);
    assert.match(src, /setTimeout\(\(\) => setReopenMsg\(null\),\s*6000\)/);
    assert.match(src, /apiPost<ReadResponse>\('\/api\/wiki\/read'/);
  });

  it('parent WikiView calls the hook; inline state + handler removed', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+\{\s*useWikiReopen\s*\}\s+from\s+'\.\.\/lib\/use-wiki-reopen'/);
    assert.match(parent, /useWikiReopen\(\{/);
    assert.doesNotMatch(parent, /const \[reopenBusy, setReopenBusy\]/);
    assert.doesNotMatch(parent, /const handleReopen/);
  });
});

describe('extracted: useWikiPage hook (v1.10.639)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-wiki-page.ts');

  it('lives in lib/use-wiki-page.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWikiPage/);
  });

  it('takes selectedPath arg; returns page/setPage/pageError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /selectedPath:\s*string\s*\|\s*null/);
    assert.match(src, /page:\s*ReadResponse\s*\|\s*null/);
    assert.match(src, /setPage:\s*\(next:\s*ReadResponse\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /pageError:\s*string\s*\|\s*null/);
  });

  it('owns the POST /api/wiki/read + cancellation flag', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<ReadResponse>\('\/api\/wiki\/read'/);
    assert.match(src, /let cancelled = false/);
  });

  it('parent WikiView calls the hook; inline state + effect removed', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+\{\s*useWikiPage\s*\}\s+from\s+'\.\.\/lib\/use-wiki-page'/);
    assert.match(parent, /useWikiPage\(selectedPath\)/);
    assert.doesNotMatch(parent, /const \[page, setPage\]/);
    assert.doesNotMatch(parent, /const \[pageError, setPageError\]/);
  });
});

describe('extracted: useToggleResetOnChange hook (v1.10.638)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-toggle-reset-on-change.ts');

  it('lives in lib/use-toggle-reset-on-change.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useToggleResetOnChange/);
  });

  it('takes a key arg; returns open/setOpen tuple; resets on change', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /key:\s*unknown/);
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /setOpen\(false\)/);
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*setOpen\(false\)/);
  });

  it('parent MeetingsView uses the hook for both contribOpen + forkOpen', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+\{\s*useToggleResetOnChange\s*\}\s+from\s+'\.\.\/lib\/use-toggle-reset-on-change'/);
    const calls = parent.match(/useToggleResetOnChange\(selectedId\)/g) || [];
    assert.ok(calls.length >= 2, `expected >= 2 hook call sites, saw ${calls.length}`);
  });

  it('parent MeetingsView no longer holds the inline open state + reset effects', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /const \[contribOpen, setContribOpen\]/);
    assert.doesNotMatch(parent, /const \[forkOpen, setForkOpen\]/);
  });
});

describe('extracted: usePersistedFontSize hook (v1.10.637)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-persisted-font-size.ts');

  it('lives in lib/use-persisted-font-size.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePersistedFontSize/);
  });

  it('takes defaultFont/minFont/maxFont args; returns fontSize/setFontSize/bumpFont', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /defaultFont:\s*number/);
    assert.match(src, /minFont:\s*number/);
    assert.match(src, /maxFont:\s*number/);
    assert.match(src, /fontSize:\s*number/);
    assert.match(src, /bumpFont:\s*\(delta:\s*number\)\s*=>\s*void/);
  });

  it('owns the FONT_STORAGE_KEY constant + clamp + readNumberStorage helpers', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /FONT_STORAGE_KEY/);
    assert.match(src, /function clamp/);
    assert.match(src, /function readNumberStorage/);
  });

  it('parent WorkerDetail calls the hook; inline state + helpers + persist effect removed', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+\{\s*usePersistedFontSize\s*\}\s+from\s+'\.\.\/lib\/use-persisted-font-size'/);
    assert.match(parent, /usePersistedFontSize\(\{/);
    // The const declarations are gone — only comment markers remain.
    assert.doesNotMatch(parent, /^const FONT_STORAGE_KEY/m);
    assert.doesNotMatch(parent, /^function readNumberStorage/m);
    assert.doesNotMatch(parent, /const \[fontSize, setFontSize\]/);
  });
});

describe('extracted: useScrollback hook (v1.10.636)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-scrollback.ts');

  it('lives in lib/use-scrollback.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useScrollback/);
  });

  it('takes workerName/tab/setActionMsg args; returns scrollbackContent/error/setError/fetchScrollback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /tab:\s*'screen'\s*\|\s*'scrollback'/);
    assert.match(src, /setActionMsg:\s*\(next:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /scrollbackContent:\s*string/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /fetchScrollback:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns the GET + 3s poll interval + tab-gated guard', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/scrollback\?name=/);
    assert.match(src, /setInterval\(fetchScrollback,\s*3000\)/);
    assert.match(src, /tab !== 'scrollback'/);
  });

  it('parent WorkerDetail calls the hook; inline state + 1 effect removed', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+\{\s*useScrollback\s*\}\s+from\s+'\.\.\/lib\/use-scrollback'/);
    assert.match(parent, /useScrollback\(\{/);
    assert.doesNotMatch(parent, /const \[scrollbackContent, setScrollbackContent\]/);
    assert.doesNotMatch(parent, /const \[error, setError\]/);
    assert.doesNotMatch(parent, /\/api\/scrollback\?name=/);
  });
});

describe('extracted: useWorkflowRuns hook (v1.10.635)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-workflow-runs.ts');

  it('lives in lib/use-workflow-runs.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkflowRuns/);
  });

  it('takes selectedId arg; returns runs/setRuns/expandedRunId/setExpandedRunId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /runs:\s*WorkflowRun\[\]/);
    assert.match(src, /expandedRunId:\s*string\s*\|\s*null/);
  });

  it('owns the per-selection GET /api/workflows/:id/runs + expanded-id reset', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/workflows\//);
    assert.match(src, /\/runs/);
    assert.match(src, /setExpandedRunId\(null\)/);
  });

  it('parent WorkflowEditor calls the hook; inline state + effect removed', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+\{\s*useWorkflowRuns\s*\}\s+from\s+'\.\.\/lib\/use-workflow-runs'/);
    assert.match(parent, /useWorkflowRuns\(selectedId\)/);
    assert.doesNotMatch(parent, /const \[runs, setRuns\]/);
    assert.doesNotMatch(parent, /const \[expandedRunId, setExpandedRunId\]/);
  });
});

describe('extracted: useSpecialistEnrichment hook (v1.10.634)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialist-enrichment.ts');

  it('lives in lib/use-specialist-enrichment.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistEnrichment/);
  });

  it('takes selectedId arg and returns Enrichment | null', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /Enrichment\s*\|\s*null/);
  });

  it('owns the GET ?include=audit,meetings + cancellation flag', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\?include=audit,meetings/);
    assert.match(src, /let cancelled = false/);
    assert.match(src, /cancelled = true/);
  });

  it('parent SpecialistsView calls the hook; inline state + effect removed', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+\{\s*useSpecialistEnrichment\s*\}\s+from\s+'\.\.\/lib\/use-specialist-enrichment'/);
    assert.match(parent, /useSpecialistEnrichment\(selectedId\)/);
    assert.doesNotMatch(parent, /const \[enrichment, setEnrichment\]/);
    assert.doesNotMatch(parent, /\?include=audit,meetings/);
  });
});

describe('extracted: useSpecialistActions hook (v1.10.633)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialist-actions.ts');

  it('lives in lib/use-specialist-actions.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistActions/);
  });

  it('takes selectedId/setSelectedId/setActionError/refresh args', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /setSelectedId:\s*\(next:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /setActionError:\s*\(next:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('returns 4 state slots + 2 confirm setters + 2 handlers', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /removeBusy:\s*boolean/);
    assert.match(src, /confirmRemoveId:\s*string\s*\|\s*null/);
    assert.match(src, /resetBusy:\s*boolean/);
    assert.match(src, /confirmResetId:\s*string\s*\|\s*null/);
    assert.match(src, /handleRemove:\s*\(id:\s*string\)\s*=>\s*Promise<void>/);
    assert.match(src, /handleScoreReset:\s*\(id:\s*string\)\s*=>\s*Promise<void>/);
  });

  it('owns the DELETE /api/specialists/:id and POST /api/specialists/:id/score-reset', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiDelete\(`\/api\/specialists\//);
    assert.match(src, /\/api\/specialists\/[^`]*\/score-reset/);
  });

  it('parent SpecialistsView calls the hook; inline state + handlers removed', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+\{\s*useSpecialistActions\s*\}\s+from\s+'\.\.\/lib\/use-specialist-actions'/);
    assert.match(parent, /useSpecialistActions\(\{/);
    assert.doesNotMatch(parent, /const \[removeBusy, setRemoveBusy\]/);
    assert.doesNotMatch(parent, /const \[resetBusy, setResetBusy\]/);
    assert.doesNotMatch(parent, /const handleRemove/);
    assert.doesNotMatch(parent, /const handleScoreReset/);
  });
});

describe('extracted: useWorkflowsList hook (v1.10.632)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-workflows-list.ts');

  it('lives in lib/use-workflows-list.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkflowsList/);
  });

  it('takes getSelectedId + onAutoSelect callbacks; returns workflows + busy/error + setters + refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /getSelectedId:\s*\(\)\s*=>\s*string\s*\|\s*null/);
    assert.match(src, /onAutoSelect:\s*\(id:\s*string\)\s*=>\s*void/);
    assert.match(src, /workflows:\s*Workflow\[\]/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns the GET + auto-select-first-on-mount logic', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<WorkflowsResponse>\('\/api\/workflows'\)/);
    assert.match(src, /onAutoSelect\(first\.id\)/);
  });

  it('parent WorkflowEditor calls the hook; inline state + effect removed', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+\{\s*useWorkflowsList\s*\}\s+from\s+'\.\.\/lib\/use-workflows-list'/);
    assert.match(parent, /useWorkflowsList\(\{/);
    assert.doesNotMatch(parent, /const \[workflows, setWorkflows\]/);
    assert.doesNotMatch(parent, /apiGet<WorkflowsResponse>/);
  });
});

describe('extracted: useSessionsActions hook (v1.10.631)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-sessions-actions.ts');

  it('lives in lib/use-sessions-actions.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSessionsActions/);
  });

  it('takes setSelection + setAttachError + refresh callbacks', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setSelection:/);
    assert.match(src, /setAttachError:\s*\(next:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /refreshSessions:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /refreshAttached:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns 3 handlers: handleAttachSubmit / handleNewChatSubmit / handleDetach', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /handleAttachSubmit:\s*\(pathValue:\s*string,\s*nameValue:\s*string\)/);
    assert.match(src, /handleNewChatSubmit:\s*\(req:/);
    assert.match(src, /handleDetach:\s*\(name:\s*string\)\s*=>\s*Promise<void>/);
    assert.match(src, /apiPost<AttachResponse>\('\/api\/attach',/);
    assert.match(src, /\/api\/task/);
    assert.match(src, /apiDelete\(`\/api\/attach\//);
  });

  it('owns the 6 modal/newChat state slots + 4 setters', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /modalOpen:\s*boolean/);
    assert.match(src, /modalBusy:\s*boolean/);
    assert.match(src, /modalError:\s*string\s*\|\s*null/);
    assert.match(src, /newChatOpen:\s*boolean/);
    assert.match(src, /newChatBusy:\s*boolean/);
    assert.match(src, /newChatError:\s*string\s*\|\s*null/);
  });

  it('parent SessionsView calls the hook; inline state + 3 handlers removed', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+\{\s*useSessionsActions\s*\}\s+from\s+'\.\.\/lib\/use-sessions-actions'/);
    assert.match(parent, /useSessionsActions\(\{/);
    assert.doesNotMatch(parent, /const \[modalOpen, setModalOpen\]/);
    assert.doesNotMatch(parent, /const handleAttachSubmit/);
    assert.doesNotMatch(parent, /const handleNewChatSubmit/);
    assert.doesNotMatch(parent, /const handleDetach/);
  });
});

describe('extracted: useSessionsList hook (v1.10.630)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-sessions-list.ts');

  it('lives in lib/use-sessions-list.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSessionsList/);
  });

  it('takes getSelection + onAutoSelect callbacks; returns 8 fields', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /getSelection:\s*\(\)\s*=>\s*Selection\s*\|\s*null/);
    assert.match(src, /onAutoSelect:\s*\(next:\s*Selection\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /data:\s*SessionsResponse\s*\|\s*null/);
    assert.match(src, /attached:\s*AttachedSession\[\]/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /attachError:\s*string\s*\|\s*null/);
    assert.match(src, /refreshSessions:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /refreshAttached:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns 2 GETs (sessions + attach/list) + auto-select-first-session-on-mount', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/sessions/);
    assert.match(src, /\/api\/attach\/list/);
    assert.match(src, /onAutoSelect\(\{ kind: 'session', id: first\.sessionId \}\)/);
  });

  it('parent SessionsView calls the hook; inline state + refresh callbacks removed', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+\{\s*useSessionsList\s*\}\s+from\s+'\.\.\/lib\/use-sessions-list'/);
    assert.match(parent, /useSessionsList\(\{/);
    assert.doesNotMatch(parent, /const \[data, setData\]/);
    assert.doesNotMatch(parent, /const \[attached, setAttached\]/);
    assert.doesNotMatch(parent, /apiGet<SessionsResponse>/);
  });

  it('parent SessionsView exports SessionsResponse + AttachedListResponse for hook typing', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /export\s+interface\s+SessionsResponse/);
    assert.match(parent, /export\s+interface\s+AttachedListResponse/);
  });
});

describe('extracted: useSessionsTour hook (v1.10.629)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-sessions-tour.ts');

  it('lives in lib/use-sessions-tour.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSessionsTour/);
  });

  it('returns showTour + dismissTour, reads/writes TOUR_STORAGE_KEY', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /showTour:\s*boolean/);
    assert.match(src, /dismissTour:\s*\(\)\s*=>\s*void/);
    assert.match(src, /TOUR_STORAGE_KEY/);
    assert.match(src, /window\.localStorage\.getItem/);
    assert.match(src, /window\.localStorage\.setItem/);
  });

  it('parent SessionsView calls the hook; inline state + effect removed', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+\{\s*useSessionsTour\s*\}\s+from\s+'\.\.\/lib\/use-sessions-tour'/);
    assert.match(parent, /useSessionsTour\(\)/);
    assert.doesNotMatch(parent, /const \[showTour, setShowTour\]/);
    assert.doesNotMatch(parent, /tourChecked\.current/);
  });
});

describe('extracted: useSpecialistsList hook (v1.10.628) — 100 ships milestone', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-list.ts');

  it('lives in lib/use-specialists-list.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistsList/);
  });

  it('returns data/error/loading/flaggedIds/refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /data:\s*ListResponse\s*\|\s*null/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /flaggedIds:\s*Set<string>/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns 2 GETs (specialists + underperformers) + 2 mount effects', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/specialists/);
    assert.match(src, /\/api\/specialists\/underperformers/);
    assert.match(src, /useEffect\(\(\) => \{ refresh\(\); \}/);
    assert.match(src, /useEffect\(\(\) => \{ refreshFlags\(\); \}/);
  });

  it('parent SpecialistsView calls the hook; inline state + 2 effects removed', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+\{\s*useSpecialistsList\s*\}\s+from\s+'\.\.\/lib\/use-specialists-list'/);
    assert.match(parent, /useSpecialistsList\(\)/);
    assert.doesNotMatch(parent, /const \[data, setData\]/);
    assert.doesNotMatch(parent, /const \[flaggedIds, setFlaggedIds\]/);
    assert.doesNotMatch(parent, /\/api\/specialists\/underperformers/);
  });

  it('parent SpecialistsView exports ListResponse for hook typing', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /export\s+interface\s+ListResponse/);
  });
});

describe('extracted: useStuckMeetings hook (v1.10.627)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-stuck-meetings.ts');

  it('lives in lib/use-stuck-meetings.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useStuckMeetings/);
  });

  it('returns StuckResponse | null and polls every 60s', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useStuckMeetings\(\):\s*StuckResponse\s*\|\s*null/);
    assert.match(src, /\/api\/meetings\/stuck\?hours=1/);
    assert.match(src, /window\.setInterval\(fetchStuck,\s*60000\)/);
  });

  it('parent MeetingsView calls the hook; inline state + effect removed', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+\{\s*useStuckMeetings\s*\}\s+from\s+'\.\.\/lib\/use-stuck-meetings'/);
    assert.match(parent, /const stuck = useStuckMeetings\(\)/);
    assert.doesNotMatch(parent, /const \[stuck, setStuck\]/);
    assert.doesNotMatch(parent, /\/api\/meetings\/stuck/);
  });
});

describe('extracted: useMeetingsList hook (v1.10.626)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meetings-list.ts');

  it('lives in lib/use-meetings-list.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingsList/);
  });

  it('takes listStatus/listTrack args; returns data/error/loading/refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /listStatus:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /listTrack:\s*Track\s*\|\s*''/);
    assert.match(src, /data:\s*MeetingsListResponse\s*\|\s*null/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('owns the GET, the SSE list stream, and the 90s fallback poll', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/meetings\?/);
    assert.match(src, /eventSourceUrl\('\/api\/meetings\/stream'\)/);
    assert.match(src, /window\.setInterval\(refresh,\s*90_000\)/);
  });

  it('parent MeetingsView calls the hook; inline state + 2 effects removed', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+\{\s*useMeetingsList\s*\}\s+from\s+'\.\.\/lib\/use-meetings-list'/);
    assert.match(parent, /useMeetingsList\(\{\s*listStatus,\s*listTrack\s*\}\)/);
    assert.doesNotMatch(parent, /const \[data, setData\]/);
    assert.doesNotMatch(parent, /const \[loading, setLoading\]/);
    assert.doesNotMatch(parent, /eventSourceUrl\('\/api\/meetings\/stream'\)/);
  });

  it('parent MeetingsView exports MeetingsListResponse for hook typing', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /export\s+interface\s+MeetingsListResponse/);
  });
});

describe('extracted: useMeetingDetailStream hook (v1.10.625)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-detail-stream.ts');

  it('lives in lib/use-meeting-detail-stream.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingDetailStream/);
  });

  it('takes selectedId arg, returns detail/detailError/streaming', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /detail:\s*MeetingDetail\s*\|\s*null/);
    assert.match(src, /detailError:\s*string\s*\|\s*null/);
    assert.match(src, /streaming:\s*boolean/);
  });

  it('opens EventSource and listens for snapshot/state/terminal frames', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /new EventSource/);
    assert.match(src, /eventSourceUrl/);
    assert.match(src, /addEventListener\('snapshot'/);
    assert.match(src, /addEventListener\('state'/);
    assert.match(src, /addEventListener\('terminal'/);
  });

  it('parent MeetingsView calls the hook; inline detail state + SSE effect removed', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+\{\s*useMeetingDetailStream\s*\}\s+from\s+'\.\.\/lib\/use-meeting-detail-stream'/);
    assert.match(parent, /useMeetingDetailStream\(selectedId\)/);
    assert.doesNotMatch(parent, /const \[detail, setDetail\]/);
    assert.doesNotMatch(parent, /const \[detailError, setDetailError\]/);
    // The detail-specific SSE endpoint signature is gone, but the
    // parent still owns the global meetings list stream.
    assert.doesNotMatch(parent, /\/api\/meetings\/\$\{encodeURIComponent\(selectedId\)\}\/stream/);
    assert.doesNotMatch(parent, /addEventListener\('snapshot'/);
  });
});

describe('extracted: useMeetingEnrichment hook (v1.10.624)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-enrichment.ts');

  it('lives in lib/use-meeting-enrichment.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingEnrichment/);
  });

  it('takes selectedId + detail args and returns lineage/actions/recap', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /detail:\s*MeetingDetail\s*\|\s*null/);
    assert.match(src, /lineage:\s*LineageResponse\s*\|\s*null/);
    assert.match(src, /actions:\s*ActionItemsResponse\s*\|\s*null/);
    assert.match(src, /recap:\s*RecapResponse\s*\|\s*null/);
  });

  it('owns 3 fetch effects + turnsTotal memo for actions/recap re-runs', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/meetings\/[^`]*\/lineage/);
    assert.match(src, /\/api\/meetings\/[^`]*\/action-items/);
    assert.match(src, /\/api\/meetings\/[^`]*\/recap/);
    assert.match(src, /turnsTotal/);
    assert.match(src, /useMemo/);
  });

  it('parent MeetingsView calls the hook; inline state + effects removed', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+\{\s*useMeetingEnrichment\s*\}\s+from\s+'\.\.\/lib\/use-meeting-enrichment'/);
    assert.match(parent, /useMeetingEnrichment\(\{/);
    assert.doesNotMatch(parent, /const \[lineage, setLineage\]/);
    assert.doesNotMatch(parent, /const \[actions, setActions\]/);
    assert.doesNotMatch(parent, /const \[recap, setRecap\]/);
    assert.doesNotMatch(parent, /turnsTotal/);
  });

  it('parent no longer imports the 3 unused response types', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+\{\s*type RecapResponse\s*\}\s+from/);
    assert.doesNotMatch(parent, /import\s+\{\s*type ActionItemsResponse\s*\}\s+from/);
    assert.doesNotMatch(parent, /import\s+\{\s*type LineageResponse\s*\}\s+from/);
  });
});

describe('extracted: useMeetingsSearch hook (v1.10.623)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meetings-search.ts');

  it('lives in lib/use-meetings-search.ts and exports the hook', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingsSearch/);
  });

  it('takes the args object (query/status/track/since/until/meetings)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /query:\s*string/);
    assert.match(src, /status:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /track:\s*Track\s*\|\s*''/);
    assert.match(src, /since:\s*string/);
    assert.match(src, /until:\s*string/);
    assert.match(src, /meetings:\s*MeetingSummary\[\]/);
  });

  it('owns the 250ms debounce + facet/total parsing + summary merge', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout/);
    assert.match(src, /250\)/);
    assert.match(src, /\/api\/meetings\/search\?/);
    assert.match(src, /summaryById/);
  });

  it('returns the 5-field result block (results / facets / total / error / searching)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /searchResults:\s*MeetingSummary\[\]\s*\|\s*null/);
    assert.match(src, /searchFacets:\s*SearchFacets\s*\|\s*null/);
    assert.match(src, /searchTotal:\s*number\s*\|\s*null/);
    assert.match(src, /searchError:\s*string\s*\|\s*null/);
    assert.match(src, /searching:\s*boolean/);
  });

  it('parent MeetingsView calls the hook; inline effect removed', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+\{\s*useMeetingsSearch\s*\}\s+from\s+'\.\.\/lib\/use-meetings-search'/);
    assert.match(parent, /useMeetingsSearch\(\{/);
    // Inline effect markers (apiGet call, summary merge) removed.
    assert.doesNotMatch(parent, /apiGet<\{[\s\S]*?\/api\/meetings\/search\?/);
    assert.doesNotMatch(parent, /summaryById\.get/);
  });
});

describe('extracted: SessionsListCard (v1.10.622)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsListCard.tsx');
    assert.match(src, /export default function SessionsListCard/);
  });

  it('takes the consolidated 22 props (header + attached + sessions list)', () => {
    const src = read('SessionsListCard.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /attachedCollapsed:\s*boolean/);
    assert.match(src, /filteredAttached:\s*AttachedSession\[\]/);
    assert.match(src, /filteredGroups:\s*SessionGroup\[\]/);
    assert.match(src, /selectedSessionId:\s*string\s*\|\s*null/);
    assert.match(src, /selectedAttachmentName:\s*string\s*\|\s*null/);
    assert.match(src, /onSelectAttached:\s*\(name:\s*string\)\s*=>\s*void/);
    assert.match(src, /onSelectSession:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('composes Header + AttachedSection + ListSection under a Card+CardContent', () => {
    const src = read('SessionsListCard.tsx');
    assert.match(src, /<Card\b/);
    assert.match(src, /<CardContent/);
    assert.match(src, /<SessionsHeader/);
    assert.match(src, /<SessionsAttachedSection/);
    assert.match(src, /<SessionsListSection/);
  });

  it('is imported and rendered by SessionsView', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsListCard\s+from\s+'\.\/SessionsListCard'/);
    assert.match(parent, /<SessionsListCard/);
  });

  it('parent SessionsView no longer imports the 3 sub-components directly', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /import\s+SessionsHeader\s+from/);
    assert.doesNotMatch(parent, /import\s+SessionsAttachedSection\s+from/);
    assert.doesNotMatch(parent, /import\s+SessionsListSection\s+from/);
  });
});

describe('extracted: ChatErrorBanners (v1.10.621)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatErrorBanners.tsx');
    assert.match(src, /export default function ChatErrorBanners/);
  });

  it('takes error/backfillError props', () => {
    const src = read('ChatErrorBanners.tsx');
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /backfillError:\s*string\s*\|\s*null/);
  });

  it('renders the destructive primary banner + amber secondary backfill banner', () => {
    const src = read('ChatErrorBanners.tsx');
    assert.match(src, /destructive/);
    assert.match(src, /amber-500/);
    assert.match(src, /Past-message backfill failed/);
    assert.match(src, /backfillError && !error/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatErrorBanners\s+from\s+'\.\/ChatErrorBanners'/);
    assert.match(parent, /<ChatErrorBanners/);
  });

  it('parent ChatView no longer holds the inline banner JSX', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /Past-message backfill failed/);
    assert.doesNotMatch(parent, /role="alert"/);
  });
});

describe('extracted: WikiSearchCardHeader (v1.10.620)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiSearchCardHeader.tsx');
    assert.match(src, /export default function WikiSearchCardHeader/);
  });

  it('takes the consolidated 16 props (search inputs + bulk publish state)', () => {
    const src = read('WikiSearchCardHeader.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /type:\s*string/);
    assert.match(src, /includeStale:\s*boolean/);
    assert.match(src, /searching:\s*boolean/);
    assert.match(src, /bulkBusy:\s*boolean/);
    assert.match(src, /bulkGitCommit:\s*boolean/);
    assert.match(src, /bulkGitPush:\s*boolean/);
    assert.match(src, /bulkMsg:\s*string\s*\|\s*null/);
    assert.match(src, /bulkFailed:\s*boolean/);
  });

  it('composes title + WikiSearchControls + WikiBulkPublishRow under a CardHeader', () => {
    const src = read('WikiSearchCardHeader.tsx');
    assert.match(src, /<CardHeader/);
    assert.match(src, /<CardTitle/);
    assert.match(src, /wiki\.title/);
    assert.match(src, /<WikiSearchControls/);
    assert.match(src, /<WikiBulkPublishRow/);
  });

  it('is imported and rendered by WikiView', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+WikiSearchCardHeader\s+from\s+'\.\/WikiSearchCardHeader'/);
    assert.match(parent, /<WikiSearchCardHeader/);
  });

  it('parent WikiView no longer imports WikiSearchControls/WikiBulkPublishRow directly', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /import\s+WikiSearchControls\s+from/);
    assert.doesNotMatch(parent, /import\s+WikiBulkPublishRow\s+from/);
  });
});

describe('extracted: WikiPageDetailHeader (v1.10.619)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiPageDetailHeader.tsx');
    assert.match(src, /export default function WikiPageDetailHeader/);
  });

  it('takes page/selectedPath + reopen state + onReopen props', () => {
    const src = read('WikiPageDetailHeader.tsx');
    assert.match(src, /page:\s*ReadResponse\s*\|\s*null/);
    assert.match(src, /selectedPath:\s*string\s*\|\s*null/);
    assert.match(src, /reopenBusy:\s*boolean/);
    assert.match(src, /reopenMsg:\s*string\s*\|\s*null/);
    assert.match(src, /reopenFailed:\s*boolean/);
    assert.match(src, /onReopen:\s*\(path:\s*string\)\s*=>\s*void/);
  });

  it('renders title + Reopen button (when not already reopened) + reopen message', () => {
    const src = read('WikiPageDetailHeader.tsx');
    assert.match(src, /wiki\.title\.select/);
    assert.match(src, /wiki\.reopen\.label/);
    assert.match(src, /wiki\.tooltip\.reopen/);
    assert.match(src, /wiki\.reopen/);
    assert.match(src, /frontmatter\['status'\] !== 'reopened'/);
  });

  it('is imported and rendered by WikiView', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+WikiPageDetailHeader\s+from\s+'\.\/WikiPageDetailHeader'/);
    assert.match(parent, /<WikiPageDetailHeader/);
    assert.match(parent, /onReopen=\{handleReopen\}/);
  });

  it('parent WikiView no longer holds the inline detail header', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.reopen\.label/);
    assert.doesNotMatch(parent, /<RotateCcw\b/);
  });
});

describe('extracted: SpecialistsListCardHeader (v1.10.618)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsListCardHeader.tsx');
    assert.match(src, /export default function SpecialistsListCardHeader/);
  });

  it('takes the consolidated 15 props (title-bar + filter)', () => {
    const src = read('SpecialistsListCardHeader.tsx');
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /addOpen:\s*boolean/);
    assert.match(src, /actionError:\s*string\s*\|\s*null/);
    assert.match(src, /filter:\s*string/);
    assert.match(src, /tierFilter:\s*string/);
    assert.match(src, /vetoOnly:\s*boolean/);
    assert.match(src, /filteredCount:\s*number/);
    assert.match(src, /totalCount:\s*number/);
  });

  it('composes TitleBar + SearchFilters under a CardHeader', () => {
    const src = read('SpecialistsListCardHeader.tsx');
    assert.match(src, /<CardHeader/);
    assert.match(src, /<SpecialistsListTitleBar/);
    assert.match(src, /<SpecialistsSearchFilters/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsListCardHeader\s+from\s+'\.\/SpecialistsListCardHeader'/);
    assert.match(parent, /<SpecialistsListCardHeader/);
  });

  it('parent SpecialistsView no longer imports TitleBar/SearchFilters directly', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /import\s+SpecialistsListTitleBar\s+from/);
    assert.doesNotMatch(parent, /import\s+SpecialistsSearchFilters\s+from/);
  });
});

describe('extracted: SpecialistsListTitleBar (v1.10.617)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsListTitleBar.tsx');
    assert.match(src, /export default function SpecialistsListTitleBar/);
  });

  it('takes loading + addOpen + actionError + 4 callback props', () => {
    const src = read('SpecialistsListTitleBar.tsx');
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /addOpen:\s*boolean/);
    assert.match(src, /actionError:\s*string\s*\|\s*null/);
    assert.match(src, /onToggleAdd:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onCloseAdd:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAdded:\s*\(newId:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + Add toggle + Refresh + error alert + AddPanel', () => {
    const src = read('SpecialistsListTitleBar.tsx');
    assert.match(src, /specialists\.title/);
    assert.match(src, /specialists\.add\.label/);
    assert.match(src, /specialists\.action\.refresh/);
    assert.match(src, /<SpecialistsAddPanel/);
  });

  it('is imported and rendered by SpecialistsListCardHeader (v1.10.618)', () => {
    const parent = read('SpecialistsListCardHeader.tsx');
    assert.match(parent, /import\s+SpecialistsListTitleBar\s+from\s+'\.\/SpecialistsListTitleBar'/);
    assert.match(parent, /<SpecialistsListTitleBar/);
    assert.match(parent, /onRefresh=\{onRefresh\}/);
  });

  it('parent SpecialistsView no longer holds the inline title row + add panel', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /import\s+SpecialistsAddPanel\s+from/);
    assert.doesNotMatch(parent, /specialists\.add\.label/);
    assert.doesNotMatch(parent, /<Plus\b/);
  });
});

describe('extracted: WorkflowRunsPanel (v1.10.616)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowRunsPanel.tsx');
    assert.match(src, /export default function WorkflowRunsPanel/);
  });

  it('takes runs + expandedRunId + onToggleExpanded props', () => {
    const src = read('WorkflowRunsPanel.tsx');
    assert.match(src, /runs:\s*WorkflowRun\[\]/);
    assert.match(src, /expandedRunId:\s*string\s*\|\s*null/);
    assert.match(src, /onToggleExpanded:\s*\(next:\s*string\s*\|\s*null\)\s*=>\s*void/);
  });

  it('owns runStatusVariant + BadgeVariant alias and renders the expandable run list', () => {
    const src = read('WorkflowRunsPanel.tsx');
    assert.match(src, /function runStatusVariant/);
    assert.match(src, /type BadgeVariant/);
    assert.match(src, /workflows\.recentRuns/);
    assert.match(src, /workflows\.runs\.empty/);
    assert.match(src, /workflows\.runs\.running/);
    assert.match(src, /workflows\.runs\.noNodeResults/);
    assert.match(src, /workflows\.runs\.nodeCount/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowRunsPanel\s+from\s+'\.\/WorkflowRunsPanel'/);
    assert.match(parent, /<WorkflowRunsPanel/);
    assert.match(parent, /onToggleExpanded=\{setExpandedRunId\}/);
  });

  it('parent WorkflowEditor no longer holds the inline runs Panel', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /workflows\.recentRuns/);
    assert.doesNotMatch(parent, /function runStatusVariant/);
    assert.doesNotMatch(parent, /<Panel\b/);
  });
});

describe('extracted: MeetingsListCardHeader (v1.10.615)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsListCardHeader.tsx');
    assert.match(src, /export default function MeetingsListCardHeader/);
  });

  it('takes the consolidated props (creating + filters + search state + composer)', () => {
    const src = read('MeetingsListCardHeader.tsx');
    assert.match(src, /creating:\s*boolean/);
    assert.match(src, /onToggleCreating:\s*\(\)\s*=>\s*void/);
    assert.match(src, /listStatus:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /listTrack:\s*Track\s*\|\s*''/);
    assert.match(src, /searchQuery:\s*string/);
    assert.match(src, /searchResults:\s*MeetingSummary\[\]\s*\|\s*null/);
    assert.match(src, /onCloseComposer:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onCreatedComposer:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('composes the 4 sub-components (TitleBar + ListFilterRow + SearchSection + Composer)', () => {
    const src = read('MeetingsListCardHeader.tsx');
    assert.match(src, /<CardHeader/);
    assert.match(src, /<MeetingsListTitleBar/);
    assert.match(src, /<MeetingsListFilterRow/);
    assert.match(src, /<MeetingsSearchSection/);
    assert.match(src, /<MeetingsComposer/);
    assert.match(src, /!searchQuery\.trim\(\)/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsListCardHeader\s+from\s+'\.\/MeetingsListCardHeader'/);
    assert.match(parent, /<MeetingsListCardHeader/);
  });

  it('parent MeetingsView no longer imports the 4 sub-components directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsListTitleBar\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsListFilterRow\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsSearchSection\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsComposer\s+from/);
  });
});

describe('extracted: MeetingsDetailCardHeader (v1.10.614)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailCardHeader.tsx');
    assert.match(src, /export default function MeetingsDetailCardHeader/);
  });

  it('takes title/selection/streaming + 4 contrib/fork callbacks', () => {
    const src = read('MeetingsDetailCardHeader.tsx');
    assert.match(src, /title:\s*string/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /detail:\s*MeetingDetail\s*\|\s*null/);
    assert.match(src, /streaming:\s*boolean/);
    assert.match(src, /contribOpen:\s*boolean/);
    assert.match(src, /onContribToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /forkOpen:\s*boolean/);
    assert.match(src, /onForkToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForkClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForked:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('composes TitleBar + 3 status-conditional action composites under a CardHeader', () => {
    const src = read('MeetingsDetailCardHeader.tsx');
    assert.match(src, /<CardHeader/);
    assert.match(src, /<MeetingsDetailTitleBar/);
    assert.match(src, /<MeetingsDetailPendingActions/);
    assert.match(src, /<MeetingsDetailInProgressActions/);
    assert.match(src, /<MeetingsDetailCompletedActions/);
  });

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsDetailCardHeader\s+from\s+'\.\/MeetingsDetailCardHeader'/);
    assert.match(parent, /<MeetingsDetailCardHeader/);
  });

  it('parent MeetingsView no longer holds inline detail header sub-imports', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsDetailTitleBar\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsDetailPendingActions\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsDetailInProgressActions\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsDetailCompletedActions\s+from/);
  });
});

describe('extracted: MeetingsSearchSection (v1.10.613)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchSection.tsx');
    assert.match(src, /export default function MeetingsSearchSection/);
  });

  it('takes 16 props (query + 4 filter pairs + results/facets/total + error)', () => {
    const src = read('MeetingsSearchSection.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /onChangeQuery/);
    assert.match(src, /searchStatus:\s*MeetingStatus\s*\|\s*''/);
    assert.match(src, /searchTrack:\s*Track\s*\|\s*''/);
    assert.match(src, /searchSince:\s*string/);
    assert.match(src, /searchUntil:\s*string/);
    assert.match(src, /searchResults:\s*MeetingSummary\[\]\s*\|\s*null/);
    assert.match(src, /searchFacets:\s*SearchFacets\s*\|\s*null/);
    assert.match(src, /searchTotal:\s*number\s*\|\s*null/);
    assert.match(src, /searchError:\s*string\s*\|\s*null/);
  });

  it('composes Input + FilterRow (when query non-empty) + Facets (when results) + error', () => {
    const src = read('MeetingsSearchSection.tsx');
    assert.match(src, /<MeetingsSearchInput/);
    assert.match(src, /<MeetingsSearchFilterRow/);
    assert.match(src, /<MeetingsSearchFacets/);
    assert.match(src, /query\.trim\(\)/);
    assert.match(src, /searchResults && searchFacets/);
  });

  it('parent MeetingsSearchFacets exports Track + SearchFacets', () => {
    const facets = read('MeetingsSearchFacets.tsx');
    assert.match(facets, /export\s+type\s+Track/);
    assert.match(facets, /export\s+interface\s+SearchFacets/);
  });

  it('is imported and rendered by MeetingsListCardHeader (v1.10.615)', () => {
    const parent = read('MeetingsListCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsSearchSection\s+from\s+'\.\/MeetingsSearchSection'/);
    assert.match(parent, /<MeetingsSearchSection/);
  });

  it('parent MeetingsView no longer imports the search siblings directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsSearchSection\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsSearchInput\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsSearchFacets\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsSearchFilterRow\s+from/);
  });
});

describe('extracted: ChatComposer (v1.10.612)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatComposer.tsx');
    assert.match(src, /export default function ChatComposer/);
  });

  it('takes textareaRef + 4 controlled inputs + 3 callback props', () => {
    const src = read('ChatComposer.tsx');
    assert.match(src, /textareaRef:\s*RefObject<HTMLTextAreaElement>/);
    assert.match(src, /input:\s*string/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /sending:\s*boolean/);
    assert.match(src, /onChangeInput:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onKeyDown:\s*\(e:\s*KeyboardEvent<HTMLTextAreaElement>\)\s*=>\s*void/);
    assert.match(src, /onSubmit:\s*\(e\?:\s*FormEvent<HTMLFormElement>\)\s*=>\s*void/);
  });

  it('renders textarea (Enter submits, Shift+Enter newlines via parent) + Send button', () => {
    const src = read('ChatComposer.tsx');
    assert.match(src, /chatView\.placeholder\.message/);
    assert.match(src, /chatView\.send/);
    assert.match(src, /chatView\.sending/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatComposer\s+from\s+'\.\/ChatComposer'/);
    assert.match(parent, /<ChatComposer/);
    assert.match(parent, /onSubmit=\{handleSubmit\}/);
  });

  it('parent ChatView no longer holds the inline form', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /<form onSubmit=/);
    assert.doesNotMatch(parent, /chatView\.placeholder\.message/);
    assert.doesNotMatch(parent, /<Button\b/);
  });
});

describe('extracted: WorkerDetailComposer (v1.10.611)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerDetailComposer.tsx');
    assert.match(src, /export default function WorkerDetailComposer/);
  });

  it('takes inputText/busy + 5 callback props', () => {
    const src = read('WorkerDetailComposer.tsx');
    assert.match(src, /inputText:\s*string/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /onChangeInputText:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onSend:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onEnter:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onMerge:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
  });

  it('renders text input + Send (icon) + Enter + Merge + Close buttons', () => {
    const src = read('WorkerDetailComposer.tsx');
    assert.match(src, /workerDetail\.composer\.placeholder/);
    assert.match(src, /workerDetail\.composer\.sendText/);
    assert.match(src, /workerDetail\.composer\.enter/);
    assert.match(src, /workerDetail\.composer\.merge/);
    assert.match(src, /workerDetail\.composer\.close/);
    assert.match(src, /e\.key === 'Enter' && !e\.shiftKey/);
  });

  it('is imported and rendered by WorkerDetail', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+WorkerDetailComposer\s+from\s+'\.\/WorkerDetailComposer'/);
    assert.match(parent, /<WorkerDetailComposer/);
    assert.match(parent, /onSend=\{handleSend\}/);
  });

  it('parent WorkerDetail no longer holds the inline composer row', () => {
    const parent = read('WorkerDetail.tsx');
    assert.doesNotMatch(parent, /workerDetail\.composer\.placeholder/);
    assert.doesNotMatch(parent, /<GitMerge/);
  });
});

describe('extracted: WorkerDetailKeysRow (v1.10.610)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerDetailKeysRow.tsx');
    assert.match(src, /export default function WorkerDetailKeysRow/);
  });

  it('takes busy + onSendKey props with SendableKey union', () => {
    const src = read('WorkerDetailKeysRow.tsx');
    assert.match(src, /export\s+type\s+SendableKey/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /onSendKey:\s*\(key:\s*SendableKey\)\s*=>\s*void/);
  });

  it('renders the 4 control keys (Esc/C-c/C-d/Tab) + 4 arrows + heading; mobile only', () => {
    const src = read('WorkerDetailKeysRow.tsx');
    assert.match(src, /workerDetail\.keys\.heading/);
    assert.match(src, /workerDetail\.keys\.esc/);
    assert.match(src, /workerDetail\.keys\.ctrlC/);
    assert.match(src, /workerDetail\.keys\.ctrlD/);
    assert.match(src, /workerDetail\.keys\.tab/);
    assert.match(src, /workerDetail\.keys\.arrowUp/);
    assert.match(src, /md:hidden/);
  });

  it('is imported and rendered by WorkerDetail', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+WorkerDetailKeysRow\s+from\s+'\.\/WorkerDetailKeysRow'/);
    assert.match(parent, /<WorkerDetailKeysRow/);
    assert.match(parent, /onSendKey=\{sendKey\}/);
  });

  it('parent WorkerDetail no longer holds the inline keys row', () => {
    const parent = read('WorkerDetail.tsx');
    assert.doesNotMatch(parent, /workerDetail\.keys\.heading/);
    assert.doesNotMatch(parent, /workerDetail\.keys\.arrowUp/);
  });
});

describe('extracted: WikiSearchControls (v1.10.609)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiSearchControls.tsx');
    assert.match(src, /export default function WikiSearchControls/);
  });

  it('takes 4 controlled-input pairs + searching + onSearch props', () => {
    const src = read('WikiSearchControls.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /onQuery:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /type:\s*string/);
    assert.match(src, /onType:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /includeStale:\s*boolean/);
    assert.match(src, /onIncludeStale:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /searching:\s*boolean/);
    assert.match(src, /onSearch:\s*\(\)\s*=>\s*void/);
  });

  it('renders the input + type select + includeStale + Search button', () => {
    const src = read('WikiSearchControls.tsx');
    assert.match(src, /wiki\.search\.placeholder/);
    assert.match(src, /TYPE_OPTIONS\.map/);
    assert.match(src, /wiki\.includeStale/);
    assert.match(src, /wiki\.search\.button/);
    assert.match(src, /e\.key === 'Enter'/);
  });

  it('parent WikiView exports TYPE_OPTIONS; consumed by WikiSearchCardHeader (v1.10.620)', () => {
    const parent = read('WikiView.tsx');
    const card = read('WikiSearchCardHeader.tsx');
    assert.match(parent, /export\s+const\s+TYPE_OPTIONS/);
    assert.match(card, /import\s+WikiSearchControls\s+from\s+'\.\/WikiSearchControls'/);
    assert.match(card, /<WikiSearchControls/);
    // Parent still wires onSearch through the composite.
    assert.match(parent, /onSearch=\{runSearch\}/);
  });

  it('parent WikiView no longer holds the inline search controls', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.search\.placeholder/);
    assert.doesNotMatch(parent, /TYPE_OPTIONS\.map/);
  });
});

describe('extracted: WikiBulkPublishRow (v1.10.608)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /export default function WikiBulkPublishRow/);
  });

  it('takes busy + git toggles + msg/failed + 3 callback props', () => {
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /gitCommit:\s*boolean/);
    assert.match(src, /gitPush:\s*boolean/);
    assert.match(src, /msg:\s*string\s*\|\s*null/);
    assert.match(src, /failed:\s*boolean/);
    assert.match(src, /onGitCommit:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /onGitPush:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /onPublish:\s*\(\)\s*=>\s*void/);
  });

  it('renders publish button + 2 git toggles + result message; preserves toggle interlock', () => {
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /wiki\.publishAll\.label/);
    assert.match(src, /wiki\.publishAll\.publishing/);
    assert.match(src, /wiki\.gitCommit/);
    assert.match(src, /wiki\.gitPush/);
    assert.match(src, /if \(!e\.target\.checked\) onGitPush\(false\)/);
    assert.match(src, /if \(e\.target\.checked\) onGitCommit\(true\)/);
  });

  it('is imported and rendered by WikiSearchCardHeader (v1.10.620); parent wires onPublish', () => {
    const parent = read('WikiView.tsx');
    const card = read('WikiSearchCardHeader.tsx');
    assert.match(card, /import\s+WikiBulkPublishRow\s+from\s+'\.\/WikiBulkPublishRow'/);
    assert.match(card, /<WikiBulkPublishRow/);
    assert.match(parent, /onBulkPublish=\{handleBulkPublish\}/);
  });

  it('parent WikiView no longer holds the inline publish row', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.publishAll\.label/);
    assert.doesNotMatch(parent, /wiki\.gitCommit/);
  });
});

describe('extracted: SessionsRightPane (v1.10.607)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsRightPane.tsx');
    assert.match(src, /export default function SessionsRightPane/);
  });

  it('takes selection + empty-state flag + 2 callback props', () => {
    const src = read('SessionsRightPane.tsx');
    assert.match(src, /selection:\s*Selection\s*\|\s*null/);
    assert.match(src, /showStartFirstEmptyState:\s*boolean/);
    assert.match(src, /onNewChat:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAttachNew:\s*\(\)\s*=>\s*void/);
  });

  it('composes ConversationView (session+attached cases) + SessionsComparisonCard + SessionsEmptyPanel', () => {
    const src = read('SessionsRightPane.tsx');
    assert.match(src, /<ConversationView/);
    assert.match(src, /<SessionsComparisonCard/);
    assert.match(src, /<SessionsEmptyPanel/);
    assert.match(src, /selection\.kind === 'session'/);
    assert.match(src, /selection\.kind === 'attached'/);
  });

  it('parent SessionsView exports Selection and imports SessionsRightPane', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /export\s+type\s+Selection/);
    assert.match(parent, /import\s+SessionsRightPane\s+from\s+'\.\/SessionsRightPane'/);
    assert.match(parent, /<SessionsRightPane/);
  });

  it('parent SessionsView no longer imports the 3 right-pane sub-components directly', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /import\s+ConversationView\s+from/);
    assert.doesNotMatch(parent, /import\s+SessionsComparisonCard\s+from/);
    assert.doesNotMatch(parent, /import\s+SessionsEmptyPanel\s+from/);
  });
});

describe('extracted: RiskStatsGrid (v1.10.606)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskStatsGrid.tsx');
    assert.match(src, /export default function RiskStatsGrid/);
  });

  it('takes a single stats StatsResponse prop', () => {
    const src = read('RiskStatsGrid.tsx');
    assert.match(src, /stats:\s*StatsResponse/);
    assert.match(src, /from\s+'\.\.\/pages\/Risk'/);
  });

  it('renders the totals tiles + by-level breakdown + top reasons/workers + rotations banner', () => {
    const src = read('RiskStatsGrid.tsx');
    assert.match(src, /risk\.stats\.totalEvents/);
    assert.match(src, /risk\.stats\.enforced/);
    assert.match(src, /risk\.stats\.dryRun/);
    assert.match(src, /risk\.stats\.shadowExec/);
    assert.match(src, /risk\.stats\.topReasons/);
    assert.match(src, /risk\.stats\.topWorkers/);
    assert.match(src, /ruleSetRotations > 1/);
  });

  it('parent pages/Risk exports StatsResponse', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /export\s+interface\s+StatsResponse/);
  });

  it('parent Risk page imports + renders RiskStatsGrid; inline grid removed', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+RiskStatsGrid\s+from\s+'\.\.\/components\/RiskStatsGrid'/);
    assert.match(src, /<RiskStatsGrid\s+stats=\{stats\}/);
    assert.doesNotMatch(src, /risk\.stats\.totalEvents/);
    assert.doesNotMatch(src, /ruleSetRotations > 1/);
  });
});

describe('extracted: RiskCheckResult (v1.10.605)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskCheckResult.tsx');
    assert.match(src, /export default function RiskCheckResult/);
  });

  it('takes a single result CheckResponse prop', () => {
    const src = read('RiskCheckResult.tsx');
    assert.match(src, /result:\s*CheckResponse/);
    assert.match(src, /from\s+'\.\.\/pages\/Risk'/);
  });

  it('renders the level/action/wouldDeny/denyList badges + threshold caption + reasons + intent rollups', () => {
    const src = read('RiskCheckResult.tsx');
    assert.match(src, /risk\.badge\.wouldDeny/);
    assert.match(src, /risk\.badge\.denyList/);
    assert.match(src, /risk\.threshold/);
    assert.match(src, /riskPage\.reasons/);
    assert.match(src, /riskPage\.decoded/);
    assert.match(src, /riskPage\.staticIntent/);
    assert.match(src, /risk\.intent\.writes/);
    assert.match(src, /risk\.intent\.destructive/);
  });

  it('parent pages/Risk exports CheckReason/CheckResponse + LEVEL_TONE/ACTION_TONE', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /export\s+interface\s+CheckReason/);
    assert.match(src, /export\s+interface\s+CheckResponse/);
    assert.match(src, /export\s+const\s+LEVEL_TONE/);
    assert.match(src, /export\s+const\s+ACTION_TONE/);
  });

  it('parent Risk page imports + renders RiskCheckResult; inline panel removed', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+RiskCheckResult\s+from\s+'\.\.\/components\/RiskCheckResult'/);
    assert.match(src, /<RiskCheckResult\s+result=\{checkResult\}/);
    assert.doesNotMatch(src, /risk\.badge\.wouldDeny/);
    assert.doesNotMatch(src, /riskPage\.staticIntent/);
  });
});

describe('extracted: ChatMessageLog (v1.10.604)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatMessageLog.tsx');
    assert.match(src, /export default function ChatMessageLog/);
  });

  it('takes scrollRef + 8 controlled props', () => {
    const src = read('ChatMessageLog.tsx');
    assert.match(src, /scrollRef:\s*RefObject<HTMLDivElement>/);
    assert.match(src, /onScroll:\s*\(e:\s*UIEvent<HTMLDivElement>\)\s*=>\s*void/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /backfillLoading:\s*boolean/);
    assert.match(src, /backfillSource:\s*BackfillSource/);
    assert.match(src, /hasOlder:\s*boolean/);
    assert.match(src, /loadingOlder:\s*boolean/);
    assert.match(src, /messages:\s*ChatMessage\[\]/);
    assert.match(src, /onLoadOlder:\s*\(\)\s*=>\s*void/);
  });

  it('renders backfill skeleton + empty state + per-message bubbles', () => {
    const src = read('ChatMessageLog.tsx');
    assert.match(src, /chat\.loadingPast/);
    assert.match(src, /chat\.empty/);
    assert.match(src, /chat\.olderLoading/);
    assert.match(src, /chat\.loadOlder/);
    assert.match(src, /messages\.map/);
    assert.match(src, /isUser \? 'justify-end' : 'justify-start'/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatMessageLog\s+from\s+'\.\/ChatMessageLog'/);
    assert.match(parent, /<ChatMessageLog/);
    assert.match(parent, /scrollRef=\{scrollRef\}/);
    assert.match(parent, /onScroll=\{onScroll\}/);
  });

  it('parent ChatView no longer holds the inline scroll container or per-message JSX', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /chat\.empty/);
    assert.doesNotMatch(parent, /messages\.map/);
    assert.doesNotMatch(parent, /<Loader2/);
  });
});

describe('extracted: WorkflowSelectedHeader (v1.10.603)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowSelectedHeader.tsx');
    assert.match(src, /export default function WorkflowSelectedHeader/);
  });

  it('takes workflow + busy + inputs state + 3 callback props', () => {
    const src = read('WorkflowSelectedHeader.tsx');
    assert.match(src, /workflow:\s*Workflow/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /inputsOpen:\s*boolean/);
    assert.match(src, /inputsJson:\s*string/);
    assert.match(src, /inputsError:\s*string\s*\|\s*null/);
    assert.match(src, /onToggleInputs:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onChangeInputsJson:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRun:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + description + Inputs toggle + Run button + JSON textarea', () => {
    const src = read('WorkflowSelectedHeader.tsx');
    assert.match(src, /workflows\.noDescription/);
    assert.match(src, /workflows\.inputs\.toggle\.show/);
    assert.match(src, /workflows\.inputs\.toggle\.hide/);
    assert.match(src, /workflows\.run\.button/);
    assert.match(src, /workflows\.inputs\.label/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowSelectedHeader\s+from\s+'\.\/WorkflowSelectedHeader'/);
    assert.match(parent, /<WorkflowSelectedHeader/);
    assert.match(parent, /onRun=\{handleRun\}/);
    assert.match(parent, /onChangeInputsJson=\{setInputsJson\}/);
  });

  it('parent WorkflowEditor no longer holds the inline selected-header card', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /workflows\.run\.button/);
    assert.doesNotMatch(parent, /workflows\.inputs\.toggle\.show/);
  });
});

describe('extracted: MeetingsListTitleBar (v1.10.602)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsListTitleBar.tsx');
    assert.match(src, /export default function MeetingsListTitleBar/);
  });

  it('takes creating/loading + 2 callback props', () => {
    const src = read('MeetingsListTitleBar.tsx');
    assert.match(src, /creating:\s*boolean/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /onToggleCreating:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + new + refresh buttons with i18n keys', () => {
    const src = read('MeetingsListTitleBar.tsx');
    assert.match(src, /meetings\.title/);
    assert.match(src, /meetings\.action\.newLabel/);
    assert.match(src, /meetings\.action\.refresh/);
  });

  it('is imported and rendered by MeetingsListCardHeader (v1.10.615)', () => {
    const parent = read('MeetingsListCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsListTitleBar\s+from\s+'\.\/MeetingsListTitleBar'/);
    assert.match(parent, /<MeetingsListTitleBar/);
    assert.match(parent, /onRefresh=\{onRefresh\}/);
  });

  it('parent MeetingsView no longer holds the inline title row', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /meetings\.action\.newLabel/);
    assert.doesNotMatch(parent, /<CardTitle/);
  });
});

describe('extracted: SessionsEmptyPanel (v1.10.601)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsEmptyPanel.tsx');
    assert.match(src, /export default function SessionsEmptyPanel/);
  });

  it('takes showStartFirst + 2 callback props', () => {
    const src = read('SessionsEmptyPanel.tsx');
    assert.match(src, /showStartFirst:\s*boolean/);
    assert.match(src, /onNewChat:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAttachNew:\s*\(\)\s*=>\s*void/);
  });

  it('renders the two distinct empty states (start-first CTAs vs select prompt)', () => {
    const src = read('SessionsEmptyPanel.tsx');
    assert.match(src, /sessions\.empty\.startFirstTitle/);
    assert.match(src, /sessions\.empty\.startFirstChat/);
    assert.match(src, /sessions\.empty\.attachExisting/);
    assert.match(src, /sessions\.empty\.selectPrompt/);
    assert.match(src, /<SessionsComparisonCard/);
  });

  it('is imported and rendered by SessionsRightPane (v1.10.607)', () => {
    const parent = read('SessionsRightPane.tsx');
    assert.match(parent, /import\s+SessionsEmptyPanel\s+from\s+'\.\/SessionsEmptyPanel'/);
    assert.match(parent, /<SessionsEmptyPanel/);
    assert.match(parent, /showStartFirst=\{showStartFirstEmptyState\}/);
  });

  it('parent SessionsView no longer holds the inline empty-state Cards', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /sessions\.empty\.startFirstTitle/);
    assert.doesNotMatch(parent, /sessions\.empty\.selectPrompt/);
  });
});

describe('extracted: WikiPageDetail (v1.10.600)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiPageDetail.tsx');
    assert.match(src, /export default function WikiPageDetail/);
  });

  it('takes selectedPath/page/pageError + onSelectPath props', () => {
    const src = read('WikiPageDetail.tsx');
    assert.match(src, /selectedPath:\s*string\s*\|\s*null/);
    assert.match(src, /page:\s*ReadResponse\s*\|\s*null/);
    assert.match(src, /pageError:\s*string\s*\|\s*null/);
    assert.match(src, /onSelectPath:\s*\(path:\s*string\)\s*=>\s*void/);
  });

  it('renders empty/error/loading states + metadata grid + related chips + body pre', () => {
    const src = read('WikiPageDetail.tsx');
    assert.match(src, /wiki\.empty\.pickPage/);
    assert.match(src, /wiki\.loadingPage/);
    assert.match(src, /wiki\.field\.type/);
    assert.match(src, /wiki\.field\.status/);
    assert.match(src, /wiki\.field\.lastReviewed/);
    assert.match(src, /wiki\.relatedCount/);
    assert.match(src, /\{page\.body\}/);
  });

  it('parent WikiView exports ReadResponse and imports WikiPageDetail', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /export\s+interface\s+ReadResponse/);
    assert.match(parent, /import\s+WikiPageDetail\s+from\s+'\.\/WikiPageDetail'/);
    assert.match(parent, /<WikiPageDetail/);
    assert.match(parent, /onSelectPath=\{setSelectedPath\}/);
  });

  it('parent WikiView no longer holds the inline detail body', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /wiki\.empty\.pickPage/);
    assert.doesNotMatch(parent, /wiki\.field\.lastReviewed/);
    assert.doesNotMatch(parent, /wiki\.relatedCount/);
  });
});

describe('extracted: SpecialistsEnrichmentPanels (v1.10.599)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsEnrichmentPanels.tsx');
    assert.match(src, /export default function SpecialistsEnrichmentPanels/);
  });

  it('takes recentAudit/recentMeetings props', () => {
    const src = read('SpecialistsEnrichmentPanels.tsx');
    assert.match(src, /recentAudit\?:\s*AuditEntry\[\]\s*\|\s*undefined/);
    assert.match(src, /recentMeetings\?:\s*MeetingMeta\[\]\s*\|\s*undefined/);
  });

  it('renders both audit + meetings lists with array+length guards', () => {
    const src = read('SpecialistsEnrichmentPanels.tsx');
    assert.match(src, /specialists\.label\.recentAudit/);
    assert.match(src, /specialists\.label\.recentMeetings/);
    assert.match(src, /specialists\.event\.byActor/);
    assert.match(src, /Array\.isArray\(recentAudit\)/);
    assert.match(src, /Array\.isArray\(recentMeetings\)/);
  });

  it('parent SpecialistsView exports MeetingMeta + AuditEntry', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /export\s+interface\s+MeetingMeta/);
    assert.match(parent, /export\s+interface\s+AuditEntry/);
  });

  it('is imported and rendered by SpecialistsView; inline panels removed', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsEnrichmentPanels\s+from\s+'\.\/SpecialistsEnrichmentPanels'/);
    assert.match(parent, /<SpecialistsEnrichmentPanels/);
    assert.doesNotMatch(parent, /specialists\.label\.recentAudit/);
    assert.doesNotMatch(parent, /specialists\.label\.recentMeetings/);
  });
});

describe('extracted: SpecialistsScoreHistory (v1.10.598)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsScoreHistory.tsx');
    assert.match(src, /export default function SpecialistsScoreHistory/);
  });

  it('takes specialist + reset state + 2 callback props', () => {
    const src = read('SpecialistsScoreHistory.tsx');
    assert.match(src, /specialist:\s*Specialist/);
    assert.match(src, /confirmResetId:\s*string\s*\|\s*null/);
    assert.match(src, /resetBusy:\s*boolean/);
    assert.match(src, /onConfirmReset:\s*\(id:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /onScoreReset:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('owns ScoreBar + scoreWidth + renders byDomain/byStage rolled-up', () => {
    const src = read('SpecialistsScoreHistory.tsx');
    assert.match(src, /function ScoreBar/);
    assert.match(src, /function scoreWidth/);
    assert.match(src, /specialists\.label\.byDomain/);
    assert.match(src, /specialists\.label\.byStage/);
    assert.match(src, /specialists\.action\.resetScore/);
    assert.match(src, /specialists\.empty\.scoreHistory/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsScoreHistory\s+from\s+'\.\/SpecialistsScoreHistory'/);
    assert.match(parent, /<SpecialistsScoreHistory/);
    assert.match(parent, /onConfirmReset=\{setConfirmResetId\}/);
    assert.match(parent, /onScoreReset=\{handleScoreReset\}/);
  });

  it('parent SpecialistsView no longer holds ScoreBar/scoreWidth nor inline score block', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /function ScoreBar/);
    assert.doesNotMatch(parent, /function scoreWidth/);
    assert.doesNotMatch(parent, /specialists\.label\.byDomain/);
  });
});

describe('extracted: SpecialistsMetadataPanel (v1.10.597)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsMetadataPanel.tsx');
    assert.match(src, /export default function SpecialistsMetadataPanel/);
  });

  it('takes a single specialist Specialist prop', () => {
    const src = read('SpecialistsMetadataPanel.tsx');
    assert.match(src, /specialist:\s*Specialist/);
  });

  it('renders the 4-column grid + domains/triggers/deliverables', () => {
    const src = read('SpecialistsMetadataPanel.tsx');
    assert.match(src, /specialists\.label\.tier/);
    assert.match(src, /specialists\.label\.brain/);
    assert.match(src, /specialists\.label\.model/);
    assert.match(src, /specialists\.label\.effort/);
    assert.match(src, /specialists\.label\.domains/);
    assert.match(src, /specialists\.label\.triggersStages/);
    assert.match(src, /specialists\.label\.triggersKeywords/);
    assert.match(src, /specialists\.label\.deliverables/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsMetadataPanel\s+from\s+'\.\/SpecialistsMetadataPanel'/);
    assert.match(parent, /<SpecialistsMetadataPanel\s+specialist=\{selected\}/);
  });

  it('parent SpecialistsView no longer holds the inline metadata grid', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /specialists\.label\.triggersStages/);
    assert.doesNotMatch(parent, /selected\.brain\.adapter/);
  });
});

describe('extracted: MeetingsDetailBody (v1.10.596)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /export default function MeetingsDetailBody/);
  });

  it('takes selectedId/detail/lineage/recap/actions/onNavigate props', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /detailError:\s*string\s*\|\s*null/);
    assert.match(src, /detail:\s*MeetingDetail\s*\|\s*null/);
    assert.match(src, /lineage:\s*LineageResponse\s*\|\s*null/);
    assert.match(src, /recap:\s*RecapResponse\s*\|\s*null/);
    assert.match(src, /actions:\s*ActionItemsResponse\s*\|\s*null/);
    assert.match(src, /onNavigate:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('composes the 5 detail-body sub-components', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /<MeetingsDetailHeader/);
    assert.match(src, /<MeetingsLineageStrip/);
    assert.match(src, /<MeetingsRecapPanel/);
    assert.match(src, /<MeetingsActionItemsPanel/);
    assert.match(src, /<MeetingsStagesView/);
  });

  it('handles the empty / error / loading states', () => {
    const src = read('MeetingsDetailBody.tsx');
    assert.match(src, /meetings\.empty\.pick/);
    assert.match(src, /detailError/);
    assert.match(src, /meetings\.loading/);
  });

  it('parent MeetingsView exports MeetingDetail and imports MeetingsDetailBody', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /export\s+interface\s+MeetingDetail/);
    assert.match(parent, /import\s+MeetingsDetailBody\s+from\s+'\.\/MeetingsDetailBody'/);
    assert.match(parent, /<MeetingsDetailBody/);
  });

  it('parent MeetingsView no longer imports the 5 sub-components directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsDetailHeader\s+from/);
    assert.doesNotMatch(parent, /import MeetingsLineageStrip,\s*\{\s*type/);
    assert.doesNotMatch(parent, /import MeetingsRecapPanel,\s*\{\s*type/);
    assert.doesNotMatch(parent, /import MeetingsActionItemsPanel,\s*\{\s*type/);
    assert.doesNotMatch(parent, /import MeetingsStagesView,\s*\{\s*type/);
  });
});

describe('extracted: MeetingsDetailPendingActions (v1.10.595)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailPendingActions.tsx');
    assert.match(src, /export default function MeetingsDetailPendingActions/);
  });

  it('takes a single meetingId prop', () => {
    const src = read('MeetingsDetailPendingActions.tsx');
    assert.match(src, /meetingId:\s*string/);
  });

  it('composes RunControls (auto path) + StateActions (manual path) with orManually label', () => {
    const src = read('MeetingsDetailPendingActions.tsx');
    assert.match(src, /<MeetingsRunControls\s+meetingId=\{meetingId\}/);
    assert.match(src, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="pending"/);
    assert.match(src, /meetings\.orManually\.label/);
  });

  it('is imported and rendered by MeetingsDetailCardHeader only on pending (v1.10.614)', () => {
    const parent = read('MeetingsDetailCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsDetailPendingActions\s+from\s+'\.\/MeetingsDetailPendingActions'/);
    assert.match(parent, /<MeetingsDetailPendingActions/);
    assert.match(parent, /detail\.status === 'pending'/);
  });

  it('parent MeetingsView no longer imports RunControls/StateActions directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsRunControls\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsStateActions\s+from/);
    assert.doesNotMatch(parent, /meetings\.orManually\.label/);
  });
});

describe('extracted: MeetingsDetailInProgressActions (v1.10.594)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailInProgressActions.tsx');
    assert.match(src, /export default function MeetingsDetailInProgressActions/);
  });

  it('takes meetingId/contribOpen + onContribToggle props', () => {
    const src = read('MeetingsDetailInProgressActions.tsx');
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /contribOpen:\s*boolean/);
    assert.match(src, /onContribToggle:\s*\(\)\s*=>\s*void/);
  });

  it('composes StateActions (mode=in-progress) + ContributePanel + manual label', () => {
    const src = read('MeetingsDetailInProgressActions.tsx');
    assert.match(src, /<MeetingsStateActions\s+meetingId=\{meetingId\}\s+mode="in-progress"/);
    assert.match(src, /<MeetingsContributePanel/);
    assert.match(src, /meetings\.manual\.label/);
    assert.match(src, /meetings\.contributeButton/);
  });

  it('is imported and rendered by MeetingsDetailCardHeader only on in-progress (v1.10.614)', () => {
    const parent = read('MeetingsDetailCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsDetailInProgressActions\s+from\s+'\.\/MeetingsDetailInProgressActions'/);
    assert.match(parent, /<MeetingsDetailInProgressActions/);
    assert.match(parent, /detail\.status === 'in-progress'/);
  });

  it('parent MeetingsView no longer imports ContributePanel directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsContributePanel\s+from/);
    assert.doesNotMatch(parent, /meetings\.contributeButton/);
  });
});

describe('extracted: MeetingsDetailCompletedActions (v1.10.593)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /export default function MeetingsDetailCompletedActions/);
  });

  it('takes meetingId/meetingTitle + fork open + 3 callback props', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /meetingTitle:\s*string/);
    assert.match(src, /forkOpen:\s*boolean/);
    assert.match(src, /onForkToggle:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForkClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onForked:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('composes the 4 sub-components (Publish/PeerRetro/Retro + ForkForm)', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /<MeetingsPublishControls/);
    assert.match(src, /<MeetingsPeerRetroControls/);
    assert.match(src, /<MeetingsRetroActions/);
    assert.match(src, /<MeetingsForkForm/);
  });

  it('owns the fork-toggle button + uses meetings.fork i18n keys', () => {
    const src = read('MeetingsDetailCompletedActions.tsx');
    assert.match(src, /meetings\.fork\.button/);
    assert.match(src, /meetings\.cancelFork/);
  });

  it('is imported and rendered by MeetingsDetailCardHeader only on completed/escalated (v1.10.614)', () => {
    const parent = read('MeetingsDetailCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsDetailCompletedActions\s+from\s+'\.\/MeetingsDetailCompletedActions'/);
    assert.match(parent, /<MeetingsDetailCompletedActions/);
    assert.match(parent, /\['completed', 'escalated'\]\.includes\(detail\.status\)/);
  });

  it('parent MeetingsView no longer imports the 4 sub-components directly', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /import\s+MeetingsPublishControls\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsPeerRetroControls\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsRetroActions\s+from/);
    assert.doesNotMatch(parent, /import\s+MeetingsForkForm\s+from/);
  });
});

describe('extracted: SpecialistsDetailHeader (v1.10.592)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsDetailHeader.tsx');
    assert.match(src, /export default function SpecialistsDetailHeader/);
  });

  it('takes selected/confirmRemoveId/removeBusy + 2 callback props', () => {
    const src = read('SpecialistsDetailHeader.tsx');
    assert.match(src, /selected:\s*Specialist\s*\|\s*null/);
    assert.match(src, /confirmRemoveId:\s*string\s*\|\s*null/);
    assert.match(src, /removeBusy:\s*boolean/);
    assert.match(src, /onConfirmRemove:\s*\(id:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /onRemove:\s*\(id:\s*string\)\s*=>\s*void/);
  });

  it('renders title placeholder/selected + Remove button + confirm block', () => {
    const src = read('SpecialistsDetailHeader.tsx');
    assert.match(src, /specialists\.title\.selected/);
    assert.match(src, /specialists\.title\.select/);
    assert.match(src, /specialists\.action\.removeAria/);
    assert.match(src, /specialists\.confirmRemove\.prefix/);
    assert.match(src, /specialists\.action\.confirmRemove/);
  });

  it('is imported and rendered by SpecialistsView', () => {
    const parent = read('SpecialistsView.tsx');
    assert.match(parent, /import\s+SpecialistsDetailHeader\s+from\s+'\.\/SpecialistsDetailHeader'/);
    assert.match(parent, /<SpecialistsDetailHeader/);
    assert.match(parent, /onConfirmRemove=\{setConfirmRemoveId\}/);
    assert.match(parent, /onRemove=\{handleRemove\}/);
  });

  it('parent SpecialistsView no longer holds the inline detail header', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /specialists\.confirmRemove\.prefix/);
    assert.doesNotMatch(parent, /specialists\.title\.selected/);
  });
});

describe('extracted: ControlPanelBatch (v1.10.591)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ControlPanelBatch.tsx');
    assert.match(src, /export default function ControlPanelBatch/);
  });

  it('takes worker list / selection / batch state / 4 callback props', () => {
    const src = read('ControlPanelBatch.tsx');
    assert.match(src, /selectableWorkers:\s*Worker\[\]/);
    assert.match(src, /selected:\s*Set<string>/);
    assert.match(src, /selectedCount:\s*number/);
    assert.match(src, /batchBusy:\s*BatchKind\s*\|\s*null/);
    assert.match(src, /disableBatch:\s*boolean/);
    assert.match(src, /batchResults:\s*BatchOutcome\[\]\s*\|\s*null/);
    assert.match(src, /onSelectAll:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onClearSelection:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onToggleSelected:\s*\(name:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRunBatch:\s*\(kind:\s*BatchKind\)\s*=>\s*void/);
  });

  it('renders header / worker list / cancel+close buttons / outcome panel', () => {
    const src = read('ControlPanelBatch.tsx');
    assert.match(src, /controlPanel\.batch\.title/);
    assert.match(src, /controlPanel\.batch\.selectAll/);
    assert.match(src, /controlPanel\.batch\.cancelSelected/);
    assert.match(src, /controlPanel\.batch\.closeSelected/);
    assert.match(src, /controlPanel\.lastBatch\.title/);
  });

  it('parent ControlPanel exports BatchKind/BatchOutcome', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /export\s+type\s+BatchKind/);
    assert.match(parent, /export\s+interface\s+BatchOutcome/);
  });

  it('is imported and rendered by ControlPanel; inline batch card removed', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /import\s+ControlPanelBatch\s+from\s+'\.\/ControlPanelBatch'/);
    assert.match(parent, /<ControlPanelBatch/);
    assert.match(parent, /onRunBatch=\{runBatch\}/);
    assert.doesNotMatch(parent, /controlPanel\.batch\.selectAll/);
    assert.doesNotMatch(parent, /controlPanel\.lastBatch\.title/);
  });
});

describe('extracted: ControlPanelActions (v1.10.590)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ControlPanelActions.tsx');
    assert.match(src, /export default function ControlPanelActions/);
  });

  it('takes worker name + actions list + busy state + click props', () => {
    const src = read('ControlPanelActions.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /actions:\s*SingleAction\[\]/);
    assert.match(src, /busyKind:\s*ActionKind\s*\|\s*null/);
    assert.match(src, /onRunSingle:\s*\(action:\s*SingleAction\)\s*=>\s*void/);
  });

  it('renders the action grid using TONE_VARIANT + busy label format', () => {
    const src = read('ControlPanelActions.tsx');
    assert.match(src, /TONE_VARIANT\[action\.tone\]/);
    assert.match(src, /controlPanel\.action\.busy/);
    assert.match(src, /controlPanel\.worker\.title/);
  });

  it('parent ControlPanel exports SingleAction/ActionKind/ActionTone/TONE_VARIANT', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /export\s+type\s+ActionKind/);
    assert.match(parent, /export\s+type\s+ActionTone/);
    assert.match(parent, /export\s+interface\s+SingleAction/);
    assert.match(parent, /export\s+const\s+TONE_VARIANT/);
  });

  it('is imported and rendered by ControlPanel; inline grid removed', () => {
    const parent = read('ControlPanel.tsx');
    assert.match(parent, /import\s+ControlPanelActions\s+from\s+'\.\/ControlPanelActions'/);
    assert.match(parent, /<ControlPanelActions/);
    assert.match(parent, /onRunSingle=\{runSingle\}/);
    assert.doesNotMatch(parent, /controlPanel\.worker\.title/);
  });
});

describe('extracted: XtermStatusBar (v1.10.589)', () => {
  it('lives in its own file with default export', () => {
    const src = read('XtermStatusBar.tsx');
    assert.match(src, /export default function XtermStatusBar/);
  });

  it('takes the 7 controlled-input props', () => {
    const src = read('XtermStatusBar.tsx');
    assert.match(src, /statusLabel:\s*string/);
    assert.match(src, /searchOpen:\s*boolean/);
    assert.match(src, /onToggleSearch:\s*\(\)\s*=>\s*void/);
    assert.match(src, /searchQuery:\s*string/);
    assert.match(src, /onSearchQuery:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRunSearch:\s*\(direction:\s*SearchDirection\)\s*=>\s*void/);
    assert.match(src, /onCloseSearch:\s*\(\)\s*=>\s*void/);
  });

  it('renders status bar + search button + Enter→runSearch + Escape→close', () => {
    const src = read('XtermStatusBar.tsx');
    assert.match(src, /xterm\.search\.label/);
    assert.match(src, /xterm\.search\.button/);
    assert.match(src, /xterm\.find\.placeholder/);
    assert.match(src, /e\.shiftKey \? 'prev' : 'next'/);
    assert.match(src, /e\.key === 'Escape'/);
  });

  it('is imported and rendered by XtermView', () => {
    const parent = read('XtermView.tsx');
    assert.match(parent, /import\s+XtermStatusBar\s+from\s+'\.\/XtermStatusBar'/);
    assert.match(parent, /<XtermStatusBar/);
    assert.match(parent, /onSearchQuery=\{setSearchQuery\}/);
    assert.match(parent, /onRunSearch=\{runSearch\}/);
  });

  it('parent XtermView no longer holds the inline status bar markup', () => {
    const parent = read('XtermView.tsx');
    assert.doesNotMatch(parent, /xterm\.search\.label/);
    assert.doesNotMatch(parent, /xterm\.find\.placeholder/);
  });
});

describe('extracted: WorkerDetailHeader (v1.10.588)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkerDetailHeader.tsx');
    assert.match(src, /export default function WorkerDetailHeader/);
  });

  it('takes worker name + tab + font controls props', () => {
    const src = read('WorkerDetailHeader.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /tab:\s*TerminalTab/);
    assert.match(src, /onTabChange:\s*\(next:\s*TerminalTab\)\s*=>\s*void/);
    assert.match(src, /fontSize:\s*number/);
    assert.match(src, /onBumpFont:\s*\(delta:\s*number\)\s*=>\s*void/);
  });

  it('renders the title + tab switcher + font adjustor', () => {
    const src = read('WorkerDetailHeader.tsx');
    assert.match(src, /workerDetail\.terminalSession/);
    assert.match(src, /workerDetail\.tab\.screen/);
    assert.match(src, /workerDetail\.tab\.scrollback/);
    assert.match(src, /workerDetail\.font\.decrease/);
    assert.match(src, /workerDetail\.font\.increase/);
  });

  it('is imported and rendered by WorkerDetail', () => {
    const parent = read('WorkerDetail.tsx');
    assert.match(parent, /import\s+WorkerDetailHeader\s+from\s+'\.\/WorkerDetailHeader'/);
    assert.match(parent, /<WorkerDetailHeader/);
    assert.match(parent, /onTabChange=\{setTab\}/);
    assert.match(parent, /onBumpFont=\{bumpFont\}/);
  });

  it('parent WorkerDetail no longer holds the inline CardHeader block', () => {
    const parent = read('WorkerDetail.tsx');
    assert.doesNotMatch(parent, /<CardHeader/);
    assert.doesNotMatch(parent, /workerDetail\.font\.decrease/);
  });
});

describe('extracted: WorkflowList (v1.10.587)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WorkflowList.tsx');
    assert.match(src, /export default function WorkflowList/);
  });

  it('takes workflows + error/busy + selection + 2 callback props', () => {
    const src = read('WorkflowList.tsx');
    assert.match(src, /workflows:\s*Workflow\[\]/);
    assert.match(src, /error:\s*string\s*\|\s*null/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(id:\s*string\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders header / error / empty / list states with selected highlight', () => {
    const src = read('WorkflowList.tsx');
    assert.match(src, /workflows\.title/);
    assert.match(src, /workflows\.empty\.cli/);
    assert.match(src, /workflows\.status\.on/);
    assert.match(src, /workflows\.status\.off/);
    assert.match(src, /workflows\.nodesEdges\.format/);
  });

  it('is imported and rendered by WorkflowEditor', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.match(parent, /import\s+WorkflowList\s+from\s+'\.\/WorkflowList'/);
    assert.match(parent, /<WorkflowList/);
    assert.match(parent, /onRefresh=\{refresh\}/);
  });

  it('parent WorkflowEditor no longer holds the inline aside markup', () => {
    const parent = read('WorkflowEditor.tsx');
    assert.doesNotMatch(parent, /workflows\.empty\.cli/);
    assert.doesNotMatch(parent, /workflows\.nodesEdges\.format/);
  });
});

describe('extracted: MeetingsDetailTitleBar (v1.10.586)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsDetailTitleBar.tsx');
    assert.match(src, /export default function MeetingsDetailTitleBar/);
  });

  it('takes title/showStreamingBadge/streaming props', () => {
    const src = read('MeetingsDetailTitleBar.tsx');
    assert.match(src, /title:\s*string/);
    assert.match(src, /showStreamingBadge:\s*boolean/);
    assert.match(src, /streaming:\s*boolean/);
  });

  it('renders the title + the live/offline badge tone+text', () => {
    const src = read('MeetingsDetailTitleBar.tsx');
    assert.match(src, /<CardTitle/);
    assert.match(src, /meetings\.stream\.live/);
    assert.match(src, /meetings\.stream\.offline/);
    assert.match(src, /meetings\.stream\.tooltipLive/);
  });

  it('is imported and rendered by MeetingsDetailCardHeader (v1.10.614)', () => {
    const parent = read('MeetingsDetailCardHeader.tsx');
    assert.match(parent, /import\s+MeetingsDetailTitleBar\s+from\s+'\.\/MeetingsDetailTitleBar'/);
    assert.match(parent, /<MeetingsDetailTitleBar/);
    assert.match(parent, /showStreamingBadge=\{Boolean\(selectedId\)\}/);
  });

  it('parent MeetingsView no longer holds the inline title row', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /meetings\.stream\.tooltipLive/);
    assert.doesNotMatch(parent, /<Radio /);
  });
});

describe('extracted: RiskSandboxPreview (v1.10.585)', () => {
  it('lives in its own file with default export', () => {
    const src = read('RiskSandboxPreview.tsx');
    assert.match(src, /export default function RiskSandboxPreview/);
  });

  it('takes a sandbox SandboxPreview prop', () => {
    const src = read('RiskSandboxPreview.tsx');
    assert.match(src, /sandbox:\s*SandboxPreview/);
    assert.match(src, /import\s+type\s+\{\s*SandboxPreview\s*\}\s+from\s+'\.\.\/pages\/Risk'/);
  });

  it('renders the runtime+isolation badges, capability grid, argv pre, env details', () => {
    const src = read('RiskSandboxPreview.tsx');
    assert.match(src, /risk\.sandbox\.runtime/);
    assert.match(src, /risk\.sandbox\.isolation/);
    assert.match(src, /risk\.sandbox\.network/);
    assert.match(src, /risk\.sandbox\.filesystem/);
    assert.match(src, /risk\.sandbox\.resources/);
    assert.match(src, /risk\.label\.argv/);
    assert.match(src, /Object\.keys\(sandbox\.env/);
  });

  it('SandboxPreview interface lifted to module scope and exported from pages/Risk.tsx', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /export\s+interface\s+SandboxPreview/);
    // No inline definition inside the function body any more.
    assert.doesNotMatch(src, /\s\s+interface SandboxPreview/);
  });

  it('parent Risk page imports + renders + drops the inline sandbox markup', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'Risk.tsx'), 'utf8');
    assert.match(src, /import\s+RiskSandboxPreview\s+from\s+'\.\.\/components\/RiskSandboxPreview'/);
    assert.match(src, /<RiskSandboxPreview\s+sandbox=\{sandbox\}/);
    assert.doesNotMatch(src, /risk\.sandbox\.network/);
  });
});

describe('extracted: SessionsHeader (v1.10.584)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SessionsHeader.tsx');
    assert.match(src, /export default function SessionsHeader/);
  });

  it('takes query/totals/loading + 3 callback props', () => {
    const src = read('SessionsHeader.tsx');
    assert.match(src, /query:\s*string/);
    assert.match(src, /onQuery:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /totalFiltered:\s*number/);
    assert.match(src, /total:\s*number/);
    assert.match(src, /loading:\s*boolean/);
    assert.match(src, /onNewChat:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onAttachNew:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onRefresh:\s*\(\)\s*=>\s*void/);
  });

  it('renders title + search input + 3 action buttons', () => {
    const src = read('SessionsHeader.tsx');
    assert.match(src, /sessions\.panel\.title/);
    assert.match(src, /sessions\.search\.placeholder/);
    assert.match(src, /sessions\.button\.newChat/);
    assert.match(src, /sessions\.button\.attachNew/);
  });

  it('is imported and rendered by SessionsListCard (v1.10.622); parent owns setQuery wiring', () => {
    const parent = read('SessionsView.tsx');
    const card = read('SessionsListCard.tsx');
    assert.match(card, /import\s+SessionsHeader\s+from\s+'\.\/SessionsHeader'/);
    assert.match(card, /<SessionsHeader/);
    // Parent still wires onQuery through to the composite.
    assert.match(parent, /onQuery=\{setQuery\}/);
  });

  it('parent SessionsView no longer holds the inline CardHeader block', () => {
    const parent = read('SessionsView.tsx');
    assert.doesNotMatch(parent, /sessions\.panel\.title/);
    assert.doesNotMatch(parent, /sessions\.search\.placeholder/);
  });
});

describe('extracted: ChatHeader (v1.10.583)', () => {
  it('lives in its own file with default export', () => {
    const src = read('ChatHeader.tsx');
    assert.match(src, /export default function ChatHeader/);
  });

  it('takes worker name + backfill + sse + autoScroll + onJumpToBottom props', () => {
    const src = read('ChatHeader.tsx');
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /backfillCount:\s*number/);
    assert.match(src, /backfillSource:\s*BackfillSource/);
    assert.match(src, /sseConnected:\s*boolean/);
    assert.match(src, /autoScroll:\s*boolean/);
    assert.match(src, /onJumpToBottom:\s*\(\)\s*=>\s*void/);
  });

  it('renders the title + backfill badge + live badge + jump button', () => {
    const src = read('ChatHeader.tsx');
    assert.match(src, /chat\.workerHeader\.title/);
    assert.match(src, /chat\.loadedPast\.one/);
    assert.match(src, /sseConnected \? 'live' : 'disconnected'/);
    assert.match(src, /chat\.jumpToLatest/);
  });

  it('is imported and rendered by ChatView', () => {
    const parent = read('ChatView.tsx');
    assert.match(parent, /import\s+ChatHeader\s+from\s+'\.\/ChatHeader'/);
    assert.match(parent, /<ChatHeader/);
    assert.match(parent, /onJumpToBottom=\{jumpToBottom\}/);
  });

  it('parent ChatView no longer holds the inline CardHeader block', () => {
    const parent = read('ChatView.tsx');
    assert.doesNotMatch(parent, /<CardHeader/);
    assert.doesNotMatch(parent, /chat\.workerHeader\.title/);
  });
});

describe('extracted: MeetingsSearchInput (v1.10.582)', () => {
  it('lives in its own file with default export', () => {
    const src = read('MeetingsSearchInput.tsx');
    assert.match(src, /export default function MeetingsSearchInput/);
  });

  it('takes value/onChange/searching props', () => {
    const src = read('MeetingsSearchInput.tsx');
    assert.match(src, /value:\s*string/);
    assert.match(src, /onChange:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /searching:\s*boolean/);
  });

  it('renders the search input + clear button + searching indicator', () => {
    const src = read('MeetingsSearchInput.tsx');
    assert.match(src, /meetings\.search\.placeholder/);
    assert.match(src, /meetings\.action\.clearSearch/);
    assert.match(src, /meetings\.searching/);
  });

  it('is imported and rendered by MeetingsSearchSection (v1.10.613)', () => {
    const parent = read('MeetingsSearchSection.tsx');
    assert.match(parent, /import\s+MeetingsSearchInput\s+from\s+'\.\/MeetingsSearchInput'/);
    assert.match(parent, /<MeetingsSearchInput/);
    assert.match(parent, /value=\{query\}/);
    assert.match(parent, /onChange=\{onChangeQuery\}/);
  });

  it('parent MeetingsView no longer holds the inline search input', () => {
    const parent = read('MeetingsView.tsx');
    assert.doesNotMatch(parent, /placeholder=\{t\('meetings\.search\.placeholder'\)\}/);
  });
});

describe('extracted: SpecialistsSearchFilters (v1.10.581)', () => {
  it('lives in its own file with default export', () => {
    const src = read('SpecialistsSearchFilters.tsx');
    assert.match(src, /export default function SpecialistsSearchFilters/);
  });

  it('takes the 4 controlled prop pairs + count fields', () => {
    const src = read('SpecialistsSearchFilters.tsx');
    assert.match(src, /filter:\s*string/);
    assert.match(src, /onFilter:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /tierFilter:\s*string/);
    assert.match(src, /onTierFilter:\s*\(next:\s*string\)\s*=>\s*void/);
    assert.match(src, /vetoOnly:\s*boolean/);
    assert.match(src, /onVetoOnly:\s*\(next:\s*boolean\)\s*=>\s*void/);
    assert.match(src, /filteredCount:\s*number/);
    assert.match(src, /totalCount:\s*number/);
  });

  it('renders the search input + tier select + vetoOnly checkbox + count', () => {
    const src = read('SpecialistsSearchFilters.tsx');
    assert.match(src, /specialists\.search\.placeholder/);
    assert.match(src, /Object\.keys\(TIER_BADGE\)/);
    assert.match(src, /specialists\.label\.vetoOnly/);
    assert.match(src, /\{filteredCount\}\/\{totalCount\}/);
  });

  it('is imported and rendered by SpecialistsListCardHeader (v1.10.618); parent owns state setters', () => {
    const parent = read('SpecialistsView.tsx');
    const card = read('SpecialistsListCardHeader.tsx');
    assert.match(card, /import\s+SpecialistsSearchFilters\s+from\s+'\.\/SpecialistsSearchFilters'/);
    assert.match(card, /<SpecialistsSearchFilters/);
    // Parent still wires the setter callbacks through to the composite.
    assert.match(parent, /onFilter=\{setFilter\}/);
    assert.match(parent, /onTierFilter=\{setTierFilter\}/);
    assert.match(parent, /onVetoOnly=\{setVetoOnly\}/);
  });

  it('parent SpecialistsView no longer holds the inline filter row', () => {
    const parent = read('SpecialistsView.tsx');
    assert.doesNotMatch(parent, /placeholder=\{t\('specialists\.search\.placeholder'\)\}/);
    assert.doesNotMatch(parent, /Object\.keys\(TIER_BADGE\)\.map/);
  });
});

describe('extracted: WikiSearchResults (v1.10.580)', () => {
  it('lives in its own file with default export', () => {
    const src = read('WikiSearchResults.tsx');
    assert.match(src, /export default function WikiSearchResults/);
  });

  it('takes search/searchError/selectedPath/onSelect props', () => {
    const src = read('WikiSearchResults.tsx');
    assert.match(src, /search:\s*SearchResponse\s*\|\s*null/);
    assert.match(src, /searchError:\s*string\s*\|\s*null/);
    assert.match(src, /selectedPath:\s*string\s*\|\s*null/);
    assert.match(src, /onSelect:\s*\(path:\s*string\)\s*=>\s*void/);
  });

  it('renders the four states (error / loading / empty / hit list)', () => {
    const src = read('WikiSearchResults.tsx');
    assert.match(src, /searchError/);
    assert.match(src, /wiki\.loading/);
    assert.match(src, /wiki\.empty\.format/);
    assert.match(src, /search\.hits\.map/);
  });

  it('is imported and rendered by WikiView', () => {
    const parent = read('WikiView.tsx');
    assert.match(parent, /import\s+WikiSearchResults\s+from\s+'\.\/WikiSearchResults'/);
    assert.match(parent, /<WikiSearchResults/);
    assert.match(parent, /onSelect=\{setSelectedPath\}/);
  });

  it('parent WikiView no longer holds the inline results map', () => {
    const parent = read('WikiView.tsx');
    assert.doesNotMatch(parent, /search\.hits\.map\(/);
  });
});
