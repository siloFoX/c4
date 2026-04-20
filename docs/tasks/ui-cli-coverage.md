TODO 8.20 part B: Web UI pages covering c4 CLI features not yet in the UI.

Repo /root/c4. Worktree /root/c4-worktree-ui-cli-coverage on branch c4/ui-cli-coverage. Do not commit to main. Do not merge. Work only inside the worktree.

Context: most CLI features lack a UI counterpart. Build pages that wrap these CLI commands using existing API endpoints (or add minimal API wrappers where missing). Coordinate with ui-settings worker (owns Settings/Dashboard/Palette) and jsonl-view worker (owns Sessions tab). Do not touch those areas.

Target CLI features and their UI pages.

1. Scribe control. Page web/src/pages/Scribe.tsx. Shows scribe status, start/stop buttons, scan trigger, events stream (SSE from /api/scribe/events if available). POST /api/scribe/start, /api/scribe/stop, /api/scribe/scan. Tail recent context snapshots.

2. Batch dispatch. Page web/src/pages/Batch.tsx. Form fields: task text, count, branch prefix, profile, auto-mode toggle. Submit posts to /api/batch. Show launched worker list with live status.

3. Cleanup. Page web/src/pages/Cleanup.tsx. Lists orphan worktrees and branches via /api/cleanup?dryRun=true. Cleanup button (confirmation dialog) calls /api/cleanup with dryRun false.

4. Health dashboard. Page web/src/pages/Health.tsx. Daemon status, uptime, loaded modules, event loop lag, queue depth. /api/health extended if needed; if extension needed, stub server-side extension and note it.

5. Token usage report. Page web/src/pages/TokenUsage.tsx. /api/token-usage with per-task toggle, date range filter. Bar chart grouped by worker and day. Quota page shows daily tier caps.

6. Plan. Page web/src/pages/Plan.tsx. Select worker + enter task text. POST /api/plan. Result panel renders plan.md with react-markdown. Button to re-dispatch as real task.

7. Morning report. Page web/src/pages/Morning.tsx. POST /api/morning triggers generation. Display rendered markdown with sections (yesterday summary, open TODOs, cost). Export copy button.

8. Auto mode. Page web/src/pages/Auto.tsx. Spawn autonomous manager + scribe. Form: task text. Submit triggers /api/auto.

9. Templates manager. Page web/src/pages/Templates.tsx. List from /api/templates. Add/remove template. Applies when creating a worker.

10. Profiles manager. Page web/src/pages/Profiles.tsx. List from /api/profiles. Add/edit profile. Permission matrix UI for allow/deny patterns.

11. Swarm view. Page web/src/pages/Swarm.tsx. Given worker, show its swarm tree and status per node via /api/swarm/:name.

12. Rollback. Button on worker detail page. POST /api/rollback with confirmation dialog. Show rollback commit + diff summary.

13. Status message to Slack. Button on worker detail page. Form: message. POST /api/status.

14. Validation results. Page web/src/pages/Validation.tsx. For each worker show validation object via /api/validation.

Common requirements.

- Every page has loading skeleton, empty state, error toast.
- Every action has confirmation dialog for destructive operations (cleanup, rollback, close, stop daemon).
- Pages behind /feature/<name> route, added to sidebar nav.
- Sidebar items grouped by category: Operations, Cost, Automation, Config, Diagnostics.
- Add /api wrappers only where an endpoint is missing. Keep business logic on the server.
- Dark/light theme support via tokens.
- Mobile responsive layout.

Tests. Unit tests for any new util (date range helper, fuzzy filter, formatters). Component tests for at least Batch and Plan and TokenUsage.

Docs. docs/patches/8.20b-cli-coverage.md describing scope, list of added endpoints. TODO.md mark 8.20 part B done. CHANGELOG.md entry.

Constraints.
- No compound bash. git -C /root/c4-worktree-ui-cli-coverage, npm --prefix /root/c4-worktree-ui-cli-coverage.
- Never touch main.
- Do not collide with ui-settings or jsonl-view scope.
- Commit per logical unit. Push the branch at the end.
- If some endpoints do not exist, stub UI with toast "Not implemented yet" and file a sub-TODO in TODO.md describing missing server-side work. Prioritize implementing what is reachable now.

Report back with file list, endpoint coverage, test results, and unfinished stubs.

Start now.
