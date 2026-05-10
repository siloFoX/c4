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
    // (v1.10.757) Open toggle adopts useToggle. Per-action state still
    // lives in the per-action sibling hooks (use-meeting-integrity etc).
    const src = read('MeetingsMaintenancePanel.tsx');
    assert.match(src, /useToggle/);
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
    // (v1.10.682) Audit fetch + window state moved to lib/use-specialists-audit.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-audit.ts'),
      'utf8',
    );
    assert.match(hookSrc, /if \(!auditOpen\) return/);
    assert.match(hookSrc, /window\.setInterval\(fetchAudit, 30000\)/);
  });

  it('owns the chain-verify handler', () => {
    // (v1.10.683) Verify handler moved to lib/use-audit-verify.
    const src = read('SpecialistsAuditPanel.tsx');
    assert.match(src, /handleVerify/);
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-audit-verify.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\/api\/audit\/verify/);
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
    // (v1.10.727) patterns slot moved to use-lazy-risk-patterns hook;
    // open + filter slots stay in the parent (JSX-bound).
    // (v1.10.757) open toggle adopts useToggle.
    const src = read('RiskRuleCatalogPanel.tsx');
    assert.match(src, /useState\(''\)/);   // filter
    assert.match(src, /useToggle/); // open
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-lazy-risk-patterns.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useState<PatternsResponse \| null>/);
  });

  it('lazy-fetches /api/risk/patterns only when opened', () => {
    // (v1.10.727) Lazy fetch moved to use-lazy-risk-patterns hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-lazy-risk-patterns.ts'),
      'utf8',
    );
    assert.match(hookSrc, /if \(!open \|\| patterns\) return/);
    assert.match(hookSrc, /\/api\/risk\/patterns/);
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
    // (v1.10.733) State machine moved to use-status-message hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-status-message.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useState\(''\)/);
    assert.match(hookSrc, /useState\(false\)/);
  });

  it('POSTs to /api/status-update with {worker, message}', () => {
    // (v1.10.733) POST handler moved to use-status-message hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-status-message.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\/api\/status-update/);
    assert.match(hookSrc, /worker:\s*workerName/);
    assert.match(hookSrc, /message:\s*text/);
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
    // (v1.10.706) State moved to lib/use-specialist-tag-editor.
    const src = read('SpecialistsTagEditor.tsx');
    assert.match(src, /useSpecialistTagEditor/);
  });

  it('infers add (+...) / remove (-...) / replace from leading char', () => {
    // (v1.10.706) Mode-prefix decode moved to hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialist-tag-editor.ts'),
      'utf8',
    );
    assert.match(hookSrc, /raw\.startsWith\('\+'\)/);
    assert.match(hookSrc, /raw\.startsWith\('-'\)/);
    assert.match(hookSrc, /'replace' \| 'add' \| 'remove'/);
  });

  it('guards against accidental clear (empty replace)', () => {
    // (v1.10.706) Empty-replace guard moved to hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialist-tag-editor.ts'),
      'utf8',
    );
    assert.match(hookSrc, /next\.length === 0 && mode === 'replace'/);
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
    // (v1.10.699) Slots moved to lib/use-prompt-revision.
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /usePromptRevision/);
    assert.match(src, /suggestBusy/);
    assert.match(src, /suggestion/);
    assert.match(src, /applyBusy/);
    assert.match(src, /applyResult/);
  });

  it('owns the suggest-prompt and prompt-apply POST handlers', () => {
    // (v1.10.699) Handlers moved to hook.
    const src = read('SpecialistsPromptPanel.tsx');
    assert.match(src, /handleSuggest/);
    assert.match(src, /handleApply/);
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-prompt-revision.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\/suggest-prompt/);
    assert.match(hookSrc, /\/prompt-apply/);
  });

  it('confirms apply (destructive — replaces systemPrompt)', () => {
    // (v1.10.699) Confirm gate moved to hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-prompt-revision.ts'),
      'utf8',
    );
    assert.match(hookSrc, /window\.confirm\(t\('specialists\.applyConfirm'\)\)/);
  });

  it('resets state on specialistId change', () => {
    // (v1.10.699) Reset effect moved to hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-prompt-revision.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\[specialistId\]/);
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
    // (v1.10.716) State machine moved to use-meeting-run hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-run.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useState<'mock' \| 'claude'>/);
  });

  it('owns the /run POST with autoFinalize: true', () => {
    // (v1.10.716) /run POST moved to use-meeting-run hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-run.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\/run/);
    assert.match(hookSrc, /autoFinalize:\s*true/);
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
    // (v1.10.704) Busy state moved to lib/use-meeting-state-action.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-state-action.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useState<MeetingAction\s*\|\s*null>/);
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
    // (v1.10.718) State machine moved to use-meeting-peer-retro hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-peer-retro.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useState<'mock' \| 'claude'>/);
  });

  it('owns the peer-retro POST handler', () => {
    // (v1.10.718) POST handler moved to use-meeting-peer-retro hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-peer-retro.ts'),
      'utf8',
    );
    assert.match(hookSrc, /handlePeerRetro/);
    assert.match(hookSrc, /\/peer-retro/);
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
    // (v1.10.703) State moved to lib/use-meeting-publish.
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /useMeetingPublish/);
  });

  it('owns the publish POST handler with includeRetro + apply + git toggles', () => {
    // (v1.10.703) Handler moved to hook.
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /handlePublish/);
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-publish.ts'),
      'utf8',
    );
    assert.match(hookSrc, /includeRetro:\s*true/);
    assert.match(hookSrc, /apply:\s*true/);
    assert.match(hookSrc, /\/api\/meetings\//);
  });

  it('gitPush check forces gitCommit on (and gitCommit off forces gitPush off)', () => {
    // (v1.10.763) Coupling moved into use-meeting-publish so the
    // hook owns both the state and the invariants.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-publish.ts'),
      'utf8',
    );
    assert.match(hookSrc, /toggleGitCommit = useCallback\(\(next: boolean\) => \{[\s\S]*?if \(!next\) setGitPush\(false\)/);
    assert.match(hookSrc, /toggleGitPush = useCallback\(\(next: boolean\) => \{[\s\S]*?if \(next\) setGitCommit\(true\)/);
    const src = read('MeetingsPublishControls.tsx');
    assert.match(src, /toggleGitCommit\(e\.target\.checked\)/);
    assert.match(src, /toggleGitPush\(e\.target\.checked\)/);
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
    // (v1.10.717) State machine moved to use-meeting-retro hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-retro.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useState<'preview' \| 'finalize' \| null>/);
    assert.match(hookSrc, /useState<RetroResult \| null>/);
  });

  it('owns the retro / finalize POST handler (toggles by finalize: boolean)', () => {
    // (v1.10.717) POST handler moved to use-meeting-retro hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-retro.ts'),
      'utf8',
    );
    assert.match(hookSrc, /handleRetro = useCallback/);
    assert.match(hookSrc, /finalize \? 'finalize' : 'retro'/);
  });

  it('resets on meetingId change', () => {
    // (v1.10.717) Reset effect moved to use-meeting-retro hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-retro.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\[meetingId\]/);
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
    // (v1.10.701) Form state moved to lib/use-meeting-contribute.
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /useMeetingContribute/);
    assert.match(src, /specialist/);
    assert.match(src, /text/);
    assert.match(src, /vote/);
    assert.match(src, /reason/);
  });

  it('owns both /contribute (with body) and /vote (vote-only) handlers', () => {
    // (v1.10.701) Handlers moved to hook.
    const src = read('MeetingsContributePanel.tsx');
    assert.match(src, /handleContribute/);
    assert.match(src, /handleVoteOnly/);
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-contribute.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\/contribute/);
    assert.match(hookSrc, /\/vote/);
  });

  it('resets form on meetingId change so state does not leak across meetings', () => {
    // (v1.10.701) Reset effect moved to hook.
    // (v1.10.765) Banner-state reset delegated to useAutoClearMessage's
    // `reset` callback so the dep list grew to `[meetingId, reset]`.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-contribute.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\[meetingId,\s*reset\]/);
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
    // (v1.10.721) copyToClipboard helper moved to use-copy-pulse hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-copy-pulse.ts'),
      'utf8',
    );
    assert.match(hookSrc, /navigator\.clipboard\.writeText\(text\)/);
    // attachedRoleStyle stays inline (display helper, no copy concerns).
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /function attachedRoleStyle\(role: AttachedRole/);
  });

  it('owns the AttachProcessState type internally', () => {
    // (v1.10.674) Type moved to lib/use-attach-process-state.
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /useAttachProcessState/);
  });

  it('owns its 4 internal state pieces (showResume / showDetachConfirm / copied / procState)', () => {
    // (v1.10.674) procState slot moved to hook.
    // (v1.10.758) showResume / showDetachConfirm adopt useToggle.
    const src = read('SessionsAttachedRowActions.tsx');
    assert.match(src, /useToggle\(\)/);
    assert.match(src, /useAttachProcessState/);
  });

  it('polls /api/attach/<name>/process every 30s while mounted', () => {
    // (v1.10.674) Poll moved to lib/use-attach-process-state.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-attach-process-state.ts'),
      'utf8',
    );
    assert.match(hookSrc, /window\.setInterval\(poll, 30000\)/);
    assert.match(hookSrc, /\/api\/attach\/\$\{encodeURIComponent\(name\)\}\/process/);
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
    // (v1.10.698) Handlers moved to lib/use-specialists-add-propose.
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /handleAdd/);
    assert.match(src, /handlePropose/);
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-add-propose.ts'),
      'utf8',
    );
    assert.match(hookSrc, /\/api\/specialists\/propose/);
  });

  it('owns its form / busy / message state internally', () => {
    // (v1.10.698) State slots moved into the hook; parent surfaces
    // them via destructure.
    const src = read('SpecialistsAddPanel.tsx');
    assert.match(src, /useSpecialistsAddPropose/);
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
    // (v1.10.725) Polling moved to use-specialists-summary hook.
    // (v1.10.743) Polling shape lifted to lib/use-silent-poll; the
    // summary hook now wires URL + interval into useSilentPoll.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-summary.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useSilentPoll<OrganismSummary>\([\s\S]*?POLL_INTERVAL_MS/);
    assert.match(hookSrc, /POLL_INTERVAL_MS\s*=\s*30000/);
  });

  it('hits /api/specialists/summary directly (zero-prop self-fetch)', () => {
    // (v1.10.725) Fetch moved to use-specialists-summary hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-summary.ts'),
      'utf8',
    );
    assert.match(hookSrc, /'\/api\/specialists\/summary'/);
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
    // (v1.10.702) Form state moved to lib/use-meeting-fork.
    const src = read('MeetingsForkForm.tsx');
    assert.match(src, /useMeetingFork/);
  });

  it('resets on meeting change so form state does not leak across meetings', () => {
    // (v1.10.702) Reset effect moved to hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-fork.ts'),
      'utf8',
    );
    assert.match(hookSrc, /useEffect/);
    assert.match(hookSrc, /\[meetingId\]/);
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
    // (v1.10.742) Export handlers moved to use-action-items-export hook.
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-action-items-export.ts'),
      'utf8',
    );
    assert.match(hookSrc, /handleDownloadJson/);
    assert.match(hookSrc, /handleCopyMd/);
    assert.match(hookSrc, /navigator\.clipboard\.writeText/);
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
    // (v1.10.757) Open toggle adopts useToggle (default false).
    const src = read('MeetingsRecapPanel.tsx');
    assert.match(src, /useToggle\(\)/);
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

describe('extracted: useAppendLive hook (v1.10.739)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-append-live.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ChatView.tsx');

  it('exports the hook + accepts seenTextsRef/rememberMessage/setLiveMessages', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAppendLive/);
    assert.match(src, /seenTextsRef:\s*React\.MutableRefObject<Set<string>>/);
    assert.match(src, /rememberMessage:\s*\(m:\s*ChatMessage\)\s*=>\s*void/);
    assert.match(src, /setLiveMessages:\s*React\.Dispatch<React\.SetStateAction<ChatMessage\[\]>>/);
  });

  it('trims input + dedupes via seenTextsRef.has(trimmed)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /const trimmed = text\.replace\(\/\^\\s\+\|\\s\+\$\/g, ''\)/);
    assert.match(src, /if \(seenTextsRef\.current\.has\(trimmed\)\) return/);
  });

  it('mints id via makeId + caps liveMessages at MAX_MESSAGES (300)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /MAX_MESSAGES\s*=\s*300/);
    assert.match(src, /makeId\(role === 'user' \? 'live-u' : 'live-w'\)/);
    assert.match(src, /next\.length > MAX_MESSAGES \? next\.slice\(-MAX_MESSAGES\)/);
  });

  it('parent ChatView wires the hook + drops the inline appendLive', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAppendLive\s*\}\s+from\s+'\.\.\/lib\/use-append-live'/);
    assert.match(src, /useAppendLive\(\{[\s\S]*?seenTextsRef,\s*rememberMessage,\s*setLiveMessages[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /makeId\(role === 'user'/);
    assert.doesNotMatch(src, /seenTextsRef\.current\.has\(trimmed\)/);
  });
});

describe('extracted: useChatBackfill hook (v1.10.738)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-chat-backfill.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ChatView.tsx');

  it('exports the hook + accepts workerName/liveMessages/onResetExtras', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useChatBackfill/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /liveMessages:\s*ChatMessage\[\]/);
    assert.match(src, /onResetExtras\?:\s*\(\)\s*=>\s*void/);
  });

  it('owns history + 6 backfill state slots + 4 mutable refs', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<ChatMessage\[\]>/);
    assert.match(src, /useState<'session' \| 'scrollback' \| null>/);
    assert.match(src, /scrollbackLinesRef/);
    assert.match(src, /seenIdsRef/);
    assert.match(src, /seenTextsRef/);
    assert.match(src, /backfillReadyRef/);
  });

  it('worker-change reset effect fires onResetExtras + resets all slots', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setHistory\(\[\]\)/);
    assert.match(src, /setBackfillLoading\(true\)/);
    assert.match(src, /setBackfillSource\(null\)/);
    assert.match(src, /setHasOlder\(false\)/);
    assert.match(src, /onResetExtras\?\.\(\)/);
  });

  it('backfill loader: session JSONL then scrollback fallback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/sessions\?workerName=/);
    assert.match(src, /\/api\/scrollback\?name=[\s\S]*?lines=/);
    assert.match(src, /setBackfillSource\('session'\)/);
    assert.match(src, /setBackfillSource\('scrollback'\)/);
  });

  it('loadOlder bails when not in scrollback mode + caps at SCROLLBACK_MAX', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /backfillSource !== 'scrollback'/);
    assert.match(src, /SCROLLBACK_MAX\s*=\s*10000/);
    assert.match(src, /SCROLLBACK_PAGE\s*=\s*2000/);
    assert.match(src, /Math\.min\(scrollbackLinesRef\.current \+ SCROLLBACK_PAGE,\s*SCROLLBACK_MAX\)/);
  });

  it('parent ChatView wires the hook + drops the inline backfill block', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useChatBackfill\s*\}\s+from\s+'\.\.\/lib\/use-chat-backfill'/);
    assert.match(src, /useChatBackfill\(\{[\s\S]*?workerName,\s*liveMessages,\s*onResetExtras[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /async function loadBackfill/);
    assert.doesNotMatch(src, /const loadOlder = useCallback/);
    assert.doesNotMatch(src, /apiGet<SessionByWorkerResponse>/);
  });
});

describe('useWorkerActionStrip adopts postAction helper (v1.10.749)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-action-strip.ts');

  it('imports postAction directly + drops the inline apiFetch wrapper', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /import\s+\{\s*postAction\s*\}\s+from\s+'\.\/post-action'/);
    assert.match(src, /const res = await postAction\(action\.endpoint,\s*action\.body\)/);
    assert.doesNotMatch(src, /import\s+\{\s*apiFetch\s*\}/);
    assert.doesNotMatch(src, /apiFetch\(action\.endpoint/);
  });

  it('preserves window.confirm gate + busy-mark + toast routing semantics', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(action\.disabled\) return/);
    assert.match(src, /if \(!window\.confirm\(action\.confirm\)\) return/);
    assert.match(src, /setBusyKind\(action\.kind\)/);
    assert.match(src, /worker\.action\.failed/);
  });

  it('uses common.unknown fallback when postAction.error is missing', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /res\.error \|\| t\('common\.unknown'\)/);
  });
});

describe('extracted: useAutoClearMessage hook (v1.10.764)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-auto-clear-message.ts');

  it('exports the hook with msg/failed/setSuccess/setFailure/reset', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAutoClearMessage/);
    assert.match(src, /msg:\s*string \| null/);
    assert.match(src, /failed:\s*boolean/);
    assert.match(src, /setSuccess:\s*\(msg:\s*string,\s*durationMs\?:\s*number\)\s*=>\s*void/);
    assert.match(src, /setFailure:\s*\(msg:\s*string\)\s*=>\s*void/);
    assert.match(src, /reset:\s*\(\)\s*=>\s*void/);
  });

  it('owns a setTimeout ref + clears it on success/failure/reset/unmount', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /timerRef = useRef<number \| null>\(null\)/);
    assert.match(src, /window\.setTimeout/);
    assert.match(src, /window\.clearTimeout/);
    // useEffect cleanup so a fired timeout doesn't setState on unmount.
    assert.match(src, /useEffect\(\(\) => \(\) => clearTimer\(\),/);
  });

  it('setSuccess clears failed; setFailure does NOT auto-clear', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    // setSuccess body sets msg + clears failed + arms timer.
    assert.match(src, /setSuccess = useCallback\(\(m:\s*string,\s*durationMs\?:\s*number\) => \{[\s\S]*?setMsg\(m\)[\s\S]*?setFailed\(false\)[\s\S]*?timerRef\.current = window\.setTimeout/);
    // setFailure body sets msg + sets failed + clears timer (no re-arm).
    assert.match(src, /setFailure = useCallback\(\(m:\s*string\) => \{[\s\S]*?setMsg\(m\)[\s\S]*?setFailed\(true\)[\s\S]*?clearTimer\(\)/);
  });

  it('adopted by useSpecialistsExport + useAuditRotate', () => {
    for (const f of ['use-specialists-export.ts', 'use-audit-rotate.ts']) {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'web', 'src', 'lib', f),
        'utf8',
      );
      assert.match(src, /import\s+\{\s*useAutoClearMessage\s*\}\s+from\s+'\.\/use-auto-clear-message'/);
      assert.match(src, /useAutoClearMessage\(\)/);
      assert.match(src, /setSuccess\(/);
      assert.match(src, /setFailure\(/);
    }
  });

  it('also adopted by 4 more action hooks (v1.10.765)', () => {
    // The remaining duplicate-pattern hooks all migrated in v1.10.765.
    for (const f of [
      'use-meeting-publish.ts',
      'use-wiki-bulk-publish.ts',
      'use-meeting-contribute.ts',
      'use-meeting-peer-retro.ts',
    ]) {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'web', 'src', 'lib', f),
        'utf8',
      );
      assert.match(src, /import\s+\{\s*useAutoClearMessage\s*\}\s+from\s+'\.\/use-auto-clear-message'/);
      assert.match(src, /useAutoClearMessage\(\)/);
      assert.match(src, /setSuccess\(/);
      assert.match(src, /setFailure\(/);
    }
  });

  it('failure-only adopters use just setFailure + reset (v1.10.766)', () => {
    // useMeetingTemplateEditor closes the modal on success rather than
    // showing a toast, so it only needs the failure half.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-template-editor.ts'),
      'utf8',
    );
    assert.match(src, /import\s+\{\s*useAutoClearMessage\s*\}\s+from\s+'\.\/use-auto-clear-message'/);
    assert.match(src, /useAutoClearMessage\(\)/);
    assert.match(src, /setFailure\(/);
    // No setSuccess — save closes the dialog and there's no banner.
    assert.doesNotMatch(src, /setSuccess\(/);
  });

  it('also adopted by useAutonomousPauseToggle (v1.10.769)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-autonomous-pause-toggle.ts'),
      'utf8',
    );
    assert.match(src, /import\s+\{\s*useAutoClearMessage\s*\}\s+from\s+'\.\/use-auto-clear-message'/);
    assert.match(src, /useAutoClearMessage\(\)/);
    assert.match(src, /setSuccess\(/);
    assert.match(src, /setFailure\(/);
  });
});

describe('extracted: useToggle hook (v1.10.757)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-toggle.ts');
  const CALLERS = [
    'ConversationTurns.tsx',
    'MeetingsRecapPanel.tsx',
    'MeetingsMaintenancePanel.tsx',
    'SpecialistsAuditPanel.tsx',
    'RiskRuleCatalogPanel.tsx',
  ];

  it('exports the hook + returns a 3-tuple [value, toggle, set]', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    // (v1.10.758) Initial accepts a value or a lazy initializer.
    assert.match(src, /export function useToggle\(initial: boolean \| \(\(\) => boolean\) = false\)/);
    assert.match(src, /value: boolean/);
    assert.match(src, /toggle: \(\) => void/);
    assert.match(src, /set:\s*React\.Dispatch<React\.SetStateAction<boolean>>/);
  });

  it('toggle uses the (v) => !v pattern internally', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /set\(\(v\)\s*=>\s*!v\)/);
  });

  for (const caller of CALLERS) {
    it(`${caller} adopts useToggle`, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'web', 'src', 'components', caller),
        'utf8',
      );
      assert.match(src, /import\s+\{\s*useToggle\s*\}\s+from\s+'\.\.\/lib\/use-toggle'/);
      assert.match(src, /useToggle\(\)/);
    });
  }
});

describe('extracted: useXtermFontSize hook (v1.10.759)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-xterm-font-size.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'XtermView.tsx');

  it('exports the hook + accepts termRef/fontSize/scheduleFit', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useXtermFontSize/);
    assert.match(src, /termRef:\s*MutableRefObject<Terminal \| null>/);
    assert.match(src, /fontSize:\s*number/);
    assert.match(src, /scheduleFit:\s*\(\)\s*=>\s*void/);
  });

  it('writes term.options.fontSize and triggers a fit', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /term\.options\.fontSize\s*=\s*fontSize/);
    assert.match(src, /scheduleFit\(\)/);
  });

  it('parent XtermView wires the hook + drops the inline effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useXtermFontSize\s*\}\s+from\s+'\.\.\/lib\/use-xterm-font-size'/);
    assert.match(src, /useXtermFontSize\(\{[\s\S]*?termRef,\s*fontSize,\s*scheduleFit[\s\S]*?\}\)/);
    // Inline copy of `term.options.fontSize = fontSize` is gone (only the
    // hook's body should match — but PARENT is the component, not the hook).
    assert.doesNotMatch(src, /term\.options\.fontSize\s*=\s*fontSize/);
  });
});

describe('extracted: useXtermSearchHotkey hook (v1.10.756)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-xterm-search-hotkey.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'XtermView.tsx');

  it('exports the hook + accepts containerRef/searchOpen/setSearchOpen', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useXtermSearchHotkey/);
    assert.match(src, /containerRef:\s*MutableRefObject<HTMLElement \| null>/);
    assert.match(src, /searchOpen:\s*boolean/);
    assert.match(src, /setSearchOpen:\s*\(next:\s*boolean\)\s*=>\s*void/);
  });

  it('Ctrl+F opens overlay + Escape closes when open', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\(e\.ctrlKey \|\| e\.metaKey\) && !e\.shiftKey && !e\.altKey && e\.key\.toLowerCase\(\) === 'f'/);
    assert.match(src, /e\.key === 'Escape' && searchOpen/);
    assert.match(src, /setSearchOpen\(true\)/);
    assert.match(src, /setSearchOpen\(false\)/);
  });

  it('listener scoped to container (not window)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /container\.addEventListener\('keydown',\s*onKey\)/);
    assert.match(src, /container\.removeEventListener\('keydown',\s*onKey\)/);
  });

  it('parent XtermView wires the hook + drops the inline effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useXtermSearchHotkey\s*\}\s+from\s+'\.\.\/lib\/use-xterm-search-hotkey'/);
    assert.match(src, /useXtermSearchHotkey\(\{[\s\S]*?containerRef,\s*searchOpen,\s*setSearchOpen[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /e\.key\.toLowerCase\(\) === 'f'/);
  });
});

describe('extracted: useDialogA11y hook (v1.10.755)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-dialog-a11y.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ConfirmDialog.tsx');

  it('exports the hook + accepts open/busy/onCancel/dialogRef', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useDialogA11y/);
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /busy:\s*boolean/);
    assert.match(src, /onCancel:\s*\(\)\s*=>\s*void/);
    assert.match(src, /dialogRef:\s*RefObject<HTMLElement \| null>/);
  });

  it('Escape closes (busy-gated) + uses stopPropagation', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /e\.key === 'Escape' && !busy/);
    assert.match(src, /e\.stopPropagation\(\)/);
    assert.match(src, /onCancel\(\)/);
  });

  it('focuses dialog on open + restores prevActive on cleanup', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /document\.activeElement as HTMLElement \| null/);
    assert.match(src, /dialogRef\.current\?\.focus\(\)/);
    assert.match(src, /prevActive\?\.focus\?\.\(\)/);
  });

  it('parent ConfirmDialog wires the hook + drops the inline effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useDialogA11y\s*\}\s+from\s+'\.\.\/lib\/use-dialog-a11y'/);
    assert.match(src, /useDialogA11y\(\{[\s\S]*?open,\s*busy,\s*onCancel,\s*dialogRef[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /useEffect/);
  });
});

describe('extracted: useMorning hook (v1.10.748)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-morning.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Morning.tsx');

  it('exports the hook + accepts showToast + MorningResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMorning/);
    assert.match(src, /showToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
    assert.match(src, /export interface MorningResponse/);
  });

  it('generate POSTs /api/morning + handles 200+r.error vs throw paths', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<MorningResponse>\('\/api\/morning',\s*\{\}\)/);
    assert.match(src, /if \(r\.error\)/);
    assert.match(src, /setReport\(null\)/);
  });

  it('copy writes content to clipboard + routes both branches through showToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!report\?\.content\) return/);
    assert.match(src, /navigator\.clipboard\.writeText\(report\.content\)/);
    assert.match(src, /morning\.toast\.copied/);
    assert.match(src, /morning\.toast\.copyFailed/);
  });

  it('parent Morning.tsx wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMorning\s*\}\s+from\s+'\.\.\/lib\/use-morning'/);
    assert.match(src, /useMorning\(\{[\s\S]*?showToast[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /apiPost<MorningResponse>/);
  });
});

describe('extracted: useAutoDispatch hook (v1.10.747)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-auto-dispatch.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Auto.tsx');

  it('exports the hook + accepts task/name/showToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAutoDispatch/);
    assert.match(src, /task:\s*string/);
    assert.match(src, /name:\s*string/);
    assert.match(src, /showToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
  });

  it('pre-validates task non-empty + window.confirm gates spawn', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!task\.trim\(\)\)/);
    assert.match(src, /auto\.error\.taskRequired/);
    assert.match(src, /window\.confirm\(t\('auto\.confirmDispatch'\)\)/);
  });

  it('POSTs /api/auto + routes failure through showToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<AutoResponse>\('\/api\/auto',\s*body\)/);
    assert.match(src, /auto\.toast\.dispatchFailed/);
    assert.match(src, /auto\.toast\.spawnedAs/);
    assert.match(src, /auto\.toast\.spawned/);
  });

  it('parent Auto.tsx wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAutoDispatch\s*\}\s+from\s+'\.\.\/lib\/use-auto-dispatch'/);
    assert.match(src, /useAutoDispatch\(\{[\s\S]*?task,\s*name,\s*showToast[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /apiPost<AutoResponse>/);
  });
});

describe('extracted: useProfiles + useTemplates + useCleanup hooks (v1.10.746)', () => {
  const fs = require('fs');
  const path = require('path');
  const PROFILES_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-profiles.ts');
  const PROFILES_PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Profiles.tsx');
  const TEMPLATES_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-templates.ts');
  const TEMPLATES_PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Templates.tsx');
  const CLEANUP_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-cleanup.ts');
  const CLEANUP_PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Cleanup.tsx');

  it('useProfiles exports + GETs /api/profiles + ProfileItem type', () => {
    const src = fs.readFileSync(PROFILES_HOOK, 'utf8');
    assert.match(src, /export function useProfiles/);
    assert.match(src, /export interface ProfileItem/);
    assert.match(src, /apiGet<ProfilesResponse>\('\/api\/profiles'\)/);
  });

  it('useTemplates exports + GETs /api/templates + TemplateItem type', () => {
    const src = fs.readFileSync(TEMPLATES_HOOK, 'utf8');
    assert.match(src, /export function useTemplates/);
    assert.match(src, /export interface TemplateItem/);
    assert.match(src, /apiGet<TemplatesResponse>\('\/api\/templates'\)/);
  });

  it('useCleanup exports preview + executeCleanup + confirmOpen modal slot', () => {
    const src = fs.readFileSync(CLEANUP_HOOK, 'utf8');
    assert.match(src, /export function useCleanup/);
    assert.match(src, /export interface CleanupResponse/);
    assert.match(src, /apiPost<CleanupResponse>\('\/api\/cleanup',\s*\{\s*dryRun:\s*true\s*\}\)/);
    assert.match(src, /apiPost<CleanupResponse>\('\/api\/cleanup',\s*\{\s*dryRun:\s*false\s*\}\)/);
    assert.match(src, /confirmOpen/);
    assert.match(src, /cleanup\.toast\.complete/);
    assert.match(src, /cleanup\.toast\.failed/);
  });

  it('parent Profiles.tsx wires useProfiles + drops the inline state', () => {
    const src = fs.readFileSync(PROFILES_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useProfiles\s*\}\s+from\s+'\.\.\/lib\/use-profiles'/);
    assert.match(src, /useProfiles\(\)/);
    assert.doesNotMatch(src, /apiGet<ProfilesResponse>/);
  });

  it('parent Templates.tsx wires useTemplates + drops the inline state', () => {
    const src = fs.readFileSync(TEMPLATES_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useTemplates\s*\}\s+from\s+'\.\.\/lib\/use-templates'/);
    assert.match(src, /useTemplates\(\)/);
    assert.doesNotMatch(src, /apiGet<TemplatesResponse>/);
  });

  it('parent Cleanup.tsx wires useCleanup + drops the inline preview/execute', () => {
    const src = fs.readFileSync(CLEANUP_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useCleanup\s*\}\s+from\s+'\.\.\/lib\/use-cleanup'/);
    assert.match(src, /useCleanup\(\{[\s\S]*?showToast[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /apiPost<CleanupResponse>/);
  });
});

describe('extracted: useScribe hook (v1.10.745)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-scribe.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Scribe.tsx');

  it('exports the hook + accepts showToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useScribe/);
    assert.match(src, /showToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
    assert.match(src, /export interface ScribeStatus/);
    assert.match(src, /export interface ContextResponse/);
  });

  it('refresh fetches /api/scribe/status + /api/scribe-context with split error semantics', () => {
    // (v1.10.753) apiFetch + manual error throw replaced with apiGet.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ScribeStatus>\('\/api\/scribe\/status'\)/);
    assert.match(src, /apiGet<ContextResponse>\('\/api\/scribe-context'\)/);
    // Status failure surfaces through error slot.
    assert.match(src, /setError\(\(e as Error\)\.message\)/);
    // Context failure swallows.
    assert.match(src, /setContext\(null\)/);
  });

  it('act busy-marks by endpoint + fires success/failed toast + post-action refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setBusy\(endpoint\)/);
    assert.match(src, /scribe\.toast\.ok/);
    assert.match(src, /scribe\.toast\.failed/);
    assert.match(src, /refresh\(\);[\s\S]*?\}/);
  });

  it('parent Scribe.tsx wires the hook + drops the inline state machine', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useScribe\s*\}\s+from\s+'\.\.\/lib\/use-scribe'/);
    assert.match(src, /useScribe\(\{[\s\S]*?showToast[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /apiFetch\('\/api\/scribe/);
    assert.doesNotMatch(src, /const \[status, setStatus\]/);
  });
});

describe('extracted: dispatchEvent helper (v1.10.744)', () => {
  const fs = require('fs');
  const path = require('path');
  const HELPER = path.join(__dirname, '..', 'web', 'src', 'lib', 'dispatch-event.ts');
  const HELP_UI = path.join(__dirname, '..', 'web', 'src', 'components', 'HelpUIRoot.tsx');
  const APP_HEADER = path.join(__dirname, '..', 'web', 'src', 'components', 'layout', 'AppHeader.tsx');
  const TOUR = path.join(__dirname, '..', 'web', 'src', 'components', 'OnboardingTour.tsx');
  const ACCOUNT = path.join(__dirname, '..', 'web', 'src', 'components', 'AccountMenu.tsx');

  it('exports dispatchEvent with SSR + try/catch guards', () => {
    const src = fs.readFileSync(HELPER, 'utf8');
    assert.match(src, /export function dispatchEvent\(name: string\): void/);
    assert.match(src, /typeof window === 'undefined'/);
    assert.match(src, /window\.dispatchEvent\(new CustomEvent\(name\)\)/);
    assert.match(src, /catch \{/);
  });

  it('HelpUIRoot adopts the helper for openHelpDrawer + openShortcutsModal', () => {
    const src = fs.readFileSync(HELP_UI, 'utf8');
    assert.match(src, /import\s+\{\s*dispatchEvent\s*\}\s+from\s+'\.\.\/lib\/dispatch-event'/);
    assert.match(src, /dispatchEvent\(HELP_EVENT_OPEN_DRAWER\)/);
    assert.match(src, /dispatchEvent\(HELP_EVENT_OPEN_SHORTCUTS\)/);
    // The local dispatch helper bodies should be gone.
    assert.doesNotMatch(src, /window\.dispatchEvent\(new CustomEvent\(HELP_EVENT/);
  });

  it('AppHeader drops the inline dispatch helper + uses the lib', () => {
    const src = fs.readFileSync(APP_HEADER, 'utf8');
    assert.match(src, /import\s+\{\s*dispatchEvent\s*\}\s+from\s+'\.\.\/\.\.\/lib\/dispatch-event'/);
    assert.match(src, /dispatchEvent\(HELP_EVENT_OPEN_DRAWER\)/);
    assert.doesNotMatch(src, /function dispatch\(name: string\)/);
  });

  it('OnboardingTour startOnboardingTour uses the lib helper', () => {
    const src = fs.readFileSync(TOUR, 'utf8');
    assert.match(src, /import\s+\{\s*dispatchEvent\s*\}\s+from\s+'\.\.\/lib\/dispatch-event'/);
    assert.match(src, /dispatchEvent\(TOUR_EVENT_START\)/);
  });

  it('AccountMenu drops the local dispatchEvent body + imports the lib', () => {
    const src = fs.readFileSync(ACCOUNT, 'utf8');
    assert.match(src, /import\s+\{\s*dispatchEvent\s*\}\s+from\s+'\.\.\/lib\/dispatch-event'/);
    assert.doesNotMatch(src, /function dispatchEvent\(name: string\)/);
  });
});

describe('extracted: useSilentPoll hook (v1.10.743)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-silent-poll.ts');
  const STUCK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-stuck-meetings.ts');
  const SUMMARY = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-summary.ts');

  it('exports the generic poll hook with apiGet + cancel-flag cleanup', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSilentPoll<T>\(url: string, intervalMs: number\): T \| null/);
    assert.match(src, /apiGet<T>\(url\)/);
    assert.match(src, /let cancelled = false/);
    assert.match(src, /\.catch\(\(\)\s*=>\s*\{[\s\S]*?silently degrade/);
    assert.match(src, /window\.clearInterval\(id\)/);
  });

  it('useStuckMeetings adopts useSilentPoll', () => {
    const src = fs.readFileSync(STUCK, 'utf8');
    assert.match(src, /import\s+\{\s*useSilentPoll\s*\}\s+from\s+'\.\/use-silent-poll'/);
    assert.match(src, /useSilentPoll<StuckResponse>\('\/api\/meetings\/stuck\?hours=1',\s*60000\)/);
    assert.doesNotMatch(src, /window\.setInterval/);
  });

  it('useSpecialistsSummary adopts useSilentPoll', () => {
    const src = fs.readFileSync(SUMMARY, 'utf8');
    assert.match(src, /import\s+\{\s*useSilentPoll\s*\}\s+from\s+'\.\/use-silent-poll'/);
    assert.match(src, /useSilentPoll<OrganismSummary>\('\/api\/specialists\/summary',\s*POLL_INTERVAL_MS\)/);
    assert.doesNotMatch(src, /window\.setInterval/);
  });

  it('exports useSilentPollWithRefresh variant with mapper + manual refresh (v1.10.767)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    // Public type is a domain-shaped U via mapper, with a stable refresh
    // promise so the caller can `await` it after a mutation.
    assert.match(src, /export function useSilentPollWithRefresh<T,\s*U>/);
    assert.match(src, /fallback:\s*U,\s*\n?\s*mapper:\s*\(res:\s*T\)\s*=>\s*U/);
    assert.match(src, /refresh:\s*\(\)\s*=>\s*Promise<void>/);
    // Mapper goes through a ref so its identity churn doesn't restart
    // the polling effect on every render.
    assert.match(src, /mapperRef = useRef\(mapper\)/);
    assert.match(src, /mapperRef\.current\(res\)/);
  });
});

describe('extracted: useActionItemsExport hook (v1.10.742)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-action-items-export.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsActionItemsPanel.tsx');

  it('exports the hook + accepts actions/meetingId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useActionItemsExport/);
    assert.match(src, /actions:\s*ActionItemsResponse \| null/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('handleDownloadJson uses Blob + revokeObjectURL after click', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /new Blob\(\[JSON\.stringify\(actions, null, 2\)\]/);
    assert.match(src, /URL\.createObjectURL/);
    assert.match(src, /URL\.revokeObjectURL/);
    assert.match(src, /a\.download = `action-items-\$\{meetingId\}\.json`/);
  });

  it('handleCopyMd groups by KIND_ORDER + writes to clipboard', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /KIND_ORDER:\s*ActionItemType\[\]\s*=\s*\['decision',\s*'action',\s*'todo',\s*'blocker'\]/);
    assert.match(src, /\$\{k\.toUpperCase\(\)\} \(\$\{group\.length\}\)/);
    assert.match(src, /navigator\.clipboard\.writeText\(md\)/);
  });

  it('parent MeetingsActionItemsPanel wires the hook + drops the inline handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useActionItemsExport\s*\}\s+from\s+'\.\.\/lib\/use-action-items-export'/);
    assert.match(src, /useActionItemsExport\(\{[\s\S]*?actions,\s*meetingId[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /URL\.createObjectURL/);
    assert.doesNotMatch(src, /navigator\.clipboard\.writeText/);
  });
});

describe('extracted: useLiveRef hook (v1.10.741)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-live-ref.ts');
  const SESSIONS = path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsView.tsx');
  const WORKFLOWS = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkflowEditor.tsx');

  it('exports the generic hook + returns MutableRefObject<T>', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useLiveRef<T>\(value: T\): MutableRefObject<T>/);
    assert.match(src, /const ref = useRef\(value\)/);
    assert.match(src, /ref\.current = value/);
  });

  it('SessionsView adopts the hook for the selectionRef', () => {
    const src = fs.readFileSync(SESSIONS, 'utf8');
    assert.match(src, /import\s+\{\s*useLiveRef\s*\}\s+from\s+'\.\.\/lib\/use-live-ref'/);
    assert.match(src, /const selectionRef = useLiveRef\(selection\)/);
    // The inline `useRef(selection); selectionRef.current = selection;` pair
    // should no longer appear.
    assert.doesNotMatch(src, /useRef\(selection\)/);
  });

  it('WorkflowEditor adopts the hook for the selectedIdRef', () => {
    const src = fs.readFileSync(WORKFLOWS, 'utf8');
    assert.match(src, /import\s+\{\s*useLiveRef\s*\}\s+from\s+'\.\.\/lib\/use-live-ref'/);
    assert.match(src, /const selectedIdRef = useLiveRef\(selectedId\)/);
    assert.doesNotMatch(src, /useRef\(selectedId\)/);
  });
});

describe('extracted: postAction helper (v1.10.740)', () => {
  const fs = require('fs');
  const path = require('path');
  const HELPER = path.join(__dirname, '..', 'web', 'src', 'lib', 'post-action.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ControlPanel.tsx');
  const SINGLE = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-control-panel-single.ts');
  const SELECTION = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-selection.ts');

  it('exports postAction + PostActionResult type', () => {
    const src = fs.readFileSync(HELPER, 'utf8');
    assert.match(src, /export async function postAction/);
    assert.match(src, /export interface PostActionResult/);
  });

  it('handles all 3 failure modes (network throw, non-2xx, 200+payload.error)', () => {
    const src = fs.readFileSync(HELPER, 'utf8');
    // Network throw — return as catch error
    assert.match(src, /catch \(e\) \{[\s\S]*?return \{ ok: false, error: \(e as Error\)\.message \}/);
    // HTTP non-2xx — payload.error || HTTP <status>
    assert.match(src, /if \(!res\.ok\)/);
    assert.match(src, /HTTP \$\{res\.status\}/);
    // 200 + payload.error
    assert.match(src, /'error' in payload[\s\S]*?\(payload as \{ error: unknown \}\)\.error/);
  });

  it('parent ControlPanel drops the inline postAction + apiFetch import', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.doesNotMatch(src, /async function postAction/);
    assert.doesNotMatch(src, /import\s+\{\s*apiFetch\s*\}\s+from\s+'\.\.\/lib\/api'/);
  });

  it('useControlPanelSingle imports postAction directly + drops it from props', () => {
    const src = fs.readFileSync(SINGLE, 'utf8');
    assert.match(src, /import\s+\{\s*postAction\s*\}\s+from\s+'\.\/post-action'/);
    assert.doesNotMatch(src, /postAction:\s*\(endpoint:\s*string,\s*body:\s*Record/);
  });

  it('useWorkerSelection imports postAction directly + drops it from props', () => {
    const src = fs.readFileSync(SELECTION, 'utf8');
    assert.match(src, /import\s+\{\s*postAction\s*\}\s+from\s+'\.\/post-action'/);
    assert.doesNotMatch(src, /postAction:\s*\(endpoint:\s*string,\s*body:\s*Record/);
  });
});

describe('extracted: useControlPanelWorkerList hook (v1.10.737)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-control-panel-worker-list.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ControlPanel.tsx');

  it('exports the hook + returns workers + fetchList', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useControlPanelWorkerList/);
    assert.match(src, /workers:\s*Worker\[\]/);
    assert.match(src, /fetchList:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('polls /api/list every 5s + silently swallows errors', () => {
    // (v1.10.750) apiFetch + manual error throw replaced with apiGet.
    // (v1.10.767) Self-polling fetch + manual refresh delegated to
    // useSilentPollWithRefresh; the underlying apiGet + setInterval +
    // silent-catch all live in lib/use-silent-poll now.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useSilentPollWithRefresh<ListResponse,\s*Worker\[\]>/);
    assert.match(src, /'\/api\/list'/);
    assert.match(src, /POLL_INTERVAL_MS\s*=\s*5000/);
    const pollSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-silent-poll.ts'),
      'utf8',
    );
    assert.match(pollSrc, /apiGet<T>\(url\)/);
    assert.match(pollSrc, /setInterval\(tick, intervalMs\)/);
    assert.match(pollSrc, /silently degrade/);
  });

  it('parent ControlPanel wires the hook + drops the inline poll', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useControlPanelWorkerList\s*\}\s+from\s+'\.\.\/lib\/use-control-panel-worker-list'/);
    assert.match(src, /useControlPanelWorkerList\(\)/);
    assert.doesNotMatch(src, /setInterval\(fetchList/);
    assert.doesNotMatch(src, /apiFetch\('\/api\/list'\)/);
  });
});

describe('extracted: useSessionsCollapse hook (v1.10.736)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-sessions-collapse.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsView.tsx');

  it('exports the hook + returns collapsed map + attached flag + toggles', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSessionsCollapse/);
    assert.match(src, /collapsed:\s*Record<string,\s*boolean>/);
    assert.match(src, /toggleGroup:\s*\(key:\s*string\)\s*=>\s*void/);
    assert.match(src, /attachedCollapsed:\s*boolean/);
    assert.match(src, /toggleAttachedCollapsed:\s*\(\)\s*=>\s*void/);
  });

  it('toggleGroup uses the per-key flip pattern', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setCollapsed\(\(prev\)\s*=>\s*\(\{\s*\.\.\.prev,\s*\[key\]:\s*!prev\[key\]\s*\}\)\)/);
  });

  it('toggleAttachedCollapsed uses the v => !v flip pattern', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setAttachedCollapsed\(\(v\)\s*=>\s*!v\)/);
  });

  it('parent SessionsView wires the hook + drops the inline lambdas', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSessionsCollapse\s*\}\s+from\s+'\.\.\/lib\/use-sessions-collapse'/);
    assert.match(src, /useSessionsCollapse\(\)/);
    assert.doesNotMatch(src, /setCollapsed\(\(prev\)/);
    assert.doesNotMatch(src, /setAttachedCollapsed\(\(v\)/);
  });
});

describe('extracted: useFilteredFeatures hook (v1.10.735)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-filtered-features.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'layout', 'FeatureSidebar.tsx');

  it('exports the hook + accepts filter string', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useFilteredFeatures\(filter: string\)/);
  });

  it('groups by CATEGORY_ORDER + uses i18n labelKey/descriptionKey for haystack', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /CATEGORY_ORDER/);
    assert.match(src, /t\(f\.labelKey\)\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(src, /t\(f\.descriptionKey\)\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(src, /f\.id\.toLowerCase\(\)\.includes\(q\)/);
  });

  it('matchCount reduces across all categories', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /CATEGORY_ORDER\.reduce/);
    assert.match(src, /grouped\[c\]\?\.length \|\| 0/);
  });

  it('parent FeatureSidebar wires the hook + drops the inline memo', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useFilteredFeatures\s*\}\s+from\s+'\.\.\/\.\.\/lib\/use-filtered-features'/);
    assert.match(src, /useFilteredFeatures\(filter\)/);
    assert.doesNotMatch(src, /useMemo\(/);
    assert.doesNotMatch(src, /featuresByCategory\(\)/);
  });
});

describe('extracted: useAttachForm + useNewChatForm hooks (v1.10.734)', () => {
  const fs = require('fs');
  const path = require('path');
  const ATTACH_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-attach-form.ts');
  const ATTACH_PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'AttachModal.tsx');
  const NCF_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-new-chat-form.ts');
  const NCF_PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'NewChatModal.tsx');

  it('useAttachForm exports + resets on close', () => {
    const src = fs.readFileSync(ATTACH_HOOK, 'utf8');
    assert.match(src, /export function useAttachForm/);
    assert.match(src, /useState\(''\)/);
    assert.match(src, /if \(!open\)\s*\{[\s\S]*?setPathValue\(''\)/);
    assert.match(src, /setNameValue\(''\)/);
  });

  it('useNewChatForm exports + resets on open with model/agent defaults', () => {
    const src = fs.readFileSync(NCF_HOOK, 'utf8');
    assert.match(src, /export function useNewChatForm/);
    assert.match(src, /useState\('default'\)/);
    assert.match(src, /useState\('generic'\)/);
    assert.match(src, /if \(open\)\s*\{[\s\S]*?setPrompt\(''\)/);
    assert.match(src, /setModel\('default'\)/);
    assert.match(src, /setAgent\('generic'\)/);
  });

  it('parent AttachModal wires the hook + drops the inline reset', () => {
    const src = fs.readFileSync(ATTACH_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAttachForm\s*\}\s+from\s+'\.\.\/lib\/use-attach-form'/);
    assert.match(src, /useAttachForm\(\{[\s\S]*?open[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[pathValue, setPathValue\]/);
    assert.doesNotMatch(src, /useEffect\([\s\S]*?if \(!open\)/);
  });

  it('parent NewChatModal wires the hook + drops the inline reset', () => {
    const src = fs.readFileSync(NCF_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useNewChatForm\s*\}\s+from\s+'\.\.\/lib\/use-new-chat-form'/);
    assert.match(src, /useNewChatForm\(\{[\s\S]*?open[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[prompt, setPrompt\]/);
    assert.doesNotMatch(src, /useEffect\([\s\S]*?if \(open\)\s*\{/);
  });
});

describe('extracted: useStatusMessage hook (v1.10.733)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-status-message.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'StatusMessageCard.tsx');

  it('exports the hook + accepts workerName + onToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useStatusMessage/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /onToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
  });

  it('POSTs /api/status-update with worker + message body', () => {
    // (v1.10.751) apiFetch + manual error throw replaced with apiPost.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost\('\/api\/status-update',\s*\{\s*worker:\s*workerName,\s*message:\s*text\s*\}\)/);
  });

  it('clears the textarea on success + routes failures through onToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setMessage\(''\)/);
    assert.match(src, /controlPanel\.status\.sent/);
    assert.match(src, /controlPanel\.status\.failed/);
  });

  it('parent StatusMessageCard wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useStatusMessage\s*\}\s+from\s+'\.\.\/lib\/use-status-message'/);
    assert.match(src, /useStatusMessage\(\{[\s\S]*?workerName,\s*onToast[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /apiFetch\('\/api\/status-update'/);
    assert.doesNotMatch(src, /const \[message, setMessage\]/);
  });
});

describe('extracted: useUiPreferences hook (v1.10.732)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-ui-preferences.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'App.tsx');

  it('exports the hook + accepts onCrossTabSync callback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useUiPreferences/);
    assert.match(src, /onCrossTabSync\?:\s*\(\)\s*=>\s*void/);
  });

  it('owns 4 preference slots + per-slot persistence effects', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<SidebarMode>\(readSidebarMode\)/);
    assert.match(src, /useState<boolean>\(readSidebarCollapsed\)/);
    assert.match(src, /useState<DetailMode>\(readDetailMode\)/);
    assert.match(src, /useState<TopView>\(readTopView\)/);
    assert.match(src, /writeSidebarMode\(sidebarMode\)/);
    assert.match(src, /writeSidebarCollapsed\(sidebarCollapsed\)/);
    assert.match(src, /writeDetailMode\(detailMode\)/);
    assert.match(src, /writeTopView\(topView\)/);
  });

  it('storage event re-reads all four + invokes onCrossTabSync', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /addEventListener\('storage'/);
    assert.match(src, /removeEventListener\('storage'/);
    assert.match(src, /setSidebarMode\(readSidebarMode\(\)\)/);
    assert.match(src, /setTopView\(readTopView\(\)\)/);
    assert.match(src, /onCrossTabSync\?\.\(\)/);
  });

  it('parent App.tsx wires the hook + drops the inline persistence', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useUiPreferences\s*\}\s+from\s+'\.\/lib\/use-ui-preferences'/);
    assert.match(src, /useUiPreferences\(\{[\s\S]*?onCrossTabSync[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /writeSidebarMode\(/);
    assert.doesNotMatch(src, /writeSidebarCollapsed\(/);
    assert.doesNotMatch(src, /addEventListener\('storage'/);
  });

  it('exposes a stable toggleSidebarCollapsed (v1.10.760)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    // Returned in the state object + memoized via useCallback so the
    // shortcut hook + sidebar header chevron share one identity.
    assert.match(src, /toggleSidebarCollapsed:\s*\(\)\s*=>\s*void/);
    assert.match(src, /const toggleSidebarCollapsed = useCallback\(/);
    assert.match(src, /setSidebarCollapsed\(\(v\)\s*=>\s*!v\)/);
    const parent = fs.readFileSync(PARENT, 'utf8');
    assert.match(parent, /toggleSidebarCollapsed/);
    assert.doesNotMatch(parent, /setSidebarCollapsed\(\(v\)\s*=>\s*!v\)/);
  });
});

describe('extracted: useWorkspaces hook (v1.10.731)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-workspaces.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Workspaces.tsx');

  it('exports the hook + Workspace type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkspaces\(\)/);
    assert.match(src, /export interface Workspace/);
  });

  it('GET /api/workspaces on mount + refresh re-fetches', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<WorkspacesResponse>\('\/api\/workspaces'\)/);
    assert.match(src, /useEffect\(\(\)\s*=>\s*\{\s*refresh\(\);\s*\},\s*\[refresh\]\)/);
  });

  it('error path falls back to common.failedToLoadWorkspaces i18n key', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /common\.failedToLoadWorkspaces/);
  });

  it('parent Workspaces.tsx wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkspaces\s*\}\s+from\s+'\.\.\/lib\/use-workspaces'/);
    assert.match(src, /useWorkspaces\(\)/);
    assert.doesNotMatch(src, /apiGet<WorkspacesResponse>/);
    assert.doesNotMatch(src, /const \[data, setData\]/);
  });
});

describe('extracted: useSwarm hook (v1.10.730)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-swarm.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Swarm.tsx');

  it('exports the hook + SwarmNode/SwarmResponse types', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSwarm\(\)/);
    assert.match(src, /export interface SwarmNode/);
    assert.match(src, /export interface SwarmResponse/);
  });

  it('loadWorkers fetches /api/list + auto-selects first when empty', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ListResponse>\('\/api\/list'\)/);
    assert.match(src, /if \(!selected && first\) setSelected\(first\.name\)/);
  });

  it('loadSwarm fetches /api/swarm?name=<selected> + bails when no selection', () => {
    // (v1.10.750) apiFetch + manual error throw replaced with apiGet
    // (which throws on non-ok internally via _throwHttpError).
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!selected\) return/);
    assert.match(src, /apiGet<SwarmResponse>\(`\/api\/swarm\?name=\$\{encodeURIComponent\(selected\)\}`\)/);
  });

  it('refresh handle exposes loadSwarm (not loadWorkers)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /refresh:\s*loadSwarm/);
  });

  it('parent Swarm.tsx wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSwarm[\s\S]*?\}\s+from\s+'\.\.\/lib\/use-swarm'/);
    assert.match(src, /useSwarm\(\)/);
    assert.doesNotMatch(src, /apiGet<ListResponse>/);
    assert.doesNotMatch(src, /apiFetch\(`\/api\/swarm/);
  });
});

describe('extracted: useHealth + useRbac hooks (v1.10.729)', () => {
  const fs = require('fs');
  const path = require('path');
  const HEALTH_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-health.ts');
  const HEALTH_PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Health.tsx');
  const RBAC_HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-rbac.ts');
  const RBAC_PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Rbac.tsx');

  it('useHealth exports + polls /api/health every 10s', () => {
    const src = fs.readFileSync(HEALTH_HOOK, 'utf8');
    assert.match(src, /export function useHealth/);
    assert.match(src, /export interface HealthPayload/);
    assert.match(src, /apiGet<HealthPayload>\('\/api\/health'\)/);
    assert.match(src, /POLL_INTERVAL_MS\s*=\s*10000/);
    assert.match(src, /setInterval\(refresh, POLL_INTERVAL_MS\)/);
  });

  it('useRbac exports + dual-fetches /api/rbac/roles + /users via Promise.all', () => {
    const src = fs.readFileSync(RBAC_HOOK, 'utf8');
    assert.match(src, /export function useRbac/);
    assert.match(src, /export interface Role/);
    assert.match(src, /export interface User/);
    assert.match(src, /Promise\.all\(\[/);
    assert.match(src, /apiGet<RolesResponse>\('\/api\/rbac\/roles'\)/);
    assert.match(src, /apiGet<UsersResponse>\('\/api\/rbac\/users'\)/);
  });

  it('useRbac surfaces a single loading + error path for both fetches', () => {
    const src = fs.readFileSync(RBAC_HOOK, 'utf8');
    assert.match(src, /const \[error, setError\] = useState<string \| null>\(null\)/);
    assert.match(src, /const \[loading, setLoading\] = useState\(false\)/);
    assert.match(src, /finally\s*\{[\s\S]*?setLoading\(false\)/);
  });

  it('parent Health.tsx wires useHealth + drops the inline state', () => {
    const src = fs.readFileSync(HEALTH_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useHealth\s*\}\s+from\s+'\.\.\/lib\/use-health'/);
    assert.match(src, /useHealth\(\)/);
    assert.doesNotMatch(src, /apiGet<HealthPayload>/);
    assert.doesNotMatch(src, /setInterval\(refresh/);
  });

  it('parent Rbac.tsx wires useRbac + drops the inline state', () => {
    const src = fs.readFileSync(RBAC_PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useRbac\s*\}\s+from\s+'\.\.\/lib\/use-rbac'/);
    assert.match(src, /useRbac\(\)/);
    assert.doesNotMatch(src, /apiGet<RolesResponse>/);
    assert.doesNotMatch(src, /Promise\.all\(/);
  });
});

describe('extracted: useSelectedFeatureId hook (v1.10.728)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-selected-feature-id.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'layout', 'FeatureView.tsx');

  it('exports the hook + returns a [string, setter] tuple', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSelectedFeatureId\(\): \[string, \(id: string\) => void\]/);
  });

  it('readInitialFeature reads from hash → localStorage → fallback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /function readInitialFeature/);
    assert.match(src, /window\.location\.hash/);
    assert.match(src, /window\.localStorage\.getItem\(FEATURE_KEY\)/);
    assert.match(src, /FEATURES\[0\]\?\.id/);
  });

  it('persists to both localStorage + hash on change', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.localStorage\.setItem\(FEATURE_KEY,\s*selectedId\)/);
    assert.match(src, /writeHash\(selectedId\)/);
  });

  it('uses history.replaceState (not pushState) for hash writes', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.history\.replaceState/);
    assert.doesNotMatch(src, /window\.history\.pushState/);
  });

  it('listens for hashchange + syncs back into state', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /addEventListener\('hashchange'/);
    assert.match(src, /removeEventListener\('hashchange'/);
  });

  it('parent FeatureView wires the hook + drops the inline state machine', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSelectedFeatureId\s*\}\s+from\s+'\.\.\/\.\.\/lib\/use-selected-feature-id'/);
    assert.match(src, /const \[selectedId, setSelectedId\] = useSelectedFeatureId\(\)/);
    assert.doesNotMatch(src, /function readInitialFeature/);
    assert.doesNotMatch(src, /function writeHash/);
    assert.doesNotMatch(src, /addEventListener\('hashchange'/);
  });
});

describe('extracted: useLazyRiskPatterns hook (v1.10.727)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-lazy-risk-patterns.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'RiskRuleCatalogPanel.tsx');

  it('exports the hook + PatternsResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useLazyRiskPatterns/);
    assert.match(src, /export interface PatternsResponse/);
  });

  it('lazy-loads on first open + caches subsequent opens', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!open \|\| patterns\) return/);
    assert.match(src, /apiGet<PatternsResponse>\('\/api\/risk\/patterns'\)/);
    assert.match(src, /\}, \[open, patterns\]\)/);
  });

  it('errors silently degrade (catch swallows)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\.catch\(\(\)\s*=>\s*\{[\s\S]*?silent/);
  });

  it('parent RiskRuleCatalogPanel wires the hook + drops the inline fetch', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useLazyRiskPatterns\s*\}\s+from\s+'\.\.\/lib\/use-lazy-risk-patterns'/);
    assert.match(src, /const patterns = useLazyRiskPatterns\(\{[\s\S]*?open[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /apiGet<PatternsResponse>/);
    assert.doesNotMatch(src, /const \[patterns, setPatterns\]/);
  });
});

describe('extracted: useMetrics hook (v1.10.726)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-metrics.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MetricsBar.tsx');

  it('exports the hook + MetricsResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMetrics/);
    assert.match(src, /export interface MetricsResponse/);
  });

  it('fetches /api/metrics + polls every 5s', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /fetch\('\/api\/metrics'\)/);
    assert.match(src, /POLL_INTERVAL_MS\s*=\s*5000/);
    assert.match(src, /setInterval\(tick, POLL_INTERVAL_MS\)/);
  });

  it('keeps last value on network blip + bails on non-ok response', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /catch \{[\s\S]*?network blip — keep last value/);
    assert.match(src, /if \(!res\.ok\) return/);
  });

  it('parent MetricsBar wires the hook + drops the inline poll', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMetrics\s*\}\s+from\s+'\.\.\/lib\/use-metrics'/);
    assert.match(src, /const m = useMetrics\(\)/);
    assert.doesNotMatch(src, /setInterval\(tick/);
    assert.doesNotMatch(src, /fetch\('\/api\/metrics'\)/);
  });
});

describe('extracted: useSpecialistsSummary hook (v1.10.725)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-summary.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsSummaryBar.tsx');

  it('exports the hook + OrganismSummary type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistsSummary/);
    assert.match(src, /export interface OrganismSummary/);
  });

  it('GET /api/specialists/summary on mount + polls every 30s', () => {
    // (v1.10.743) Polling shape lifted to lib/use-silent-poll. Hook is now
    // a one-liner wrapper that wires the URL + interval into useSilentPoll.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useSilentPoll<OrganismSummary>\('\/api\/specialists\/summary',\s*POLL_INTERVAL_MS\)/);
    assert.match(src, /POLL_INTERVAL_MS\s*=\s*30000/);
    const pollSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-silent-poll.ts'),
      'utf8',
    );
    assert.match(pollSrc, /apiGet<T>\(url\)/);
    assert.match(pollSrc, /window\.setInterval\(tick, intervalMs\)/);
  });

  it('cleanup cancels in-flight + clears interval', () => {
    // (v1.10.743) Cancel-flag + clearInterval pair moved into useSilentPoll.
    const pollSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-silent-poll.ts'),
      'utf8',
    );
    assert.match(pollSrc, /let cancelled = false/);
    assert.match(pollSrc, /if \(!cancelled\) setData\(res\)/);
    assert.match(pollSrc, /cancelled = true;\s*window\.clearInterval\(id\)/);
  });

  it('errors silently degrade (catch swallows)', () => {
    // (v1.10.743) Catch swallow moved into useSilentPoll.
    const pollSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-silent-poll.ts'),
      'utf8',
    );
    assert.match(pollSrc, /\.catch\(\(\)\s*=>\s*\{[\s\S]*?\/\* silently degrade/);
  });

  it('parent SpecialistsSummaryBar wires the hook + drops the inline poll', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistsSummary\s*\}\s+from\s+'\.\.\/lib\/use-specialists-summary'/);
    assert.match(src, /const summary = useSpecialistsSummary\(\)/);
    assert.doesNotMatch(src, /window\.setInterval/);
    assert.doesNotMatch(src, /apiGet<OrganismSummary>/);
  });
});

describe('extracted: useValidations hook (v1.10.724)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-validations.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Validation.tsx');

  it('exports the hook with no required args + ValidationResponse type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useValidations\(\)/);
    assert.match(src, /export interface ValidationResponse/);
  });

  it('GET /api/list then per-worker fan-out via Promise.all', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ListResponse>\('\/api\/list'\)/);
    assert.match(src, /Promise\.all\(/);
    assert.match(src, /\/api\/validation\?name=\$\{encodeURIComponent\(w\.name\)\}/);
  });

  it('per-worker failure surfaces as { error: <message> } not abort', () => {
    // (v1.10.754) apiFetch+manual error mapping replaced with apiGet —
    // its thrown HTTP <s> message is captured by the same catch.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /next\[w\.name\] = \{ error: \(e as Error\)\.message \}/);
  });

  it('useEffect refresh on mount + exposes manual refresh', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useEffect\(\(\)\s*=>\s*\{\s*refresh\(\);\s*\}/);
  });

  it('parent Validation.tsx wires the hook + drops the inline fan-out', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useValidations[\s\S]*?\}\s+from\s+'\.\.\/lib\/use-validations'/);
    assert.match(src, /useValidations\(\)/);
    assert.doesNotMatch(src, /Promise\.all\(/);
    assert.doesNotMatch(src, /apiGet<ListResponse>/);
  });
});

describe('extracted: useConfig hook (v1.10.723)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-config.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Config.tsx');

  it('exports the hook with no required args', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useConfig\(\)/);
  });

  it('GET /api/config on mount + exposes refresh + load error/loading slots', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ConfigResponse>\('\/api\/config'\)/);
    assert.match(src, /useEffect\(\(\)\s*=>\s*\{\s*refresh\(\);\s*\},\s*\[refresh\]\)/);
  });

  it('handleReload guards via window.confirm + auto-clears reloadMsg after 5s', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(t\('config\.reloadConfirm'\)\)/);
    assert.match(src, /apiPost<ReloadResponse>\('\/api\/config\/reload',\s*\{\}\)/);
    assert.match(src, /window\.setTimeout\(\s*\(\)\s*=>\s*setReloadMsg\(null\),\s*5000\s*\)/);
  });

  it('reloadFailed slot tracks tone separately from reloadMsg copy', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setReloadFailed\(!res\.ok\)/);
    assert.match(src, /setReloadFailed\(true\)/);
  });

  it('parent Config.tsx wires the hook + drops the inline state machine', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useConfig\s*\}\s+from\s+'\.\.\/lib\/use-config'/);
    assert.match(src, /useConfig\(\)/);
    assert.doesNotMatch(src, /const \[config, setConfig\]/);
    assert.doesNotMatch(src, /apiGet<ConfigResponse>/);
    assert.doesNotMatch(src, /apiPost<ReloadResponse>/);
  });
});

describe('useToast adoption sweep (v1.10.722)', () => {
  const fs = require('fs');
  const path = require('path');
  const PAGES = ['Morning', 'Scribe', 'Auto', 'Profiles', 'Cleanup', 'Templates'];

  for (const name of PAGES) {
    it(`${name}.tsx uses lib/use-toast (no inline ToastState/setToast)`, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'web', 'src', 'pages', `${name}.tsx`),
        'utf8',
      );
      assert.match(src, /import\s+\{\s*useToast\s*\}\s+from\s+'\.\.\/lib\/use-toast'/);
      assert.match(src, /useToast\(\)/);
      assert.doesNotMatch(src, /interface ToastState/);
      assert.doesNotMatch(src, /const \[toast,\s*setToast\]/);
      assert.doesNotMatch(src, /setToast\(null\)/);
    });
  }
});

describe('extracted: useCopyPulse hook (v1.10.721)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-copy-pulse.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsAttachedRowActions.tsx');

  it('exports the hook + accepts text + optional durationMs', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useCopyPulse/);
    assert.match(src, /text:\s*string/);
    assert.match(src, /durationMs\?:\s*number/);
  });

  it('default pulse is 1500ms + uses navigator.clipboard.writeText', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /DEFAULT_PULSE_MS\s*=\s*1500/);
    assert.match(src, /navigator\.clipboard\.writeText\(text\)/);
    assert.match(src, /typeof navigator !== 'undefined'/);
  });

  it('pulse uses window.setTimeout(setCopied(false), durationMs)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout\(\s*\(\)\s*=>\s*setCopied\(false\),\s*durationMs\s*\)/);
  });

  it('parent SessionsAttachedRowActions wires the hook + drops the inline copy fn', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useCopyPulse\s*\}\s+from\s+'\.\.\/lib\/use-copy-pulse'/);
    assert.match(src, /useCopyPulse\(\{[\s\S]*?text:\s*resumeCmd[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /function copyToClipboard/);
    assert.doesNotMatch(src, /const \[copied, setCopied\]/);
  });
});

describe('extracted: useWorkerActionStrip hook (v1.10.720)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-action-strip.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkerActions.tsx');

  it('exports the hook + accepts showToast', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkerActionStrip/);
    assert.match(src, /showToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
  });

  it('runAction confirms via window.confirm + busy-marks the kind', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(action\.disabled\) return/);
    assert.match(src, /if \(!window\.confirm\(action\.confirm\)\) return/);
    assert.match(src, /setBusyKind\(action\.kind\)/);
  });

  it('handles both HTTP error and JSON {error} payload paths', () => {
    // (v1.10.749) HTTP/payload error handling moved into post-action helper.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /worker\.action\.failed/);
    const helperSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'post-action.ts'),
      'utf8',
    );
    assert.match(helperSrc, /if \(!res\.ok\)/);
    assert.match(helperSrc, /HTTP \$\{res\.status\}/);
    // Second branch: HTTP 200 but payload.error set.
    assert.match(helperSrc, /'error' in payload[\s\S]*?\(payload as \{ error: unknown \}\)\.error/);
  });

  it('parent WorkerActions wires the hook + drops the inline runAction', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkerActionStrip\s*\}\s+from\s+'\.\.\/lib\/use-worker-action-strip'/);
    assert.match(src, /useWorkerActionStrip\(\{[\s\S]*?showToast[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[busyKind, setBusyKind\]/);
    assert.doesNotMatch(src, /apiFetch\(action\.endpoint/);
  });

  it('does not collide with the older useWorkerActions (workerDetail) hook', () => {
    // (v1.10.705) useWorkerActions in lib/use-worker-actions.ts drives
    // WorkerDetail's send/key/merge handlers. The new strip hook lives
    // in lib/use-worker-action-strip.ts so the two coexist.
    const oldHook = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-actions.ts'),
      'utf8',
    );
    assert.match(oldHook, /export function useWorkerActions/);
    const stripHook = fs.readFileSync(HOOK, 'utf8');
    assert.match(stripHook, /export function useWorkerActionStrip/);
  });
});

describe('extracted: useLogin hook (v1.10.719)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-login.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'Login.tsx');

  it('exports the hook + accepts onSuccess', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useLogin/);
    assert.match(src, /onSuccess:\s*\(\)\s*=>\s*void/);
  });

  it('handleSubmit calls login() + invokes onSuccess on res.token', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /import\s+\{\s*login\s*\}\s+from\s+'\.\/api'/);
    assert.match(src, /await login\(user, password\)/);
    assert.match(src, /if \(res\.token\)\s*\{\s*onSuccess\(\)/);
  });

  it('busy gate prevents double-submits + flows through try/finally', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(busy\) return/);
    assert.match(src, /setBusy\(true\)/);
    assert.match(src, /finally\s*\{[\s\S]*?setBusy\(false\)/);
  });

  it('parent Login wires the hook + drops the inline state machine', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useLogin\s*\}\s+from\s+'\.\.\/lib\/use-login'/);
    assert.match(src, /useLogin\(\{[\s\S]*?onSuccess[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[user, setUser\]/);
    assert.doesNotMatch(src, /import\s+\{\s*login\s*\}\s+from\s+'\.\.\/lib\/api'/);
  });
});

describe('extracted: useMeetingPeerRetro hook (v1.10.718)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-peer-retro.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsPeerRetroControls.tsx');

  it('exports the hook + accepts meetingId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingPeerRetro/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('POSTs /api/meetings/:id/peer-retro with brain + apply:true', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost/);
    assert.match(src, /\/api\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/peer-retro/);
    assert.match(src, /brain/);
    assert.match(src, /apply:\s*true/);
  });

  it('success path auto-clears msg after 6s + computes raters/ratings/updated', () => {
    // (v1.10.765) Banner state delegated to useAutoClearMessage; the
    // 6s duration is passed as the second arg to setSuccess.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useAutoClearMessage/);
    assert.match(src, /setSuccess\([\s\S]*?,\s*6000\)/);
    assert.match(src, /res\.peer\.raw/);
    assert.match(src, /res\.peer\.raters/);
    assert.match(src, /Object\.keys\(res\.applied\)/);
    assert.match(src, /meetings\.peerRetro\.success/);
  });

  it('parent MeetingsPeerRetroControls wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingPeerRetro\s*\}\s+from\s+'\.\.\/lib\/use-meeting-peer-retro'/);
    assert.match(src, /useMeetingPeerRetro\(\{[\s\S]*?meetingId[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[busy, setBusy\]/);
    assert.doesNotMatch(src, /apiPost/);
  });
});

describe('extracted: useMeetingRetro hook (v1.10.717)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-retro.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsRetroActions.tsx');

  it('exports the hook + accepts meetingId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingRetro/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('POSTs /api/meetings/:id/(retro|finalize) based on the finalize flag', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost/);
    assert.match(src, /\/api\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/\$\{path\}/);
    assert.match(src, /finalize\s*\?\s*'finalize'\s*:\s*'retro'/);
  });

  it('busy slot tracks preview | finalize | null + meeting-change reset effect', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<'preview' \| 'finalize' \| null>/);
    assert.match(src, /useEffect\([\s\S]*?setResult\(null\);\s*setError\(null\);\s*\}, \[meetingId\]\)/);
  });

  it('error path uses i18n meetings.(finalize|retro).failed keys', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /meetings\.finalize\.failed/);
    assert.match(src, /meetings\.retro\.failed/);
  });

  it('parent MeetingsRetroActions wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingRetro\s*\}\s+from\s+'\.\.\/lib\/use-meeting-retro'/);
    assert.match(src, /useMeetingRetro\(\{[\s\S]*?meetingId[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[busy, setBusy\]/);
    assert.doesNotMatch(src, /apiPost/);
  });
});

describe('extracted: useMeetingRun hook (v1.10.716)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-run.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsRunControls.tsx');

  it('exports the hook + accepts meetingId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingRun/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('POSTs /api/meetings/:id/run with brain + autoFinalize:true', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost\(/);
    assert.match(src, /\/api\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/run/);
    assert.match(src, /brain/);
    assert.match(src, /autoFinalize:\s*true/);
  });

  it('busy + error slots flow through try/finally', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setBusy\(true\)/);
    assert.match(src, /setError\(null\)/);
    assert.match(src, /finally\s*\{[\s\S]*?setBusy\(false\)/);
    assert.match(src, /common\.failedToStartMeeting/);
  });

  it('parent MeetingsRunControls wires the hook + drops the inline state', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingRun\s*\}\s+from\s+'\.\.\/lib\/use-meeting-run'/);
    assert.match(src, /useMeetingRun\(\{[\s\S]*?meetingId[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[busy, setBusy\]/);
    assert.doesNotMatch(src, /const \[brain, setBrain\]/);
    assert.doesNotMatch(src, /apiPost\(/);
  });
});

describe('extracted: useXtermResizeFit hook (v1.10.715)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-xterm-resize-fit.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'XtermView.tsx');

  it('exports the hook + accepts containerRef/scheduleFit/visible/fitTimerRef', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useXtermResizeFit/);
    assert.match(src, /containerRef:\s*MutableRefObject<HTMLElement \| null>/);
    assert.match(src, /scheduleFit:\s*\(\)\s*=>\s*void/);
    assert.match(src, /visible:\s*boolean/);
    assert.match(src, /fitTimerRef:\s*MutableRefObject<number \| null>/);
  });

  it('hook owns ResizeObserver + window.resize + useLayoutEffect-on-visible', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /new ResizeObserver/);
    assert.match(src, /addEventListener\('resize'/);
    assert.match(src, /useLayoutEffect/);
    assert.match(src, /if \(visible\) scheduleFit\(\)/);
  });

  it('ResizeObserver cleanup also clears the fit-timer ref', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /obs\.disconnect/);
    assert.match(src, /window\.clearTimeout\(fitTimerRef\.current\)/);
    assert.match(src, /fitTimerRef\.current = null/);
  });

  it('parent XtermView wires the hook + drops the inline resize effects', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useXtermResizeFit\s*\}\s+from\s+'\.\.\/lib\/use-xterm-resize-fit'/);
    assert.match(src, /useXtermResizeFit\(\{[\s\S]*?containerRef,\s*scheduleFit,\s*visible,\s*fitTimerRef[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /new ResizeObserver/);
    assert.doesNotMatch(src, /addEventListener\('resize'/);
  });
});

describe('extracted: useEscapeToClose hook (v1.10.714)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-escape-to-close.ts');
  const MODAL_NEW = path.join(__dirname, '..', 'web', 'src', 'components', 'NewChatModal.tsx');
  const MODAL_KS = path.join(__dirname, '..', 'web', 'src', 'components', 'KeyboardShortcutsModal.tsx');

  it('exports the hook + accepts open/onClose/optional busy', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useEscapeToClose/);
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /busy\?:\s*boolean/);
  });

  it('listener only mounts while open + busy short-circuits dismissal', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!open\) return/);
    assert.match(src, /if \(busy\) return/);
    assert.match(src, /e\.key !== 'Escape'/);
    assert.match(src, /addEventListener\('keydown'/);
    assert.match(src, /removeEventListener\('keydown'/);
  });

  it('NewChatModal wires the hook with the busy gate + drops the inline effect', () => {
    const src = fs.readFileSync(MODAL_NEW, 'utf8');
    assert.match(src, /import\s+\{\s*useEscapeToClose\s*\}\s+from\s+'\.\.\/lib\/use-escape-to-close'/);
    assert.match(src, /useEscapeToClose\(\{[\s\S]*?open,\s*onClose,\s*busy[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /e\.key === 'Escape' && !busy/);
  });

  it('KeyboardShortcutsModal shares the hook (no busy gate)', () => {
    const src = fs.readFileSync(MODAL_KS, 'utf8');
    assert.match(src, /import\s+\{\s*useEscapeToClose\s*\}\s+from\s+'\.\.\/lib\/use-escape-to-close'/);
    assert.match(src, /useEscapeToClose\(\{[\s\S]*?open,\s*onClose[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /addEventListener\('keydown'/);
  });
});

describe('extracted: useOnboardingTour hook (v1.10.713)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-onboarding-tour.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'OnboardingTour.tsx');

  it('exports the hook + accepts forceOpen/onClose/steps', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useOnboardingTour/);
    assert.match(src, /forceOpen:\s*boolean\s*\|\s*undefined/);
    assert.match(src, /onClose:\s*\(\(\)\s*=>\s*void\)\s*\|\s*undefined/);
    assert.match(src, /steps:\s*readonly Step\[\]/);
  });

  it('hook owns shouldAutoOpen + markSeen + the TOUR_EVENT_START listener', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /function shouldAutoOpen/);
    assert.match(src, /function markSeen/);
    assert.match(src, /addEventListener\(TOUR_EVENT_START/);
    assert.match(src, /removeEventListener\(TOUR_EVENT_START/);
  });

  it('Escape-key listener only mounts while the tour is open', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!open\) return/);
    assert.match(src, /e\.key === 'Escape'/);
    assert.match(src, /addEventListener\('keydown'/);
    assert.match(src, /removeEventListener\('keydown'/);
  });

  it('parent OnboardingTour wires the hook + drops the inline state machine', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useOnboardingTour\s*\}\s+from\s+'\.\.\/lib\/use-onboarding-tour'/);
    assert.match(src, /useOnboardingTour\(\{[\s\S]*?forceOpen,\s*onClose,\s*steps:\s*STEPS[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[open, setOpen\]/);
    assert.doesNotMatch(src, /const \[index, setIndex\]/);
    assert.doesNotMatch(src, /function shouldAutoOpen/);
    assert.doesNotMatch(src, /function markSeen/);
  });
});

describe('extracted: useHelpOverlayTriggers hook (v1.10.712)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-help-overlay-triggers.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HelpUIRoot.tsx');

  it('exports the hook + accepts onOpenDrawer/onOpenShortcuts', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useHelpOverlayTriggers/);
    assert.match(src, /onOpenDrawer:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onOpenShortcuts:\s*\(\)\s*=>\s*void/);
  });

  it('subscribes to both custom events from HelpUIRoot', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /HELP_EVENT_OPEN_DRAWER/);
    assert.match(src, /HELP_EVENT_OPEN_SHORTCUTS/);
    assert.match(src, /addEventListener\(HELP_EVENT_OPEN_DRAWER/);
    assert.match(src, /addEventListener\(HELP_EVENT_OPEN_SHORTCUTS/);
    assert.match(src, /removeEventListener\(HELP_EVENT_OPEN_DRAWER/);
    assert.match(src, /removeEventListener\(HELP_EVENT_OPEN_SHORTCUTS/);
  });

  it('hotkey path skips inputs/textarea/contenteditable + handles ?, /, h', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /tag === 'INPUT'/);
    assert.match(src, /tag === 'TEXTAREA'/);
    assert.match(src, /isContentEditable/);
    assert.match(src, /role.*===.*'textbox'|role="textbox"|getAttribute\('role'\)/);
    assert.match(src, /e\.key === '\?'/);
    assert.match(src, /e\.key === 'h'/);
    assert.match(src, /e\.key === 'H'/);
  });

  it('parent HelpUIRoot wires the hook + drops the inline effects', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useHelpOverlayTriggers\s*\}\s+from\s+'\.\.\/lib\/use-help-overlay-triggers'/);
    assert.match(src, /useHelpOverlayTriggers\(\{[\s\S]*?onOpenDrawer:\s*openDrawer,\s*onOpenShortcuts:\s*openShortcuts[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /addEventListener\(HELP_EVENT_OPEN_DRAWER/);
    assert.doesNotMatch(src, /addEventListener\('keydown'/);
  });
});

describe('extracted: useFeatureIdFromHash hook (v1.10.711)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-feature-id-from-hash.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HelpUIRoot.tsx');

  it('exports the hook + reads window.location.hash with the #/feature/ prefix', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useFeatureIdFromHash/);
    assert.match(src, /'#\/feature\/'/);
    assert.match(src, /window\.location\.hash/);
  });

  it('subscribes to hashchange + returns null on the server', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /addEventListener\('hashchange'/);
    assert.match(src, /removeEventListener\('hashchange'/);
    assert.match(src, /typeof window === 'undefined'/);
  });

  it('parent HelpUIRoot wires the hook + drops the inline state + parser', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useFeatureIdFromHash\s*\}\s+from\s+'\.\.\/lib\/use-feature-id-from-hash'/);
    assert.match(src, /const activeFeatureId = useFeatureIdFromHash\(\)/);
    assert.doesNotMatch(src, /function readActiveFeatureId/);
    assert.doesNotMatch(src, /const HASH_PREFIX/);
  });
});

describe('extracted: useControlPanelSingle hook (v1.10.710)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-control-panel-single.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ControlPanel.tsx');

  it('exports the hook + accepts workerName/showToast/fetchList', () => {
    // (v1.10.740) postAction lifted to lib/post-action so it's no longer a prop.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useControlPanelSingle/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /import\s+\{\s*postAction\s*\}\s+from\s+'\.\/post-action'/);
  });

  it('runSingle confirms via window.confirm + busy-marks the action kind', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(action\.confirm && !window\.confirm\(action\.confirm\)\) return/);
    assert.match(src, /setBusyKind\(action\.kind\)/);
  });

  it('emits success/error toast routed by postAction result', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /controlPanel\.action\.failed/);
    assert.match(src, /controlPanel\.action\.failedUnknown/);
  });

  it('parent ControlPanel wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useControlPanelSingle\s*\}\s+from\s+'\.\.\/lib\/use-control-panel-single'/);
    // (v1.10.740) postAction prop dropped now that the hook imports it directly.
    assert.match(src, /useControlPanelSingle\(\{[\s\S]*?workerName,\s*showToast,\s*fetchList[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[busyKind, setBusyKind\]/);
    assert.doesNotMatch(src, /const runSingle = useCallback/);
  });
});

describe('extracted: useNavBadgeCounts hook (v1.10.709)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-nav-badge-counts.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'layout', 'AppHeader.tsx');

  it('exports the hook + accepts authed flag', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useNavBadgeCounts/);
    assert.match(src, /authed:\s*boolean/);
  });

  it('polls three signals every 60s with cancellation guard', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/meetings\/stuck\?hours=1/);
    assert.match(src, /\/api\/specialists\/underperformers/);
    assert.match(src, /\/api\/autonomous\/escalations/);
    assert.match(src, /window\.setInterval\(fetchSignals,\s*60000\)/);
    assert.match(src, /let cancelled = false/);
  });

  it('gates escalations fetch on /autonomous/status enabled flag', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/autonomous\/status/);
    assert.match(src, /if \(autonomousEnabled === true\)/);
    assert.match(src, /skip escalations entirely/);
  });

  it('parent AppHeader wires the hook + drops the inline state + effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useNavBadgeCounts\s*\}\s+from\s+'\.\.\/\.\.\/lib\/use-nav-badge-counts'/);
    assert.match(src, /useNavBadgeCounts\(\{\s*authed\s*\}\)/);
    assert.doesNotMatch(src, /const \[stuckCount, setStuckCount\]/);
  });
});

describe('shared: useToast adopted by WorkerActions + ControlPanel (v1.10.708)', () => {
  const fs = require('fs');
  const path = require('path');
  const WORKER_ACTIONS = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkerActions.tsx');
  const CONTROL_PANEL = path.join(__dirname, '..', 'web', 'src', 'components', 'ControlPanel.tsx');

  it('WorkerActions imports useToast + drops the inline ToastState + showToast', () => {
    const src = fs.readFileSync(WORKER_ACTIONS, 'utf8');
    assert.match(src, /import\s+\{\s*useToast\s*\}\s+from\s+'\.\.\/lib\/use-toast'/);
    assert.match(src, /useToast\(\)/);
    assert.doesNotMatch(src, /^interface ToastState/m);
    assert.doesNotMatch(src, /const showToast = useCallback/);
  });

  it('ControlPanel imports useToast + drops the inline ToastState + showToast', () => {
    const src = fs.readFileSync(CONTROL_PANEL, 'utf8');
    assert.match(src, /import\s+\{\s*useToast\s*\}\s+from\s+'\.\.\/lib\/use-toast'/);
    assert.match(src, /useToast\(\)/);
    assert.doesNotMatch(src, /^interface ToastState/m);
    assert.doesNotMatch(src, /const showToast = useCallback/);
  });
});

describe('extracted: usePinnedRules hook (v1.10.707)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-pinned-rules.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'PinnedRulesEditor.tsx');

  it('exports the hook + accepts workerName', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePinnedRules/);
    assert.match(src, /workerName:\s*string/);
  });

  it('GETs /api/workers/:name/pinned-memory + auto-loads on mount', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/workers\/\$\{encodeURIComponent\(workerName\)\}\/pinned-memory/);
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?load\(\);[\s\S]*?\}, \[load\]\)/);
  });

  it('joins rules with --- separator + splits on save with the same regex', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /rules\.join\('\\n\\n---\\n\\n'\)/);
    assert.match(src, /rulesText[\s\S]*?\.split\(\/\\n\\s\*---\\s\*\\n\/\)/);
  });

  it('save POSTs userRules + defaultTemplate + refresh flag', () => {
    // (v1.10.753) Inline POST builder replaced with apiPost.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<\{ lastRefreshAt: number \| null \}>/);
    assert.match(src, /userRules,\s*\n\s*defaultTemplate:\s*defaultTemplate\s*\|\|\s*null,\s*\n\s*refresh:\s*options\.refresh/);
  });

  it('parent PinnedRulesEditor wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePinnedRules\s*\}\s+from\s+'\.\.\/lib\/use-pinned-rules'/);
    assert.match(src, /usePinnedRules\(\{\s*workerName\s*\}\)/);
    assert.doesNotMatch(src, /const \[rulesText, setRulesText\]/);
    assert.doesNotMatch(src, /const load = useCallback/);
    assert.doesNotMatch(src, /const save = useCallback/);
  });
});

describe('extracted: useSpecialistTagEditor hook (v1.10.706)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialist-tag-editor.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsTagEditor.tsx');

  it('exports the hook + accepts specialistId/onSaved/onError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistTagEditor/);
    assert.match(src, /specialistId:\s*string/);
    assert.match(src, /onSaved:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onError:\s*\(msg:\s*string\)\s*=>\s*void/);
  });

  it('decodes mode prefix (+ adds / - removes / otherwise replaces)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /raw\.startsWith\('\+'\)\) \{ mode = 'add'/);
    assert.match(src, /raw\.startsWith\('-'\)\) \{ mode = 'remove'/);
  });

  it('guards empty-replace so accidental clears need an explicit path', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(next\.length === 0 && mode === 'replace'\) return/);
  });

  it('PATCHes /api/specialists/:id/tags with mode/tags body', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPatch\(`\/api\/specialists\/\$\{encodeURIComponent\(specialistId\)\}\/tags`,\s*\{ tags: next, mode \}\)/);
  });

  it('parent SpecialistsTagEditor wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistTagEditor\s*\}\s+from\s+'\.\.\/lib\/use-specialist-tag-editor'/);
    assert.match(src, /useSpecialistTagEditor\(\{\s*specialistId,\s*onSaved,\s*onError\s*\}\)/);
    assert.doesNotMatch(src, /const \[open, setOpen\]/);
    assert.doesNotMatch(src, /const handleSave = useCallback/);
  });

  it('exposes a combined toggleWithTags callback (v1.10.760)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    // The combined open-toggle + tag-prefill is owned by the hook so
    // the JSX edit/cancel button passes a single tag-aware callback.
    assert.match(src, /toggleWithTags:\s*\(tags:\s*string\[\] \| undefined\)\s*=>\s*void/);
    assert.match(src, /setOpen\(\(prev\) => !prev\)/);
    assert.match(src, /setValue\(Array\.isArray\(tags\) \? tags\.join\(', '\) : ''\)/);
    const parent = fs.readFileSync(PARENT, 'utf8');
    assert.match(parent, /toggleWithTags\(tags\)/);
    // Inline two-call combo dropped.
    assert.doesNotMatch(parent, /setOpen\(\(v\) => !v\)/);
  });
});

describe('extracted: useWorkerActions hook (v1.10.705)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-worker-actions.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkerDetail.tsx');

  it('exports the hook + accepts workerName + fetchScrollback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkerActions/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /fetchScrollback:\s*\(\)\s*=>\s*void/);
  });

  it('runAction returns true on success + false on error', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /Promise<boolean>/);
    assert.match(src, /return false/);
    assert.match(src, /return true/);
    assert.match(src, /fetchScrollback\(\)/);
  });

  it('handlers POST to /api/{send,key,merge,close}', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /'\/api\/send'/);
    assert.match(src, /'\/api\/key'/);
    assert.match(src, /'\/api\/merge'/);
    assert.match(src, /'\/api\/close'/);
  });

  it('handleMerge confirms via window.confirm', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm/);
  });

  it('parent WorkerDetail wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkerActions\s*\}\s+from\s+'\.\.\/lib\/use-worker-actions'/);
    assert.match(src, /useWorkerActions\(\{[\s\S]*?workerName,\s*fetchScrollback[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /^interface ActionResponse/m);
    assert.doesNotMatch(src, /^async function postJson/m);
    assert.doesNotMatch(src, /const runAction = async/);
  });
});

describe('extracted: useMeetingStateAction hook (v1.10.704)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-state-action.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsStateActions.tsx');

  it('exports the hook + MeetingAction union', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingStateAction/);
    assert.match(src, /export type MeetingAction/);
    assert.match(src, /'start'/);
    assert.match(src, /'advance'/);
    assert.match(src, /'next-round'/);
    assert.match(src, /'escalate'/);
    assert.match(src, /'abort'/);
  });

  it('fire confirms via window.confirm + POSTs /api/meetings/:id/<action>', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(confirm && !window\.confirm\(confirm\)\) return/);
    assert.match(src, /apiPost\(`\/api\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/\$\{action\}`,\s*\{\}\)/);
  });

  it('busy slot tracks the in-flight action', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<MeetingAction\s*\|\s*null>\(null\)/);
    assert.match(src, /setBusy\(action\)/);
  });

  it('parent MeetingsStateActions wires the hook + drops the inline state + fire', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingStateAction\s*\}\s+from\s+'\.\.\/lib\/use-meeting-state-action'/);
    assert.match(src, /useMeetingStateAction\(\{\s*meetingId\s*\}\)/);
    assert.doesNotMatch(src, /^type Action = /m);
    assert.doesNotMatch(src, /const \[busy, setBusy\]/);
    assert.doesNotMatch(src, /const fire = useCallback/);
  });
});

describe('extracted: useMeetingPublish hook (v1.10.703)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-publish.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsPublishControls.tsx');

  it('exports the hook + accepts meetingId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingPublish/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('POSTs /api/meetings/:id/publish with includeRetro+apply+git toggles', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<PublishResponse>\([\s\S]*?\/publish`/);
    assert.match(src, /includeRetro:\s*true/);
    assert.match(src, /apply:\s*true/);
    assert.match(src, /gitCommit,\s*\n\s*gitPush/);
  });

  it('formats banner with file count + git SHA + push suffix; auto-clears after 4s', () => {
    // (v1.10.765) Banner state delegated to useAutoClearMessage —
    // the 4s default duration applies because no override is passed.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /res\.git\.sha\s*\?\s*res\.git\.sha\.slice\(0,\s*7\)/);
    assert.match(src, /useAutoClearMessage/);
    assert.match(src, /setSuccess\(m\)/);
  });

  it('parent MeetingsPublishControls wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingPublish\s*\}\s+from\s+'\.\.\/lib\/use-meeting-publish'/);
    assert.match(src, /useMeetingPublish\(\{\s*meetingId\s*\}\)/);
    assert.doesNotMatch(src, /^interface PublishResponse/m);
    assert.doesNotMatch(src, /const \[busy, setBusy\]/);
    assert.doesNotMatch(src, /const handlePublish = useCallback/);
  });
});

describe('extracted: useMeetingFork hook (v1.10.702)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-fork.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsForkForm.tsx');

  it('exports the hook + accepts meetingId/onForked/onClose', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingFork/);
    assert.match(src, /meetingId:\s*string/);
    assert.match(src, /onForked:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('owns the four form fields + busy/error', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<'replan'\s*\|\s*'reuse'>/);
    assert.match(src, /useState<'auto'\s*\|\s*'lightweight'\s*\|\s*'standard'\s*\|\s*'full'>/);
  });

  it('handleSubmit POSTs /api/meetings/:id/fork + forwards track only when replan + non-auto', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<ForkResponse>\([\s\S]*?\/fork`/);
    assert.match(src, /if \(mode === 'replan' && track !== 'auto'\) body\.track = track/);
  });

  it('resets the form on meetingId change', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?setMode\('replan'\)[\s\S]*?\}, \[meetingId\]\)/);
  });

  it('parent MeetingsForkForm wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingFork\s*\}\s+from\s+'\.\.\/lib\/use-meeting-fork'/);
    assert.match(src, /useMeetingFork\(\{\s*meetingId:\s*meeting\.id,\s*onForked,\s*onClose\s*\}\)/);
    assert.doesNotMatch(src, /^interface ForkResponse/m);
    assert.doesNotMatch(src, /const \[mode, setMode\]/);
    assert.doesNotMatch(src, /const handleSubmit = useCallback/);
  });
});

describe('extracted: useMeetingContribute hook (v1.10.701)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-contribute.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsContributePanel.tsx');

  it('exports the hook + accepts meetingId', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingContribute/);
    assert.match(src, /meetingId:\s*string/);
  });

  it('owns four form fields + busy/msg/failed banner', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /const \[specialist, setSpecialist\]/);
    assert.match(src, /const \[text, setText\]/);
    assert.match(src, /const \[vote, setVote\] = useState<''\s*\|\s*'accept'\s*\|\s*'object'>/);
    assert.match(src, /const \[reason, setReason\]/);
  });

  it('handleContribute POSTs /api/meetings/:id/contribute + handleVoteOnly POSTs /vote', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost\(`\/api\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/contribute`/);
    assert.match(src, /apiPost\(`\/api\/meetings\/\$\{encodeURIComponent\(meetingId\)\}\/vote`/);
  });

  it('resets entire form on meetingId change', () => {
    // (v1.10.765) Banner-state reset delegated to useAutoClearMessage's
    // `reset` callback so the dep list grew to `[meetingId, reset]`.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?setSpecialist\(''\)[\s\S]*?setText\(''\)[\s\S]*?\}, \[meetingId,\s*reset\]\)/);
  });

  it('parent MeetingsContributePanel wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingContribute\s*\}\s+from\s+'\.\.\/lib\/use-meeting-contribute'/);
    assert.match(src, /useMeetingContribute\(\{\s*meetingId\s*\}\)/);
    assert.doesNotMatch(src, /const \[specialist, setSpecialist\]/);
    assert.doesNotMatch(src, /const handleContribute = useCallback/);
    assert.doesNotMatch(src, /const handleVoteOnly = useCallback/);
  });
});

describe('extracted: useMeetingTemplateEditor hook (v1.10.700)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-template-editor.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsTemplateEditor.tsx');

  it('exports the hook + accepts open/tpl/onSaved/onDeleted', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingTemplateEditor/);
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /tpl:\s*TemplateLike\s*\|\s*null/);
    assert.match(src, /onSaved:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onDeleted:\s*\(deletedName:\s*string\)\s*=>\s*void/);
  });

  it('re-seeds form when open flips true', () => {
    // (v1.10.766) Banner-state reset delegated to useAutoClearMessage's
    // `reset` callback so the dep list grew to `[open, tpl, reset]`.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?if \(!open\) return;[\s\S]*?\}, \[open, tpl,\s*reset\]\)/);
  });

  it('handleSave POSTs /api/meetings/templates + delete-old branch on rename', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost\('\/api\/meetings\/templates',\s*body\)/);
    assert.match(src, /if \(mode === 'edit' && originalName && originalName !== trimmedName\)/);
    assert.match(src, /apiDelete\(`\/api\/meetings\/templates\/\$\{encodeURIComponent\(originalName\)\}`\)/);
  });

  it('handleDelete confirms via window.confirm + DELETEs /templates/:name', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(tFormat\('meetings\.confirmTplDelete'/);
    assert.match(src, /onDeleted\(originalName\)/);
  });

  it('parent MeetingsTemplateEditor wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingTemplateEditor\s*\}\s+from\s+'\.\.\/lib\/use-meeting-template-editor'/);
    assert.match(src, /useMeetingTemplateEditor\(\{[\s\S]*?open,\s*tpl,\s*onSaved,\s*onDeleted[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[name, setName\]/);
    assert.doesNotMatch(src, /const handleSave = useCallback/);
    assert.doesNotMatch(src, /const handleDelete = useCallback/);
  });
});

describe('extracted: usePromptRevision hook (v1.10.699)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-prompt-revision.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsPromptPanel.tsx');

  it('exports the hook + ApplyResult + SuggestResponse types', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePromptRevision/);
    assert.match(src, /export interface ApplyResult/);
    assert.match(src, /export interface SuggestResponse/);
  });

  it('handleSuggest POSTs /suggest-prompt + handleApply POSTs /prompt-apply behind confirm', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<SuggestResponse>\([\s\S]*?\/suggest-prompt`/);
    assert.match(src, /window\.confirm\(t\('specialists\.applyConfirm'\)\)/);
    assert.match(src, /apiPost<ApplyResult>\([\s\S]*?\/prompt-apply`/);
    assert.match(src, /autoApply:\s*true/);
  });

  it('resets both result panels on specialistId change', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?setSuggestion\(null\)[\s\S]*?setApplyResult\(null\)[\s\S]*?\}, \[specialistId\]\)/);
  });

  it('parent SpecialistsPromptPanel wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePromptRevision\s*\}\s+from\s+'\.\.\/lib\/use-prompt-revision'/);
    assert.match(src, /usePromptRevision\(\{\s*specialistId\s*\}\)/);
    assert.doesNotMatch(src, /^interface ApplyResult/m);
    assert.doesNotMatch(src, /^interface SuggestResponse/m);
    assert.doesNotMatch(src, /const \[suggestion, setSuggestion\]/);
    assert.doesNotMatch(src, /const handleApply = useCallback/);
  });
});

describe('extracted: useSpecialistsAddPropose hook (v1.10.698)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-add-propose.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsAddPanel.tsx');

  it('exports the hook + accepts onAdded', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistsAddPropose/);
    assert.match(src, /onAdded:\s*\(newId:\s*string\)\s*=>\s*void/);
  });

  it('handleAdd POSTs /api/specialists with parsed JSON', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /JSON\.parse\(json\)/);
    assert.match(src, /apiPost<\{ ok: boolean; specialist: Specialist \}>\('\/api\/specialists',\s*parsed\)/);
    assert.match(src, /onAdded\(res\.specialist\.id\)/);
  });

  it('handlePropose POSTs /api/specialists/propose + routes accepted/rejected branches', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<ProposeResponse>\(\s*'\/api\/specialists\/propose'/);
    assert.match(src, /if \(res\.added\)/);
    assert.match(src, /specialists\.propose\.accepted/);
    assert.match(src, /specialists\.propose\.rejected/);
    assert.match(src, /setProposeRejected\(true\)/);
  });

  it('parent SpecialistsAddPanel wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistsAddPropose\s*\}\s+from\s+'\.\.\/lib\/use-specialists-add-propose'/);
    assert.match(src, /useSpecialistsAddPropose\(\{\s*onAdded\s*\}\)/);
    assert.doesNotMatch(src, /^interface ProposeDecision/m);
    assert.doesNotMatch(src, /^interface ProposeResponse/m);
    assert.doesNotMatch(src, /const \[json, setJson\]/);
    assert.doesNotMatch(src, /const handleAdd = useCallback/);
    assert.doesNotMatch(src, /const handlePropose = useCallback/);
  });
});

describe('extracted: hierarchy-tree lib (v1.10.697)', () => {
  const fs = require('fs');
  const path = require('path');
  const LIB = path.join(__dirname, '..', 'web', 'src', 'lib', 'hierarchy-tree.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HierarchyTree.tsx');

  it('exports buildTree + computeRollup + zeroRollup + Rollup + TreeNode', () => {
    const src = fs.readFileSync(LIB, 'utf8');
    assert.match(src, /export function buildTree/);
    assert.match(src, /export function computeRollup/);
    assert.match(src, /export function zeroRollup/);
    assert.match(src, /export interface Rollup/);
    assert.match(src, /export interface TreeNode/);
  });

  it('cycle-guards parent edges by walking the chain upward', () => {
    const src = fs.readFileSync(LIB, 'utf8');
    assert.match(src, /Cycle guard/);
    assert.match(src, /seen\.has\(cursor\.worker\.name\)/);
    assert.match(src, /if \(cycles\) roots\.push\(node\)/);
  });

  it('rollup sums total/idle/busy/exited/intervention/error from descendants', () => {
    const src = fs.readFileSync(LIB, 'utf8');
    assert.match(src, /r\.idle\s*\+=\s*sub\.idle/);
    assert.match(src, /r\.busy\s*\+=\s*sub\.busy/);
    assert.match(src, /r\.exited\s*\+=\s*sub\.exited/);
    assert.match(src, /r\.intervention\s*\+=\s*sub\.intervention/);
    assert.match(src, /r\.error\s*\+=\s*sub\.error/);
  });

  it('parent HierarchyTree imports the lib + drops the inline helpers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*buildTree,\s*type\s+TreeNode\s*\}\s+from\s+'\.\.\/lib\/hierarchy-tree'/);
    assert.doesNotMatch(src, /^function buildTree/m);
    assert.doesNotMatch(src, /^function computeRollup/m);
    assert.doesNotMatch(src, /^interface Rollup/m);
    assert.doesNotMatch(src, /^interface TreeNode/m);
  });
});

describe('shared: useAutoScroll consumed by ConversationView (v1.10.696)', () => {
  const fs = require('fs');
  const path = require('path');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ConversationView.tsx');

  it('imports useAutoScroll from the shared lib', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAutoScroll\s*\}\s+from\s+'\.\.\/lib\/use-auto-scroll'/);
    assert.match(src, /useAutoScroll\(\{[\s\S]*?scrollRef,\s*bumpKey:\s*conversation\?\.turns\.length\s*\?\?\s*0/);
  });

  it('parent no longer redeclares the inline auto-scroll machinery', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.doesNotMatch(src, /^const AUTOSCROLL_THRESHOLD_PX/m);
    assert.doesNotMatch(src, /useLayoutEffect\(\(\) => \{[\s\S]*?if \(!autoScroll\)/);
    assert.doesNotMatch(src, /const \[autoScroll, setAutoScroll\]/);
  });
});

describe('extracted: useTokenUsageBreakdowns hook (v1.10.695)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-token-usage-breakdowns.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'TokenUsage.tsx');

  it('exports the hook + coerceTotal + entry types', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useTokenUsageBreakdowns/);
    assert.match(src, /export function coerceTotal/);
    assert.match(src, /export interface PerWorkerEntry/);
    assert.match(src, /export interface PerDayEntry/);
  });

  it('coerceTotal handles number/object/null variants', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /typeof v === 'number'\)\s*return v/);
    assert.match(src, /typeof obj\.total === 'number'\)\s*return obj\.total/);
    assert.match(src, /\(obj\.input\s*\|\|\s*0\)\s*\+\s*\(obj\.output\s*\|\|\s*0\)/);
  });

  it('perWorker sorts descending, perDay filters by date range', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /entries\.sort\(\(a, b\) => b\.total - a\.total\)/);
    assert.match(src, /date >= rangeStart && date <= rangeEnd/);
  });

  it('parent TokenUsage adopts the hook + drops the inline coerceTotal + memos', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useTokenUsageBreakdowns,\s*coerceTotal\s*\}\s+from\s+'\.\.\/lib\/use-token-usage-breakdowns'/);
    assert.match(src, /useTokenUsageBreakdowns\(\{[\s\S]*?data[\s\S]*?rangeStart:\s*range\.start[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /^function coerceTotal/m);
    assert.doesNotMatch(src, /const perWorker = useMemo/);
    assert.doesNotMatch(src, /const perDay = useMemo/);
  });
});

describe('extracted: useToast hook (v1.10.694)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-toast.ts');
  const BATCH = path.join(__dirname, '..', 'web', 'src', 'pages', 'Batch.tsx');
  const PLAN = path.join(__dirname, '..', 'web', 'src', 'pages', 'Plan.tsx');

  it('exports the hook + ToastState type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useToast\(\)/);
    assert.match(src, /export interface ToastState/);
    assert.match(src, /id:\s*number/);
    assert.match(src, /message:\s*string/);
  });

  it('showToast stamps a fresh id from Date.now', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setToast\(\{ id: Date\.now\(\),\s*message,\s*type \}\)/);
  });

  it('dismissToast clears the slot', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /const dismissToast = useCallback\(\(\) => setToast\(null\)/);
  });

  it('Batch + Plan adopt the hook + drop the inline state + helpers', () => {
    const batch = fs.readFileSync(BATCH, 'utf8');
    const plan = fs.readFileSync(PLAN, 'utf8');
    assert.match(batch, /import\s+\{\s*useToast\s*\}\s+from\s+'\.\.\/lib\/use-toast'/);
    assert.match(plan, /import\s+\{\s*useToast\s*\}\s+from\s+'\.\.\/lib\/use-toast'/);
    assert.match(batch, /useToast\(\)/);
    assert.match(plan, /useToast\(\)/);
    assert.doesNotMatch(batch, /^interface ToastState/m);
    assert.doesNotMatch(plan, /^interface ToastState/m);
  });
});

describe('extracted: usePlanWorkers hook (v1.10.693)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-plan-workers.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Plan.tsx');

  it('exports the hook + accepts selected/setSelected/setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePlanWorkers/);
    assert.match(src, /selected:\s*string/);
    assert.match(src, /setSelected:\s*\(name:\s*string\)\s*=>\s*void/);
  });

  it('GETs /api/list and auto-selects first worker when none selected', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ListResponse>\('\/api\/list'\)/);
    assert.match(src, /if \(!selected && first\) setSelected\(first\.name\)/);
  });

  it('parent Plan wires the hook + drops the inline state + fetcher', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePlanWorkers\s*\}\s+from\s+'\.\.\/lib\/use-plan-workers'/);
    assert.match(src, /usePlanWorkers\(\{\s*selected,\s*setSelected,\s*setError\s*\}\)/);
    assert.doesNotMatch(src, /const \[workers, setWorkers\]/);
    assert.doesNotMatch(src, /const loadWorkers = useCallback/);
  });
});

describe('extracted: useScrollIntoViewOnOpen hook (v1.10.692)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-scroll-into-view-on-open.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HelpDrawer.tsx');

  it('exports the hook + accepts open/ref/optional key', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useScrollIntoViewOnOpen/);
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /ref:\s*RefObject<HTMLElement\s*\|\s*null>/);
    assert.match(src, /key\?:\s*unknown/);
  });

  it('schedules scrollIntoView on the next animation frame', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.requestAnimationFrame/);
    assert.match(src, /scrollIntoView\(\{[\s\S]*?behavior:\s*'auto',\s*block:\s*'start'/);
  });

  it('cancels the animation frame on cleanup', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.cancelAnimationFrame\(frame\)/);
  });

  it('parent HelpDrawer wires the hook + drops the inline effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useScrollIntoViewOnOpen\s*\}\s+from\s+'\.\.\/lib\/use-scroll-into-view-on-open'/);
    assert.match(src, /useScrollIntoViewOnOpen\(\{[\s\S]*?ref:\s*activeCardRef,\s*key:\s*activeFeatureId[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /activeCardRef\.current\?\.scrollIntoView/);
  });
});

describe('extracted: useDrawerKeyboard hook (v1.10.691)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-drawer-keyboard.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HelpDrawer.tsx');

  it('exports the hook + accepts open/onClose/focusRef', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useDrawerKeyboard/);
    assert.match(src, /open:\s*boolean/);
    assert.match(src, /onClose:\s*\(\)\s*=>\s*void/);
    assert.match(src, /focusRef:\s*RefObject<HTMLElement\s*\|\s*HTMLInputElement\s*\|\s*null>/);
  });

  it('attaches Escape-to-close and raf-delayed focus on open', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /e\.key === 'Escape'/);
    assert.match(src, /window\.addEventListener\('keydown',\s*onKey\)/);
    assert.match(src, /window\.requestAnimationFrame\(\(\) => focusRef\.current\?\.focus\(\)\)/);
  });

  it('cleans up the listener + cancels the raf on unmount', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.removeEventListener\('keydown',\s*onKey\)/);
    assert.match(src, /window\.cancelAnimationFrame\(raf\)/);
  });

  it('parent HelpDrawer wires the hook + drops the inline keydown effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useDrawerKeyboard\s*\}\s+from\s+'\.\.\/lib\/use-drawer-keyboard'/);
    assert.match(src, /useDrawerKeyboard\(\{\s*open,\s*onClose,\s*focusRef:\s*inputRef\s*\}\)/);
    assert.doesNotMatch(src, /window\.requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/);
  });
});

describe('extracted: usePersistedBool hook (v1.10.690)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-persisted-bool.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkerList.tsx');

  it('exports the hook + accepts key + fallback', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePersistedBool\(\s*key:\s*string,\s*fallback:\s*boolean,?\s*\):/);
  });

  it('reads + writes the existing 1/0 storage encoding', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /raw === '1'\)\s*return true/);
    assert.match(src, /raw === '0'\)\s*return false/);
    assert.match(src, /value\s*\?\s*'1'\s*:\s*'0'/);
  });

  it('falls back to the default on SSR + localStorage exception', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /typeof window === 'undefined'/);
    assert.match(src, /catch \{\s*return fallback;\s*\}/);
    assert.match(src, /catch \{\s*\/\* private mode/);
  });

  it('parent WorkerList adopts the hook + drops the inline helpers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePersistedBool\s*\}\s+from\s+'\.\.\/lib\/use-persisted-bool'/);
    assert.match(src, /usePersistedBool\(MGR_OPEN_KEY,\s*true\)/);
    assert.match(src, /usePersistedBool\(WRK_OPEN_KEY,\s*true\)/);
    assert.doesNotMatch(src, /^function readBoolPref/m);
    assert.doesNotMatch(src, /^function writeBoolPref/m);
  });
});

describe('extracted: useEffectiveCollapsed hook (v1.10.689)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-effective-collapsed.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'layout', 'Sidebar.tsx');

  it('exports the hook + accepts collapsed flag', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useEffectiveCollapsed\(collapsed:\s*boolean\):\s*boolean/);
  });

  it('subscribes to (min-width: 768px) media query', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.matchMedia\('\(min-width: 768px\)'\)/);
    assert.match(src, /mq\.addEventListener\('change',\s*onChange\)/);
    assert.match(src, /mq\.removeEventListener\('change',\s*onChange\)/);
  });

  it('returns collapsed && isDesktop so mobile widths force expanded', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /return collapsed && isDesktop/);
  });

  it('parent Sidebar imports the hook + drops the inline declaration', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useEffectiveCollapsed\s*\}\s+from\s+'\.\.\/\.\.\/lib\/use-effective-collapsed'/);
    assert.doesNotMatch(src, /^function useEffectiveCollapsed/m);
  });
});

describe('extracted: useAuthIdentity hook (v1.10.688)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-auth-identity.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'AccountMenu.tsx');

  it('exports the hook with no-arg signature', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAuthIdentity\(\)/);
  });

  it('uses lazy initializers to avoid touching localStorage every render', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<string \| null>\(\(\) => getAuthUser\(\)\)/);
    assert.match(src, /useState<string \| null>\(\(\) => getAuthRole\(\)\)/);
  });

  it('subscribes to AUTH_EVENT + filtered cross-tab storage events', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.addEventListener\(AUTH_EVENT,\s*refresh\)/);
    assert.match(src, /window\.addEventListener\('storage',\s*onStorage\)/);
    assert.match(src, /AUTH_STORAGE_KEYS\.has\(e\.key\)/);
    assert.match(src, /'c4\.authToken'[\s\S]*?'c4\.authUser'[\s\S]*?'c4\.authRole'/);
  });

  it('parent AccountMenu wires the hook + drops the inline state + listeners', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAuthIdentity\s*\}\s+from\s+'\.\.\/lib\/use-auth-identity'/);
    assert.match(src, /useAuthIdentity\(\)/);
    assert.doesNotMatch(src, /^const AUTH_STORAGE_KEYS/m);
    assert.doesNotMatch(src, /const \[user, setUser\]/);
    assert.doesNotMatch(src, /const \[role, setRole\]/);
  });
});

describe('extracted: useAuditRotate hook (v1.10.687)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-audit-rotate.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsBulkOpsToolbar.tsx');

  it('exports the hook with no-arg signature', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAuditRotate\(\)/);
  });

  it('confirm-gates POST /api/specialists/audit-rotate with maxBytes:0', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(t\('specialists\.confirmAuditRotate'\)\)/);
    assert.match(src, /apiPost<[\s\S]*?>\('\/api\/specialists\/audit-rotate',\s*\{ maxBytes: 0 \}\)/);
  });

  it('routes rotated/skipped/failure into the banner with 4s auto-clear', () => {
    // (v1.10.764) Banner state moved to the shared infra hook
    // useAutoClearMessage; this hook delegates via setSuccess /
    // setFailure / reset.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(res\.rotated\)/);
    assert.match(src, /specialists\.rotate\.success/);
    assert.match(src, /specialists\.rotate\.skipped/);
    assert.match(src, /specialists\.rotate\.failed/);
    assert.match(src, /useAutoClearMessage/);
    assert.match(src, /setSuccess\(/);
    assert.match(src, /setFailure\(/);
  });

  it('parent SpecialistsBulkOpsToolbar wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAuditRotate\s*\}\s+from\s+'\.\.\/lib\/use-audit-rotate'/);
    assert.match(src, /useAuditRotate\(\)/);
    assert.doesNotMatch(src, /const \[rotateBusy, setRotateBusy\]/);
    assert.doesNotMatch(src, /const handleAuditRotate = useCallback/);
  });
});

describe('extracted: useSpecialistsImport hook (v1.10.686)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-import.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsBulkOpsToolbar.tsx');

  it('exports the hook + ImportResult type + accepts importMode/onChange', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistsImport/);
    assert.match(src, /export interface ImportResult/);
    assert.match(src, /importMode:\s*'merge'\s*\|\s*'replace'/);
    assert.match(src, /onChange:\s*\(\)\s*=>\s*void/);
  });

  it('handleImportFile parses local JSON and POSTs with dryRun:true', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /JSON\.parse\(text\)/);
    assert.match(src, /apiPost<ImportResult>\('\/api\/specialists\/import',\s*\{[\s\S]*?dryRun:\s*true/);
  });

  it('handleImportApply confirms via window.confirm and POSTs with dryRun:false', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(tFormat\('specialists\.import\.applyConfirm'/);
    assert.match(src, /dryRun:\s*false/);
    assert.match(src, /void onChange\(\)/);
  });

  it('parent SpecialistsBulkOpsToolbar wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistsImport\s*\}\s+from\s+'\.\.\/lib\/use-specialists-import'/);
    assert.match(src, /useSpecialistsImport\(\{\s*importMode,\s*onChange\s*\}\)/);
    assert.doesNotMatch(src, /^interface ImportResult/m);
    assert.doesNotMatch(src, /const \[importBusy, setImportBusy\]/);
    assert.doesNotMatch(src, /const handleImportFile = useCallback/);
    assert.doesNotMatch(src, /const handleImportApply = useCallback/);
  });
});

describe('extracted: useSpecialistsExport hook (v1.10.685)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-export.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsBulkOpsToolbar.tsx');

  it('exports the hook with no-arg signature', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistsExport\(\)/);
  });

  it('GETs /api/specialists/export + downloads pretty-printed JSON', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<[\s\S]*?>\('\/api\/specialists\/export'\)/);
    assert.match(src, /JSON\.stringify\(bundle,\s*null,\s*2\)/);
    assert.match(src, /'application\/json'/);
    assert.match(src, /c4-specialists-export-/);
  });

  it('auto-clears the success banner after 4s + flips failed-tone on error', () => {
    // (v1.10.764) Banner state delegated to useAutoClearMessage.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useAutoClearMessage/);
    assert.match(src, /setSuccess\(/);
    assert.match(src, /setFailure\(/);
  });

  it('parent SpecialistsBulkOpsToolbar wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistsExport\s*\}\s+from\s+'\.\.\/lib\/use-specialists-export'/);
    assert.match(src, /useSpecialistsExport\(\)/);
    assert.doesNotMatch(src, /const \[exportBusy, setExportBusy\]/);
    assert.doesNotMatch(src, /const handleExport = useCallback/);
  });
});

describe('extracted: useAuditExport hook (v1.10.684)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-audit-export.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsAuditPanel.tsx');

  it('exports the hook + accepts auditWindow', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAuditExport/);
    assert.match(src, /auditWindow:\s*AuditWindow/);
  });

  it('GETs /api/audit/export with windowed `from` + crlf line ending', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/audit\/export\?\$\{params\.toString\(\)\}/);
    assert.match(src, /params\.set\('lineEnd',\s*'crlf'\)/);
    assert.match(src, /params\.set\('from'/);
  });

  it('downloads via createObjectURL + anchor click + revoke', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /URL\.createObjectURL\(blob\)/);
    assert.match(src, /a\.click\(\)/);
    assert.match(src, /URL\.revokeObjectURL\(objUrl\)/);
    assert.match(src, /c4-audit-\$\{auditWindow\}/);
  });

  it('parent SpecialistsAuditPanel wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAuditExport\s*\}\s+from\s+'\.\.\/lib\/use-audit-export'/);
    assert.match(src, /useAuditExport\(\{\s*auditWindow\s*\}\)/);
    assert.doesNotMatch(src, /const \[exportAuditBusy, setExportAuditBusy\]/);
    assert.doesNotMatch(src, /const handleAuditExport = useCallback/);
  });
});

describe('extracted: useAuditVerify hook (v1.10.683)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-audit-verify.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsAuditPanel.tsx');

  it('exports the hook + AuditVerifyResult type', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAuditVerify/);
    assert.match(src, /export interface AuditVerifyResult/);
    assert.match(src, /valid:\s*boolean/);
    assert.match(src, /corruptedAt:\s*number\s*\|\s*null/);
  });

  it('GETs /api/audit/verify with optional includeRotated query', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<AuditVerifyResult>\(`\/api\/audit\/verify\$\{qs\}`\)/);
    assert.match(src, /includeRotated\s*\?\s*'\?includeRotated=1'\s*:\s*''/);
  });

  it('falls back to a valid:false result on network failure', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /catch \{[\s\S]*?setVerifyResult\(\{ valid: false, corruptedAt: null, total: 0, rotatedTotal: 0 \}\)/);
  });

  it('parent SpecialistsAuditPanel wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAuditVerify\s*\}\s+from\s+'\.\.\/lib\/use-audit-verify'/);
    assert.match(src, /useAuditVerify\(\)/);
    assert.doesNotMatch(src, /const \[verifyBusy, setVerifyBusy\]/);
    assert.doesNotMatch(src, /const handleVerify = useCallback/);
  });
});

describe('extracted: useSpecialistsAudit hook (v1.10.682)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialists-audit.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsAuditPanel.tsx');

  it('exports the hook + AuditEntry + AuditWindow types', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistsAudit/);
    assert.match(src, /export interface AuditEntry/);
    assert.match(src, /export type AuditWindow\s*=\s*'all'\s*\|\s*'1h'\s*\|\s*'24h'\s*\|\s*'7d'/);
  });

  it('only polls when auditOpen + every 30s with cancel guard', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(!auditOpen\) return undefined/);
    assert.match(src, /window\.setInterval\(fetchAudit,\s*30000\)/);
    assert.match(src, /let cancelled = false/);
  });

  it('translates windowed since param into the URL', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /qs\.set\('since',\s*new Date\(sinceMs\)\.toISOString\(\)\)/);
    assert.match(src, /\/api\/specialists\/audit\?\$\{qs\.toString\(\)\}/);
    assert.match(src, /'1h'\s*\?\s*1\s*:\s*auditWindow === '24h'\s*\?\s*24\s*:\s*24 \* 7/);
  });

  it('parent SpecialistsAuditPanel wires the hook + drops the inline state + effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistsAudit/);
    assert.match(src, /useSpecialistsAudit\(\{\s*auditOpen\s*\}\)/);
    assert.doesNotMatch(src, /^interface AuditEntry/m);
    assert.doesNotMatch(src, /^type AuditWindow/m);
    assert.doesNotMatch(src, /const \[auditEntries, setAuditEntries\]/);
  });
});

describe('extracted: useFilteredSessions hook (v1.10.681)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-filtered-sessions.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsView.tsx');

  it('exports the hook + accepts groups/attached/query', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useFilteredSessions/);
    assert.match(src, /groups:\s*SessionGroup\[\]\s*\|\s*null/);
    assert.match(src, /attached:\s*AttachedSession\[\]/);
    assert.match(src, /query:\s*string/);
  });

  it('groupMatchesQuery + attachedMatchesQuery stay private', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /function groupMatchesQuery/);
    assert.match(src, /function attachedMatchesQuery/);
    assert.doesNotMatch(src, /export function groupMatchesQuery/);
    assert.doesNotMatch(src, /export function attachedMatchesQuery/);
  });

  it('group match falls back to projectPath/projectDir + sessionId/snippet/path', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /group\.projectPath\s*\|\|\s*''/);
    assert.match(src, /group\.projectDir\s*\|\|\s*''/);
    assert.match(src, /s\.sessionId.*lastAssistantSnippet/);
  });

  it('returns the three filter results', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /filteredGroups:\s*SessionGroup\[\]/);
    assert.match(src, /totalFiltered:\s*number/);
    assert.match(src, /filteredAttached:\s*AttachedSession\[\]/);
  });

  it('parent SessionsView wires the hook + drops the inline helpers + memos', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useFilteredSessions\s*\}\s+from\s+'\.\.\/lib\/use-filtered-sessions'/);
    assert.match(src, /useFilteredSessions\(\{[\s\S]*?groups:\s*data\?\.groups\s*\?\?\s*null,\s*attached,\s*query[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /^function groupMatchesQuery/m);
    assert.doesNotMatch(src, /^function attachedMatchesQuery/m);
  });
});

describe('extracted: usePlanDispatch hook (v1.10.680)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-plan-dispatch.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'pages', 'Plan.tsx');

  it('exports the hook + accepts the eight inputs', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function usePlanDispatch/);
    assert.match(src, /selected:\s*string/);
    assert.match(src, /plan:\s*PlanResponse\s*\|\s*null/);
    assert.match(src, /setError:\s*\(message:\s*string\s*\|\s*null\)\s*=>\s*void/);
    assert.match(src, /loadPlan:\s*\(\)\s*=>\s*Promise<void>/);
  });

  it('dispatchPlan POSTs /api/plan with name + task + optional branch/output', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<PlanResponse>\('\/api\/plan',\s*body\)/);
    assert.match(src, /if \(branch\) body\['branch'\] = branch/);
    assert.match(src, /if \(output\) body\['output'\] = output/);
    assert.match(src, /loadPlan\(\)/);
  });

  it('redispatch POSTs /api/task with the saved plan content + window.confirm gate', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.confirm\(tFormat\('plan\.confirmRedispatch'/);
    assert.match(src, /apiPost<\{ error\?: string \}>\('\/api\/task'/);
    assert.match(src, /task: plan\.content/);
    assert.match(src, /useBranch: true/);
  });

  it('parent Plan wires the hook + drops the inline state + handlers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePlanDispatch\s*\}\s+from\s+'\.\.\/lib\/use-plan-dispatch'/);
    assert.match(src, /usePlanDispatch\(\{[\s\S]*?selected,\s*task,\s*branch,\s*output,\s*plan,\s*setError,\s*showToast,\s*loadPlan[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[dispatching, setDispatching\]/);
    assert.doesNotMatch(src, /const dispatchPlan = useCallback/);
    assert.doesNotMatch(src, /const redispatch = useCallback/);
  });
});

describe('extracted: useMeetingCreate hook (v1.10.679)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-meeting-create.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'MeetingsComposer.tsx');

  it('exports the hook + accepts the eight task/template/setters/onCreated args', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useMeetingCreate/);
    assert.match(src, /newTask:\s*string/);
    assert.match(src, /templateName:\s*string\s*\|\s*null/);
    assert.match(src, /templateVars:\s*Record<string,\s*string>/);
    assert.match(src, /onCreated:\s*\(newMeetingId:\s*string\)\s*=>\s*void/);
  });

  it('POSTs /api/meetings with task or template body branches', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<\{ id: string \}>\('\/api\/meetings'/);
    assert.match(src, /if \(templateName\)/);
    assert.match(src, /body\.template = templateName/);
    assert.match(src, /body\.task = task/);
    assert.match(src, /if \(newTrack !== 'auto'\) body\.track = newTrack/);
  });

  it('filters out empty template vars before sending', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /Object\.entries\(templateVars\)\.filter\(\(\[, v\]\) => v && v\.length > 0\)/);
  });

  it('clears form + fires onCreated on success', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setNewTask\(''\)/);
    assert.match(src, /setTemplateName\(null\)/);
    assert.match(src, /setTemplateVars\(\{\}\)/);
    assert.match(src, /if \(created && created\.id\) onCreated\(created\.id\)/);
  });

  it('parent MeetingsComposer wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useMeetingCreate\s*\}\s+from\s+'\.\.\/lib\/use-meeting-create'/);
    assert.match(src, /useMeetingCreate\(\{[\s\S]*?newTask,\s*newTrack,\s*templateName,\s*templateVars[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[createBusy, setCreateBusy\]/);
    assert.doesNotMatch(src, /const \[createError, setCreateError\]/);
    assert.doesNotMatch(src, /const handleCreate = useCallback/);
  });
});

describe('extracted: useSpecialistFilter hook (v1.10.678)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-specialist-filter.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SpecialistsView.tsx');

  it('exports the hook + accepts specialists list', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSpecialistFilter/);
    assert.match(src, /specialists:\s*Specialist\[\]/);
  });

  it('AND-composes whitespace-separated tokens against the searchable haystack', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /tokens\.every\(\(t\) => haystack\.includes\(t\)\)/);
    assert.match(src, /s\.id,\s*s\.displayName,\s*s\.systemPrompt/);
    assert.match(src, /\.\.\.\(Array\.isArray\(s\.domain\)/);
    assert.match(src, /triggers\.keywords/);
  });

  it('honors vetoOnly + tierFilter short-circuits', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(vetoOnly && !s\.vetoPower\) return false/);
    assert.match(src, /if \(tierFilter !== 'any' && s\.tier !== tierFilter\) return false/);
  });

  it('returns the three setters + filtered list', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /filter:\s*string/);
    assert.match(src, /tierFilter:\s*string/);
    assert.match(src, /vetoOnly:\s*boolean/);
    assert.match(src, /filtered:\s*Specialist\[\]/);
  });

  it('parent SpecialistsView wires the hook + drops the inline state + memo', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSpecialistFilter\s*\}\s+from\s+'\.\.\/lib\/use-specialist-filter'/);
    assert.match(src, /useSpecialistFilter\(\{\s*specialists\s*\}\)/);
    assert.doesNotMatch(src, /const \[filter, setFilter\]/);
    assert.doesNotMatch(src, /const \[tierFilter, setTierFilter\]/);
    assert.doesNotMatch(src, /const \[vetoOnly, setVetoOnly\]/);
  });
});

describe('extracted: useWorkflowRun hook (v1.10.677)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-workflow-run.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'WorkflowEditor.tsx');

  it('exports the hook + accepts selectedId/setRuns/setBusy/setError', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkflowRun/);
    assert.match(src, /selectedId:\s*string\s*\|\s*null/);
    assert.match(src, /setRuns:\s*\(runs:\s*WorkflowRun\[\]\)\s*=>\s*void/);
  });

  it('auto-resets the inputs drawer on selectedId flip', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useEffect\(\(\) => \{[\s\S]*?setInputsOpen\(false\)[\s\S]*?setInputsJson\('\{\}'\)[\s\S]*?\}, \[selectedId\]\)/);
  });

  it('handleRun parses + validates JSON before POSTing', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /JSON\.parse\(inputsJson\)/);
    assert.match(src, /workflowEditor\.inputsMustBeObject/);
    assert.match(src, /apiPost\('\/api\/workflows\/'\s*\+\s*encodeURIComponent\(selectedId\)\s*\+\s*'\/run'/);
  });

  it('handleRun refetches /runs after a successful POST', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<WorkflowRunsResponse>\('\/api\/workflows\/'\s*\+\s*encodeURIComponent\(selectedId\)\s*\+\s*'\/runs'\)/);
    assert.match(src, /setRuns\(r\.runs\s*\|\|\s*\[\]\)/);
  });

  it('parent WorkflowEditor wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useWorkflowRun\s*\}\s+from\s+'\.\.\/lib\/use-workflow-run'/);
    assert.match(src, /useWorkflowRun\(\{\s*selectedId,\s*setRuns,\s*setBusy,\s*setError\s*\}\)/);
    assert.doesNotMatch(src, /const \[inputsOpen, setInputsOpen\]/);
    assert.doesNotMatch(src, /const handleRun = async/);
  });
});

describe('extracted: useAutoScroll hook (v1.10.676)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-auto-scroll.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ChatView.tsx');

  it('exports the hook + AUTOSCROLL_THRESHOLD_PX constant', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAutoScroll/);
    assert.match(src, /export const AUTOSCROLL_THRESHOLD_PX\s*=\s*24/);
  });

  it('runs a layout effect that scrolls to bottom when autoScroll + bumpKey changes', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useLayoutEffect/);
    assert.match(src, /el\.scrollTop = el\.scrollHeight/);
    assert.match(src, /\[bumpKey, autoScroll, scrollRef\]/);
  });

  it('isAtBottom uses the threshold to classify scroll position', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /el\.scrollHeight - el\.scrollTop - el\.clientHeight/);
    assert.match(src, /distance <= AUTOSCROLL_THRESHOLD_PX/);
  });

  it('jumpToBottom sets scrollTop + flips autoScroll back on', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /const jumpToBottom = useCallback/);
    assert.match(src, /setAutoScroll\(true\)/);
  });

  it('parent ChatView wires the hook + drops the inline state + layout effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAutoScroll\s*\}\s+from\s+'\.\.\/lib\/use-auto-scroll'/);
    assert.match(src, /useAutoScroll\(\{\s*scrollRef,\s*bumpKey:\s*messages\.length\s*\}\)/);
    assert.doesNotMatch(src, /const \[autoScroll, setAutoScroll\]/);
    assert.doesNotMatch(src, /^const AUTOSCROLL_THRESHOLD_PX/m);
  });
});

describe('extracted: useExpandedSet hook (v1.10.675)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-expanded-set.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'HierarchyTree.tsx');

  it('exports the hook + accepts workers list', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useExpandedSet/);
    assert.match(src, /workers:\s*Worker\[\]/);
  });

  it('owns Set<string> state with auto-expand-on-first-arrival', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useState<Set<string>>\(new Set\(\)\)/);
    assert.match(src, /if \(prev\.size > 0\) return prev/);
    assert.match(src, /for \(const w of workers\) next\.add\(w\.name\)/);
  });

  it('returns toggle/expandAll/collapseAll helpers', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /toggle:\s*\(name:\s*string\)\s*=>\s*void/);
    assert.match(src, /expandAll:\s*\(\)\s*=>\s*void/);
    assert.match(src, /collapseAll:\s*\(\)\s*=>\s*void/);
  });

  it('parent HierarchyTree wires the hook + drops the inline state + helpers', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useExpandedSet\s*\}\s+from\s+'\.\.\/lib\/use-expanded-set'/);
    assert.match(src, /useExpandedSet\(\{\s*workers\s*\}\)/);
    assert.doesNotMatch(src, /const \[expanded, setExpanded\]/);
    assert.doesNotMatch(src, /const toggle = useCallback/);
  });
});

describe('extracted: useAttachProcessState hook (v1.10.674)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-attach-process-state.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'SessionsAttachedRowActions.tsx');

  it('exports the hook + AttachProcessState union', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useAttachProcessState/);
    assert.match(src, /export type AttachProcessState/);
    assert.match(src, /\{ status: 'loading' \}/);
    assert.match(src, /\{ status: 'alive'/);
    assert.match(src, /\{ status: 'idle' \}/);
    assert.match(src, /\{ status: 'error'/);
  });

  it('GETs /api/attach/:name/process every 30s with cancellation guard', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/attach\/\$\{encodeURIComponent\(name\)\}\/process/);
    assert.match(src, /window\.setInterval\(poll,\s*30000\)/);
    assert.match(src, /let cancelled = false/);
    assert.match(src, /window\.clearInterval\(id\)/);
  });

  it('maps response to alive/idle/error variants', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(data\.alive && typeof data\.pid === 'number'\)/);
    assert.match(src, /setProcState\(\{\s*status: 'idle' \}\)/);
    assert.match(src, /setProcState\(\{ status: 'error', message: \(err as Error\)\.message \}\)/);
  });

  it('parent SessionsAttachedRowActions wires the hook + drops the inline state + effect', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useAttachProcessState\s*\}\s+from\s+'\.\.\/lib\/use-attach-process-state'/);
    assert.match(src, /useAttachProcessState\(\{\s*name:\s*session\.name\s*\}\)/);
    assert.doesNotMatch(src, /^type AttachProcessState/m);
    assert.doesNotMatch(src, /const \[procState, setProcState\]/);
  });
});

describe('extracted: useChatSubmit hook (v1.10.673)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-chat-submit.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'ChatView.tsx');

  it('exports the hook + accepts the eight callbacks/refs', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useChatSubmit/);
    assert.match(src, /workerName:\s*string/);
    assert.match(src, /flushWorkerBuffer:\s*\(\)\s*=>\s*void/);
    assert.match(src, /appendLive:\s*\(role:\s*Role,\s*text:\s*string\)\s*=>\s*void/);
    assert.match(src, /textareaRef:\s*RefObject<HTMLTextAreaElement\s*\|\s*null>/);
  });

  it('flushes buffer before optimistic user bubble + clears input', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /flushWorkerBuffer\(\);[\s\S]*?appendLive\('user', text\);[\s\S]*?setInput\(''\)/);
  });

  it('POSTs /api/send then /api/key Enter sequentially', () => {
    // (v1.10.752) apiFetch + manual error throw replaced with apiPost.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiPost<\{ error\?: string \}>\('\/api\/send'/);
    assert.match(src, /apiPost<\{ error\?: string \}>\('\/api\/key'[\s\S]*?key:\s*'Enter'/);
  });

  it('returns focus to textarea on every completion + flips sending=false', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /finally \{[\s\S]*?setSending\(false\)[\s\S]*?textareaRef\.current\?\.focus\(\)/);
  });

  it('parent ChatView wires the hook + drops the inline state + handler', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useChatSubmit\s*\}\s+from\s+'\.\.\/lib\/use-chat-submit'/);
    assert.match(src, /useChatSubmit\(\{[\s\S]*?workerName,\s*input,\s*setInput,\s*setError,\s*setAutoScroll,[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /const \[sending, setSending\]/);
    assert.doesNotMatch(src, /const handleSubmit = async/);
  });
});

describe('extracted: useXtermAutofit hook (v1.10.672)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-xterm-autofit.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'components', 'XtermView.tsx');

  it('exports the hook + clamp constants + FIT_DEBOUNCE_MS', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useXtermAutofit/);
    assert.match(src, /export \{ FIT_DEBOUNCE_MS, MIN_COLS, MAX_COLS, MIN_ROWS, MAX_ROWS \}/);
    assert.match(src, /FIT_DEBOUNCE_MS\s*=\s*120/);
    assert.match(src, /MIN_COLS\s*=\s*20/);
    assert.match(src, /MAX_COLS\s*=\s*400/);
    assert.match(src, /MIN_ROWS\s*=\s*5/);
    assert.match(src, /MAX_ROWS\s*=\s*200/);
  });

  it('clampInt + AUTOFIT_DEBUG stay private to the hook module', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /function clampInt/);
    assert.match(src, /AUTOFIT_DEBUG: boolean/);
    assert.doesNotMatch(src, /export function clampInt/);
    assert.doesNotMatch(src, /export const AUTOFIT_DEBUG/);
  });

  it('runFit fits + clamps + drops no-op POST /api/resize', () => {
    // (v1.10.754) apiFetch+manual builder replaced with apiPost.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /fit\.fit\(\)/);
    assert.match(src, /clampInt\(rawCols, MIN_COLS, MAX_COLS\)/);
    assert.match(src, /clampInt\(rawRows, MIN_ROWS, MAX_ROWS\)/);
    assert.match(src, /apiPost\('\/api\/resize'/);
    assert.match(src, /lastResizeRef\.current = \{ cols, rows \}/);
  });

  it('scheduleFit debounces via window.setTimeout(FIT_DEBOUNCE_MS)', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.setTimeout\(\(\) => \{[\s\S]*?runFit\(\);[\s\S]*?\}, FIT_DEBOUNCE_MS\)/);
  });

  it('parent XtermView wires the hook + drops the inline refs + helpers + constants', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useXtermAutofit\s*\}\s+from\s+'\.\.\/lib\/use-xterm-autofit'/);
    assert.match(src, /useXtermAutofit\(\{\s*termRef,\s*fitRef,\s*workerName\s*\}\)/);
    assert.doesNotMatch(src, /^const FIT_DEBOUNCE_MS\s*=/m);
    assert.doesNotMatch(src, /^function clampInt/m);
    assert.doesNotMatch(src, /const runFit = useCallback/);
    assert.doesNotMatch(src, /const scheduleFit = useCallback/);
  });
});

describe('extracted: useTheme hook (v1.10.671)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-theme.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'App.tsx');

  it('exports the hook with no-arg signature returning theme + setTheme', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useTheme\(\)/);
    assert.match(src, /theme:\s*ThemeMode/);
    assert.match(src, /setTheme:\s*\(next:\s*ThemeMode\)\s*=>\s*void/);
  });

  it('writes + applies on every theme change', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /writeTheme\(theme\)/);
    assert.match(src, /applyTheme\(theme\)/);
  });

  it('subscribes to OS theme media query when theme === system', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /if \(theme !== 'system'/);
    assert.match(src, /window\.matchMedia\('\(prefers-color-scheme: dark\)'\)/);
    assert.match(src, /applyTheme\('system'\)/);
    assert.match(src, /mq\.removeEventListener\('change',\s*onChange\)/);
  });

  it('parent App wires the hook + drops the inline state + apply effect + OS listener', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useTheme\s*\}\s+from\s+'\.\/lib\/use-theme'/);
    assert.match(src, /useTheme\(\)/);
    assert.doesNotMatch(src, /const \[theme, setTheme\]/);
    assert.doesNotMatch(src, /writeTheme\(theme\)/);
    assert.doesNotMatch(src, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  });
});

describe('extracted: useSidebarShortcut hook (v1.10.670)', () => {
  const fs = require('fs');
  const path = require('path');
  const HOOK = path.join(__dirname, '..', 'web', 'src', 'lib', 'use-sidebar-shortcut.ts');
  const PARENT = path.join(__dirname, '..', 'web', 'src', 'App.tsx');

  it('exports the hook + accepts onToggleCollapsed + onToggleOpen', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useSidebarShortcut/);
    assert.match(src, /onToggleCollapsed:\s*\(\)\s*=>\s*void/);
    assert.match(src, /onToggleOpen:\s*\(\)\s*=>\s*void/);
  });

  it('binds Ctrl+B/Cmd+B + skips text-entry surfaces', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /e\.ctrlKey\s*\|\|\s*e\.metaKey/);
    assert.match(src, /e\.key\.toLowerCase\(\)\s*!==\s*'b'/);
    assert.match(src, /tag === 'INPUT'/);
    assert.match(src, /tag === 'TEXTAREA'/);
    assert.match(src, /isContentEditable/);
  });

  it('routes to onToggleCollapsed at desktop and onToggleOpen at mobile', () => {
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /window\.matchMedia\('\(min-width: 768px\)'\)\.matches/);
    assert.match(src, /onToggleCollapsed\(\)/);
    assert.match(src, /onToggleOpen\(\)/);
  });

  it('parent App wires the hook + drops the inline keydown listener', () => {
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*useSidebarShortcut\s*\}\s+from\s+'\.\/lib\/use-sidebar-shortcut'/);
    assert.match(src, /useSidebarShortcut\(\{[\s\S]*?onToggleCollapsed[\s\S]*?onToggleOpen[\s\S]*?\}\)/);
    assert.doesNotMatch(src, /e\.key\.toLowerCase\(\) !== 'b'/);
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

  it('exports the hook + accepts workers/showToast/fetchList', () => {
    // (v1.10.740) postAction lifted to lib/post-action so it's no longer a prop.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /export function useWorkerSelection/);
    assert.match(src, /workers:\s*Worker\[\]/);
    assert.match(src, /showToast:\s*\(message:\s*string,\s*type:\s*ToastType\)\s*=>\s*void/);
    assert.match(src, /fetchList:\s*\(\)\s*=>\s*Promise<void>/);
    assert.match(src, /import\s+\{\s*postAction\s*\}\s+from\s+'\.\/post-action'/);
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
    // (v1.10.740) postAction prop dropped now that the hook imports it directly.
    assert.match(src, /useWorkerSelection\(\{[\s\S]*?workers,\s*showToast,\s*fetchList[\s\S]*?\}\)/);
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
    // (v1.10.750) apiFetch + manual throw replaced with apiGet which
    // throws on non-ok internally via _throwHttpError.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<PlanResponse>\(`\/api\/plan\?name=\$\{encodeURIComponent\(selected\)\}`\)/);
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
    // (v1.10.680) The `type PlanResponse` import was dropped by the
    // sibling extraction (usePlanDispatch consumes it directly), so
    // the parent only imports `usePlanContent`.
    const src = fs.readFileSync(PARENT, 'utf8');
    assert.match(src, /import\s+\{\s*usePlanContent\s*\}\s+from\s+'\.\.\/lib\/use-plan-content'/);
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
    // (v1.10.752) apiFetch + manual error throw replaced with apiGet.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /apiGet<ListResponse>\('\/api\/list'\)/);
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
    // (v1.10.769) Banner state delegated to useAutoClearMessage; the
    // 4s default duration applies because no override is passed.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useAutoClearMessage/);
    assert.match(src, /setSuccess\(t\(/);
    assert.match(src, /void refresh\(\)/);
  });

  it('flips pauseFailed tone on error', () => {
    // (v1.10.769) Failure tone delegated to useAutoClearMessage's
    // setFailure, which sets msg + failed without auto-clearing.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /setFailure\(/);
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
    // (v1.10.765) Banner state delegated to useAutoClearMessage; the
    // 6s duration is passed as the second arg to setSuccess.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /\/api\/wiki\/publish-all/);
    assert.match(src, /useAutoClearMessage/);
    assert.match(src, /setSuccess\([\s\S]*?,\s*6000\)/);
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
    // (v1.10.743) Polling shape lifted to lib/use-silent-poll.
    const src = fs.readFileSync(HOOK, 'utf8');
    assert.match(src, /useStuckMeetings\(\):\s*StuckResponse\s*\|\s*null/);
    assert.match(src, /useSilentPoll<StuckResponse>\('\/api\/meetings\/stuck\?hours=1',\s*60000\)/);
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
    // (v1.10.763) Toggle interlock moved into the parent
    // hook (use-wiki-bulk-publish toggleBulkGitCommit / Push)
    // so this row stays a thin display component.
    const src = read('WikiBulkPublishRow.tsx');
    assert.match(src, /wiki\.publishAll\.label/);
    assert.match(src, /wiki\.publishAll\.publishing/);
    assert.match(src, /wiki\.gitCommit/);
    assert.match(src, /wiki\.gitPush/);
    assert.match(src, /onGitCommit\(e\.target\.checked\)/);
    assert.match(src, /onGitPush\(e\.target\.checked\)/);
    const fs = require('fs');
    const path = require('path');
    const hookSrc = fs.readFileSync(
      path.join(__dirname, '..', 'web', 'src', 'lib', 'use-wiki-bulk-publish.ts'),
      'utf8',
    );
    assert.match(hookSrc, /toggleBulkGitCommit = useCallback\(\(next: boolean\) => \{[\s\S]*?if \(!next\) setBulkGitPush\(false\)/);
    assert.match(hookSrc, /toggleBulkGitPush = useCallback\(\(next: boolean\) => \{[\s\S]*?if \(next\) setBulkGitCommit\(true\)/);
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
