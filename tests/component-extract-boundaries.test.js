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

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsRunControls\s+from\s+'\.\/MeetingsRunControls'/);
    assert.match(parent, /<MeetingsRunControls\s+meetingId=\{selectedId\}/);
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

  it('is rendered at 2 sites by MeetingsView (one per mode)', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsStateActions\s+from\s+'\.\/MeetingsStateActions'/);
    assert.match(parent, /<MeetingsStateActions\s+meetingId=\{selectedId\}\s+mode="in-progress"/);
    assert.match(parent, /<MeetingsStateActions\s+meetingId=\{selectedId\}\s+mode="pending"/);
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

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsPeerRetroControls\s+from\s+'\.\/MeetingsPeerRetroControls'/);
    assert.match(parent, /<MeetingsPeerRetroControls\s+meetingId=\{selectedId\}/);
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

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsPublishControls\s+from\s+'\.\/MeetingsPublishControls'/);
    assert.match(parent, /<MeetingsPublishControls\s+meetingId=\{selectedId\}/);
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

  it('is imported and rendered by MeetingsView', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsRetroActions\s+from\s+'\.\/MeetingsRetroActions'/);
    assert.match(parent, /<MeetingsRetroActions\s+meetingId=\{selectedId\}/);
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

  it('is imported and rendered by MeetingsView (toggle open flag in parent)', () => {
    const parent = read('MeetingsView.tsx');
    assert.match(parent, /import\s+MeetingsContributePanel\s+from\s+'\.\/MeetingsContributePanel'/);
    assert.match(parent, /<MeetingsContributePanel\s+open=\{contribOpen\}\s+meetingId=\{selectedId\}/);
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

  it('is imported by SessionsView', () => {
    const parent = read('SessionsView.tsx');
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

  it('is imported by SessionsView', () => {
    const parent = read('SessionsView.tsx');
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

  it('is rendered at >= 2 call sites by SessionsView (selected + empty panes)', () => {
    const parent = read('SessionsView.tsx');
    assert.match(parent, /import\s+SessionsComparisonCard\s+from\s+'\.\/SessionsComparisonCard'/);
    const calls = parent.match(/<SessionsComparisonCard/g) || [];
    assert.ok(
      calls.length >= 2,
      `expected >= 2 call sites, saw ${calls.length}`,
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

  it('is imported and rendered by MeetingsView with 5 detail props', () => {
    const parent = read('MeetingsView.tsx');
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
