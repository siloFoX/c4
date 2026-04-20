'use strict';

// (8.21) Intervention state split.
//
// Before this module the daemon tracked a single `_interventionState`
// string and the list() row echoed it verbatim. Monitoring code then
// treated every non-null value as "needs human", which caused:
//
//   - sticky flags: once set, nothing cleared them until the worker was
//     re-tasked or closed;
//   - false positives: a helper that exited non-zero on teardown looked
//     the same as an active approval prompt.
//
// This module narrows the public surface the monitor cron reads:
//
//   - `approval_pending`  — live TUI prompt / question / critical deny.
//                           The only state the autonomous loop should
//                           poll with read-now.
//   - `background_exit`   — a spawned child exited non-zero while the
//                           parent worker is still alive and there is
//                           no prompt. Informational only.
//   - `past_resolved`     — state used to be set; it has since cleared.
//                           Breadcrumb for history/UI.
//   - null                — idle.
//
// The internal `_interventionState` keeps its legacy values
// (`question`, `escalation`, `critical_deny`, `bg_exit`, null) so the
// existing hot-paths (critical-deny approval flow, wait interrupts,
// SSE, tests) do not need a coordinated rewrite.

function detectApprovalPrompt(snapshot) {
  if (!snapshot || typeof snapshot !== 'string') return false;
  // Only the tail counts — a prompt that scrolled off screen isn't
  // actionable anymore. Match the Screen buffer width used elsewhere.
  const tail = snapshot.split('\n').slice(-60).join('\n');
  const patterns = [
    /Do you want to (proceed|create|make this edit|run this|make these changes)/i,
    /Continue\?\s*\[?[Yy]\/[Nn]\]?/,
    /\[y\/N\]/,
    /\[Y\/n\]/,
    /\(y\/n\)/i,
    /\(yes\/no\)/i,
    /trust this folder/i,
    /Bash command[\s\S]{0,200}\n[\s\S]{0,80}1\.\s+Yes/,
    /\uACC4\uC18D\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C/,
    /^\s*Proceed\?/im,
    /Accept the changes\?/i,
  ];
  return patterns.some((r) => r.test(tail));
}

function mapInterventionToPublic(worker) {
  if (!worker) return null;
  const s = worker._interventionState || null;
  if (s === 'question' || s === 'critical_deny' || s === 'escalation') {
    return 'approval_pending';
  }
  if (s === 'bg_exit') return 'background_exit';
  if (s === null || s === undefined) {
    return worker._hadIntervention ? 'past_resolved' : null;
  }
  return 'approval_pending';
}

function clearInterventionIfResolved(worker, snapshot) {
  if (!worker) return false;
  const s = worker._interventionState;
  if (!s) return false;
  // critical_deny only clears through explicit operator action (c4 approve
  // or c4 key). Auto-clearing it would bypass the deny-list guardrail.
  if (s === 'critical_deny') return false;
  if (detectApprovalPrompt(snapshot)) return false;
  worker._interventionState = null;
  worker._hadIntervention = true;
  if (!worker._lastInterventionAt) {
    worker._lastInterventionAt = new Date().toISOString();
  }
  return true;
}

module.exports = {
  detectApprovalPrompt,
  mapInterventionToPublic,
  clearInterventionIfResolved,
};
