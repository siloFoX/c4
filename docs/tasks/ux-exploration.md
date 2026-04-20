# UX Exploration + Auto-patch Task

## Goal
Exhaustive interactive UI/UX testing that clicks every clickable, submits every form, triggers every feature, captures screenshots, finds functional bugs + design issues, and auto-patches fixes. Must not interfere with existing workers or user session.

## Isolation Strategy
- Use existing silofox admin token (read from /tmp/c4-silofox-cred for login).
- For any c4 worker creation test (e.g. clicking "New Worker"), use throwaway names prefixed `ux-test-<timestamp>` so they can be cleaned up after. Close any test workers you created at the end.
- Do NOT interact with c4-mgr-auto, ui-audit, ui-test-setup, or any existing worker.
- Target the running web UI at http://localhost:5173 (ui-audit branch).

## Test Matrix

### Functional tests (click through flows)
1. Login page — valid creds, invalid creds, empty fields, Enter key submit
2. Worker list view — select worker, switch list/tree sidebar toggle, refresh
3. Worker detail tabs — Terminal, Chat, Control Panel, each for 1-2 workers
4. Chat — send message, observe response, scroll behavior, empty state
5. Control panel — pause/resume/close buttons (on a throwaway ux-test worker, not real ones)
6. History view — load, filter, search, date range picker, row click
7. Workflows view — list, refresh, (create form if any)
8. Sessions view if exists (8.17 future)
9. Top tabs navigation — Workers, Chat, History, Workflows
10. Sign out + re-login

### UI/UX observations (at each view)
- Screenshot full page via `page.screenshot({path: ..., fullPage: true})`
- Desktop viewport (1440x900) and mobile viewport (375x667)
- Dark mode (default) rendering — no white flash, no broken colors
- Hover states on interactive elements
- Loading states (while network pending)
- Empty states (no data)
- Error states (force a 401 / 404 / network fail by temporarily clearing token)
- Keyboard focus ring visible on tab navigation
- Text truncation — long worker names / long task strings not overflowing

### Specific issues to watch for
- Modals/dropdowns not closing on Escape or outside click
- Buttons without disabled state while loading
- Form submission on Enter not working
- Icon-only buttons without aria-label
- Color contrast too low (dark gray on dark)
- Fonts missing or not loaded
- Broken links (404 on click)
- Unhandled Promise rejections in console
- "Expected JSON from ..." errors re-appearing

## Output per iteration
- `/root/c4-worktree-<worker>/ux-reports/<iteration>/screenshots/*.png`
- `/root/c4-worktree-<worker>/ux-reports/<iteration>/report.json` — issues grouped by severity (critical/warn/info)
- `/root/c4-worktree-<worker>/ux-reports/<iteration>/summary.md` — human-readable with screenshot refs

## Auto-patch loop
- After each exploration, group issues by fixability:
  - Obvious (missing aria-label, bg-gray-X hardcoded, console.log left in prod, unhandled await): auto-fix in code
  - Ambiguous (design choices, accessibility judgment calls): flag for user review
- Commit each batch of fixes with message `feat(web): ux-exploration fix pass N`
- Re-run exploration; stop when two consecutive iterations show no critical issues
- Save patch at `/root/c4/patches/ux-exploration-<date>.patch`
- Post Slack notification when done — "UX exploration complete, N iterations, X auto-fixes, Y flagged for review"

## Constraints
- Single commands only (no compound / pipe / redirect chains)
- Never c4 merge — save patches only
- Never kill c4-mgr-auto or ui-audit
- Never rm anything outside worktree
- Screenshots in worktree dir only (git-ignore them)
- Test workers must be prefixed `ux-test-` and closed at end
