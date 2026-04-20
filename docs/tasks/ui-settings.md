TODO 8.20 part A: Settings, Dashboard home, and Command Palette for c4 Web UI.

Repo /root/c4. Worktree /root/c4-worktree-ui-settings on branch c4/ui-settings. Do not commit to main. Do not merge. Work only inside the worktree.

Context: c4 already has a working web UI at /root/c4-worktree-ui-settings/web. Existing pages include worker list, chat, terminal, history, workflows, hierarchy tree, login. This task adds a Dashboard home, a Settings area, and a Cmd+K command palette. Do not touch existing pages unless integration requires it. Coordinate with the jsonl-view worker which adds a Sessions tab; avoid file collisions with web/src/components/ConversationView.* and web/src/pages/Sessions.*.

Deliverables.

1. Dashboard Home page web/src/pages/Dashboard.tsx (or .jsx to match project style).
   - Route / (or /dashboard if the existing / already shows workers).
   - Cards: WorkerSummary (count of workers by status), RecentActivity (last 20 events from /api/events or history), CostSummary (today + week token cost from /api/token-usage or /api/cost), AlertsFeed (intervention flags + STALLs from workers). Each card has a "skeleton" loading state.
   - Use existing Card, Panel, Badge primitives. Dark-mode-first. Responsive grid (1 col mobile, 2 col tablet, 3-4 col desktop).

2. Settings area web/src/pages/Settings.tsx with subroutes using a side-tab layout.
   - Sections: Profile (name, email), Auth (token management via /api/auth endpoints), Theme (dark/light/system), Fleet (list/add/remove machines), Slack (webhook + channel), MCP (list endpoints + toggles), RBAC (users + roles, admin only), Preferences (default tab, sidebar width saved to localStorage).
   - Each section has its own component under web/src/pages/settings/*.tsx.
   - Use existing shadcn primitives. Show optimistic UI for writes.

3. Cmd+K Command Palette web/src/components/CommandPalette.tsx.
   - Global hotkey Ctrl or Cmd + K. Escape closes.
   - Fuzzy filter of commands: "Create worker", "Close worker", "Run task", "Open worker chat", "View history", "Go to settings", "Toggle theme", "Sign out".
   - Uses a lightweight filter (string-score or manual). No heavy deps.
   - Renders in a portal. Backdrop blur with tokens.

4. Global keyboard shortcuts registered in a useKeyboardShortcuts hook:
   - Cmd+K open palette.
   - g then w go to workers.
   - g then d go to dashboard.
   - g then s go to settings.
   - ? show shortcuts cheat sheet.

5. Theme and preferences persistence. useTheme hook stores theme in localStorage with keys c4.theme and c4.sidebarWidth. Respect prefers-color-scheme media query for system default.

6. Skeleton loaders component web/src/components/Skeleton.tsx with variants (line, card, list). Replace plain loading spinners in your new pages with skeletons.

7. Accessibility. All interactive components have aria labels, role attributes, focus visible styles, keyboard nav. Run a11y via @axe-core/react in dev mode (optional; add only if already in deps).

8. Tests. Component tests for CommandPalette (fuzzy filter), useTheme (reads/writes localStorage), Dashboard cards (render with mock data). Prefer existing test runner (vitest or jest whichever is configured).

9. Docs. docs/patches/8.20a-settings-dashboard.md describing scope. TODO.md mark 8.20 part A done with subsection label. CHANGELOG.md entry.

10. Commit and push the branch. Do not merge.

Constraints.
- No compound bash commands. git -C /root/c4-worktree-ui-settings, npm --prefix /root/c4-worktree-ui-settings.
- Do not edit files owned by other active workers: session-parser.js, ConversationView.tsx, Sessions.tsx belong to jsonl-view. auth.js and cli.js belong to auth-fix.
- Keep bundle lean. Reuse existing deps.
- If an API endpoint you need does not exist yet, stub with TODO comment and return mock data so the UI can render. Report stubs in your final summary.

Report back with file list, test results, and any open questions.

Start now.
