TODO 8.19 CLI auth middleware fix for legacy non-/api routes.

Problem: c4 CLI hits routes like /create /send /task /wait-read /read /list /close /merge /health /watch /key etc without /api prefix. Post 8.14 auth middleware those requests return 401 even with a valid bearer token. curl POST /api/create with the same token works fine. Goal: make the CLI fully functional again under auth while preserving gating.

Repo: /root/c4. Worktree branch c4/auth-fix assigned by c4 new. Work only in that worktree, never on main.

Plan.

1. Read src/cli.js and find every request() helper call. List which paths lack the /api prefix. Read src/daemon/server.js or equivalent and list registered routes. Read src/daemon/auth.js or wherever OPEN_API_ROUTES and checkRequest live and inspect which paths are open vs gated.

2. Choose the cleanest fix. Preferred option: update cli.js so every POST and GET goes to /api/*. If auth.checkRequest 401s paths outside /api/* because of a catch-all gate, tighten the logic so unknown non /api paths 404 rather than 401. Static /assets plus the SPA index plus SSE /events should remain open.

3. Reproduce the bug first: curl without token to /api/create returns 401, with valid token returns 200 or proper error. Then before fix run c4 new test-auth-1 and confirm it 401s. After fix rerun and confirm success.

4. Add or update tests in tests/ covering valid token on /api/create, missing token on /api/create, public GET on /api/auth/login, legacy /create handled correctly, checkRequest unit test for path classification.

5. Update docs: TODO.md mark 8.19 in progress then done after verification. CHANGELOG.md with a fix entry. docs/patches/ create a markdown note describing what changed.

6. Commit on c4/auth-fix branch. Do not merge. Do not touch main. Push the branch to origin.

7. Do not break existing auth gating. Do not weaken token check. Do not bypass OPEN_API_ROUTES filter. Keep rate limiting and audit logging intact.

8. Report back with changed files list, test results, reproduction before and after, and any concerns.

Constraints.
- No compound bash commands. Never chain with && or ; or |.
- Use git -C /root/c4-worktree-auth-fix for git. Use npm --prefix /root/c4-worktree-auth-fix for npm.
- Do not modify main directly.
- Use Read Write Edit Grep Glob Bash tools only.
- If spec is ambiguous, pick the conservative option that preserves auth correctness and report your choice.

Start now. Work the routine implement then test then docs then commit then push.
