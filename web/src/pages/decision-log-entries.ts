// (v1.11.248, TODO 11.230) Typed mirror of `docs/decisions.md`.
// The DecisionLog page renders these entries verbatim; keep this
// file and the markdown doc in lockstep. A follow-up may collapse
// the duplication by wiring a Vite raw-import against the markdown
// (the docs/ tree currently sits outside the web/ Vite root, so
// pulling it in needs either a `server.fs.allow` tweak or moving
// the file inside web/).

export type DecisionStatus =
  | 'proposed'
  | 'accepted'
  | 'superseded'
  | 'deprecated';

export interface DecisionEntry {
  /** Zero-padded ADR id, e.g. '0001'. Used as the React key. */
  readonly id: string;
  /** Short noun-phrase title. */
  readonly title: string;
  readonly status: DecisionStatus;
  /** ISO date the decision was accepted (or last updated). */
  readonly date: string;
  /** Optional release tag in which the decision shipped. */
  readonly version?: string;
  /** Why the team had to choose -- the forcing function. */
  readonly context: string;
  /** What was decided + the alternative paths that lost out. */
  readonly decision: string;
  /** What downstream effects the team has to live with. */
  readonly consequences: string;
}

export const DECISION_LOG_ENTRIES: readonly DecisionEntry[] = [
  {
    id: '0001',
    title: 'Daemon checkpoint protocol',
    status: 'accepted',
    date: '2026-05-13',
    version: 'v1.11.91',
    context:
      '`c4 daemon stop` used to SIGTERM workers directly, which left active git worktrees + branches as orphans and forced an operator to clean up by hand after every daemon restart. The autonomous loop also lost the lastTask metadata, so a recovery after stop -> start could not tell which task the worker had been on.',
    decision:
      'Adopt a checkpoint-then-stop protocol. Before sending SIGTERM the daemon writes one JSON checkpoint per live worker to `<projectRoot>/.c4/checkpoints/<name>.json` capturing branch, worktree, pid, target, tier, lastTask, and stoppedAt. Worktrees and branches are preserved. `uncaughtException` is explicitly NOT a clean stop -- emergency shutdown paths pass `{ skipCheckpoint: true }` so a wedged process never writes a misleading record.',
    consequences:
      '`c4 daemon start` walks `git worktree list` + the checkpoints directory on startup and re-adopts every worker whose pid is still alive (v1.11.92 reconnect). LOST workers surface in `c4 list` with a reason field so operators see exactly why. Tests cover the checkpoint write path + the reconnect reconcile loop. Removing the protocol would now break the autonomous loop\'s resumability guarantees.',
  },
  {
    id: '0002',
    title: 'Structured logging via pino',
    status: 'accepted',
    date: '2026-05-13',
    version: 'v1.11.100',
    context:
      'Daemon-side logging spilled across `console.log` / `console.error` calls with no consistent shape, no levels, and no rotation. An operator chasing a halt event had to grep a multi-megabyte stdout dump and could not filter by component. CLI-side logging needed to stay on `console.*` so output landed in the operator\'s terminal before the daemon process even started.',
    decision:
      'Introduce `src/logger.js` exposing `getLogger()` + `createLogger()` backed by pino. Every daemon-side line carries a `component` field plus arbitrary structured context. `config.logging` exposes `{ path, level, pretty, maxSize }` so operators can route output to a file with one-step rotation. CLI files (`src/cli.js`, `src/daemon-manager.js`) deliberately keep `console.*`.',
    consequences:
      '`c4 logs --tail --level --component` works against the JSONL file (v1.11.133). pino + pino-pretty are pinned runtime dependencies; the bundle size delta on the daemon side is the cost. An operator who points `logging.path` at `/dev/stdout` gets the legacy behaviour back, so the change is reversible per-install.',
  },
  {
    id: '0003',
    title: 'Canonical 8-color tag palette (signal vs accent)',
    status: 'accepted',
    date: '2026-05-15',
    version: 'v1.11.242',
    context:
      'Chip, Badge, StatusDot, TagInput, and SpecialistsView\'s TIER_BADGE all reached for ad-hoc Tailwind hues (`bg-green-500`, `bg-yellow-500`, `bg-purple-500/10`, ...). Each call site duplicated the same colour intent with a different alpha + dark-mode override, which made theme migration costly and shipped slightly different tones for the same semantic state.',
    decision:
      'Codify a single palette in `web/src/components/ui/tag-palette.ts`: five status hues (brand / success / warning / info / danger) cover the signal vocabulary; three accent hues (accent / magenta / neutral) cover the categorical buckets that should never re-use a signal hue. Every entry pins four surface variants (subtle / solid / outline / dot) to shadcn or chart-N tokens so dark / light theme parity is automatic.',
    consequences:
      '10 ad-hoc colour sites (StatusDot + SpecialistsView TIER_BADGE rows) were swept onto the palette in the same patch. `pickTagTone(seed)` (FNV-1a) gives a deterministic mapping for callers that have a string key but no explicit colour, so future tag-rendering surfaces can avoid the per-call hue choice. The colour-blindness audit (v1.11.247) layered icon glyphs on top of the palette as a secondary signal -- the palette + icon pair is now the standard signal kit.',
  },
  {
    id: '0004',
    title: 'Shared loading-motion contract (skeleton + spinner)',
    status: 'accepted',
    date: '2026-05-15',
    version: 'v1.11.243',
    context:
      'The Skeleton shimmer used Tailwind\'s `animate-pulse` default (`2s cubic-bezier(0.4, 0, 0.6, 1)`) and the Spinner rotate used `animate-spin` (`1s linear`). Neither respected `prefers-reduced-motion`, and the two animations beat against each other on a loading screen because their periods shared no clean ratio. Vestibular-sensitive operators saw the full animation regardless.',
    decision:
      'Pin both timings in a single `web/src/components/ui/loading-motion.ts` contract. Skeleton settles at `1800 ms / cubic-bezier(0.4, 0, 0.2, 1)`; Spinner runs `1200 ms / linear`. The 3:2 period ratio means the spinner completes 1.5 rotations per shimmer pulse -- a felt rhythm without a 1:1 strobe lock. Both primitives plus every Skeleton sub-component read `useReducedMotion()` and drop the animation utility entirely when reduce is preferred. A `data-motion-reduced=""` attribute lands on the animated element for devtools / screenshot verification.',
    consequences:
      'New surfaces that need a loading state import `getLoadingMotionClass / getLoadingMotionStyle` so they inherit the contract automatically. A future migration to ARPS motion tokens (`--duration-*`, `--ease-*`) only touches loading-motion.ts -- no call-site sweep. 8 cross-cutting integration cases verify the contract end-to-end per primitive + per shape variant.',
  },
  {
    id: '0005',
    title: 'Lazy-route prefetch on user-intent signals',
    status: 'accepted',
    date: '2026-05-15',
    version: 'v1.11.246',
    context:
      'The web app code-splits every top-level view through `React.lazy(() => import(...))`. The lazy boundary only triggers the chunk fetch when the route mounts, so the first navigation always stalled on a network round trip + parse. Naively eager-loading every route would defeat the bundle split entirely; a per-route prefetch hook felt like the right middle ground.',
    decision:
      'Build `web/src/lib/route-prefetch.ts` -- a WeakMap-cached `prefetch(loader)` warm-up that calls a `() => import(...)` once per loader identity. Pair it with `prefetchHandlers(loader)` returning the canonical `{ onMouseEnter, onFocus, onTouchStart }` triple so a nav button can spread the wiring. The Tabs primitive grows an optional `onPrefetch?: (value: string) => void`; TopTabs routes it through `prefetch(getTopViewLoader(value))`. AccountMenu\'s Preferences row warms the SettingsView chunk on hover / focus.',
    consequences:
      'Failed prefetches drop their cache entry so a retry on the next hover is possible -- the real lazy boundary surfaces the error to the user, not the prefetch path. Touch users benefit because `onTouchStart` warms the chunk during the ~150 ms before synthetic-click delivery; pointers without hover still get a focus-side prefetch on keyboard navigation. A future expansion can prefetch on `IntersectionObserver` (queue the chunk when the nav item enters the viewport) using the same memoised cache key.',
  },
];
