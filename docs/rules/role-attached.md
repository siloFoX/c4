# role-attached pinned rules

Minimal persistent rules for attached external Claude Code sessions. Applied
as the default template when the worker was imported via `c4 attach` or
created with `--pin-role attached`. Attached sessions keep their own
conventions, so this template is intentionally lighter than role-worker or
role-manager.

- Do not push to `main` from an attached session. Use a feature branch.
- Avoid compound shell commands (`&&`, `;`, `|`). Split into separate
  invocations. Use `git -C <path>` rather than `cd` plus `git`.
- When c4 re-injects these rules, acknowledge with a short "rules refreshed"
  line so the manager can confirm delivery.
