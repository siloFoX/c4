TODO 8.18 build Claude session JSONL parser and claude.ai style ConversationView component.

Repo /root/c4. Worktree branch c4/jsonl-view. Do not commit to main.

Deliverables.

A. Server side JSONL parser module src/session-parser.js.

- Reads a single Claude Code session JSONL file path. Each line is a JSON event from the CLI transcript format produced under ~/.claude/projects/-<path>/<session-id>.jsonl.
- Output: normalized Conversation {sessionId, projectPath, createdAt, updatedAt, model, totalInputTokens, totalOutputTokens, turns: [Turn]}.
- Each Turn is one of {role user, role assistant, role tool_use, role tool_result, role thinking, role system}. Fields: {id, role, createdAt, durationMs, model, tokens {input, output, cacheRead, cacheCreate}, content (string or markdown), toolName, toolArgs (parsed JSON), toolResult (string or structured), thinkingText, attachments, raw}.
- Pair tool_use blocks with subsequent tool_result by id.
- Gracefully skip malformed lines with a warning collected in Conversation.warnings.
- Provide streaming async iterator parseJsonlStream(path) that yields Turn objects as they are parsed. Used for tail and live SSE.
- Export parseJsonl(path), parseJsonlStream(path), listSessions(rootDir) which returns [{projectPath, sessionId, path, updatedAt, turnCount, lastAssistantSnippet}].

B. Daemon HTTP endpoints under /api/sessions prefix gated by auth middleware.

- GET /api/sessions list all sessions under ~/.claude/projects/ grouped by project directory.
- GET /api/sessions/:sessionId returns parsed Conversation.
- GET /api/sessions/:sessionId/stream SSE endpoint. Emits initial snapshot then tails new turns as JSONL grows (fs.watch plus re-parse from last offset).
- All endpoints respect auth.checkRequest and only expose sessions the authenticated user owns. Single-user mode admin default sees all.

C. Web UI ConversationView component at web/src/components/ConversationView.tsx or matching existing style.

- Layout mimics claude.ai chat. User messages right aligned slight surface tint, assistant left aligned full width markdown, thinking a collapsible gray card, tool_use expandable block with tool name and args, tool_result a code block with stdout styling.
- Use react-markdown and a syntax highlighter (Shiki or Prism). Keep bundle lean; reuse existing deps if present.
- Timestamp badges per turn, token and duration footer per assistant turn.
- Smooth auto scroll when new turn arrives unless user scrolled up.
- Use existing theme tokens and shadcn primitives (Card, Panel, Badge).
- Dark mode first class. Mobile responsive below 768px.

D. Sessions tab in web UI.

- New route /sessions or tab in existing layout.
- Lists from GET /api/sessions grouped by project, sorted by updatedAt desc.
- Clicking a session opens ConversationView in a right pane or full page.
- Search box filters by snippet and project name.
- Keep existing Worker list untouched.

E. Tests.

- Unit tests for session-parser with a fixture JSONL covering user, assistant, tool_use plus tool_result, thinking, malformed line.
- API tests for GET /api/sessions and GET /api/sessions/:id with mocked fs.
- Lightweight component test ensuring ConversationView renders all role types.

F. Docs.

- TODO.md mark 8.18 in progress then done.
- CHANGELOG.md feat entry.
- docs/patches/8.18-session-view.md describing module layout and JSONL schema assumptions.

G. Constraints.

- Never commit to main. Work only in worktree.
- No compound bash commands. Use git -C /root/c4-worktree-jsonl-view and npm --prefix /root/c4-worktree-jsonl-view.
- Respect existing code style. Do not rewrite unrelated files.
- After commit push branch. Do not merge.

H. Report back with file list, test results, screenshot path if puppeteer available.

Important: this feature is the foundation for TODO 8.17 external session import. Parser interface will be consumed by the 8.17 worker. Keep the parser API stable and documented.

Start now.
