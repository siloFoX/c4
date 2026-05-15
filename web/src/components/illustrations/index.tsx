import type { ReactNode, SVGAttributes } from 'react';

// (TODO 11.66, v1.11.84) Hero illustrations -- a small set of 240x180
// 4:3 monochrome line-art SVGs designed to slot into empty / welcome
// / done states across the c4 web UI. The set leans on the semantic
// palette: every stroke is `currentColor` so the consumer (typically
// EmptyState's icon wrapper, which paints `text-muted-foreground`)
// decides the hue. One accent fill per illustration is allowed and
// uses `hsl(var(--primary) / 0.3)` -- mirrors the `text-primary/30`
// utility so highlights line up with the rest of the ARPS palette.
//
// (v1.11.233, patch 11.215) `size` now accepts a named token --
// 'sm' (64), 'md' (96), 'lg' (128) -- alongside the legacy numeric
// passthrough. Existing call sites that pass a raw number keep
// working unchanged.

export type IllustrationSize = number | 'sm' | 'md' | 'lg';

export interface IllustrationProps {
  className?: string;
  size?: IllustrationSize;
  'aria-hidden'?: boolean;
}

export const ILLUSTRATION_SIZE_TOKENS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 64,
  md: 96,
  lg: 128,
};

export function resolveIllustrationSize(
  size: IllustrationSize | undefined,
  fallback: number,
): number {
  if (size === undefined) return fallback;
  if (typeof size === 'number') return size;
  return ILLUSTRATION_SIZE_TOKENS[size];
}

const HIGHLIGHT_FILL = 'hsl(var(--primary) / 0.3)';
// Legacy accent fill -- the four v1.11.84 hero illustrations were
// authored against the lighter 0.15 ramp. Kept stable so their visual
// weight does not shift; new illustrations use HIGHLIGHT_FILL.
const ACCENT_FILL = 'hsl(var(--primary) / 0.15)';

interface FrameProps extends IllustrationProps {
  label: string;
  defaultSize?: number;
  children: ReactNode;
}

// Internal frame component. Centralises the viewBox + stroke defaults
// + decorative-vs-img branching so each illustration body stays focused
// on its shapes.
function IllustrationFrame({
  className,
  size,
  defaultSize = 160,
  'aria-hidden': ariaHidden = true,
  label,
  children,
}: FrameProps) {
  const resolved = resolveIllustrationSize(size, defaultSize);
  const decorative = ariaHidden !== false;
  const a11y: SVGAttributes<SVGSVGElement> = decorative
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': label };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      width={resolved}
      height={resolved}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...a11y}
    >
      {children}
    </svg>
  );
}

// Empty queue: an open inbox tray with three dotted task placeholders
// floating above. The bottom horizon line + the dotted bracket on the
// right hint at "the queue resumes once items arrive" rather than a
// dead end. Accent fill is the inbox interior so the tray reads as a
// container at a glance.
export function EmptyQueueIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame {...props} label="Empty queue">
      <path
        d="M58 118 L182 118 L182 148 L58 148 Z"
        fill={ACCENT_FILL}
      />
      <path d="M52 118 L188 118" />
      <path d="M52 118 L62 96 L178 96 L188 118" />
      <path d="M52 118 L52 152 L188 152 L188 118" />
      <path d="M86 118 L96 108 L144 108 L154 118" />
      <line x1="78" y1="62" x2="162" y2="62" strokeDasharray="3 5" />
      <line x1="86" y1="74" x2="154" y2="74" strokeDasharray="3 5" />
      <line x1="94" y1="86" x2="146" y2="86" strokeDasharray="3 5" />
      <path d="M196 96 L204 96 L204 148 L196 148" />
      <circle cx="200" cy="62" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="44" cy="80" r="2" fill="currentColor" stroke="none" />
      <line x1="38" y1="158" x2="202" y2="158" strokeDasharray="2 6" />
    </IllustrationFrame>
  );
}

// No workers: a vacant workstation -- single chair pushed in under a
// flat desk, a tiny coffee cup with rising "zzz", a power indicator
// dot off. Reads as "the seat is empty, nothing is running" without
// resorting to a literal "no people" silhouette.
export function NoWorkersIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame {...props} label="No workers running">
      <path
        d="M58 104 L182 104 L182 112 L58 112 Z"
        fill={ACCENT_FILL}
      />
      <line x1="48" y1="112" x2="192" y2="112" />
      <line x1="58" y1="104" x2="182" y2="104" />
      <line x1="70" y1="112" x2="70" y2="148" />
      <line x1="170" y1="112" x2="170" y2="148" />
      <path d="M96 112 L96 134 L144 134 L144 112" />
      <line x1="96" y1="134" x2="96" y2="152" />
      <line x1="144" y1="134" x2="144" y2="152" />
      <rect x="108" y="86" width="14" height="16" rx="2" />
      <path d="M122 90 L128 90 L128 96 L122 96" />
      <path d="M148 84 Q150 78 152 84" strokeDasharray="2 3" />
      <path d="M154 76 Q157 70 160 76" strokeDasharray="2 3" />
      <line x1="42" y1="158" x2="198" y2="158" strokeDasharray="2 6" />
      <circle cx="58" cy="92" r="2" fill="currentColor" stroke="none" />
      <text
        x="158"
        y="68"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="14"
        fontStyle="italic"
        fill="currentColor"
        stroke="none"
      >
        z
      </text>
      <text
        x="170"
        y="58"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="10"
        fontStyle="italic"
        fill="currentColor"
        stroke="none"
      >
        z
      </text>
    </IllustrationFrame>
  );
}

// Welcome / onboarding: a half-open door with a path leading up to
// it and sparkle accents above. Reads as "step in, you're invited"
// without being overly literal. Accent fills the door interior so
// the brand colour hint reads through.
export function WelcomeOnboardingIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame {...props} label="Welcome">
      <path
        d="M104 74 L150 64 L150 148 L104 138 Z"
        fill={ACCENT_FILL}
      />
      <path d="M88 148 L88 74 L150 64 L150 148" />
      <line x1="88" y1="74" x2="150" y2="74" />
      <path d="M104 74 L104 138" />
      <circle cx="108" cy="108" r="1.6" fill="currentColor" stroke="none" />
      <path d="M48 152 L88 148" />
      <path d="M150 148 L196 152" />
      <line x1="64" y1="156" x2="80" y2="156" strokeDasharray="2 4" />
      <line x1="160" y1="156" x2="180" y2="156" strokeDasharray="2 4" />
      <path d="M168 52 L168 64 M162 58 L174 58" />
      <path d="M62 60 L62 70 M57 65 L67 65" />
      <path d="M198 86 L198 94 M194 90 L202 90" />
      <circle cx="120" cy="42" r="2" fill="currentColor" stroke="none" />
      <circle cx="140" cy="48" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="76" cy="42" r="1.5" fill="currentColor" stroke="none" />
    </IllustrationFrame>
  );
}

// All done: a check mark inside a circle with a confetti / sparkle
// halo. Accent fill backs the circle so the success state pops
// against the muted page background without leaving monochrome.
export function AllDoneIllustration(props: IllustrationProps) {
  return (
    <IllustrationFrame {...props} label="All done">
      <circle cx="120" cy="92" r="34" fill={ACCENT_FILL} />
      <circle cx="120" cy="92" r="34" />
      <path d="M104 92 L116 104 L138 80" />
      <path d="M76 56 L76 66 M71 61 L81 61" />
      <path d="M168 56 L168 66 M163 61 L173 61" />
      <path d="M58 116 L58 124 M54 120 L62 120" />
      <path d="M182 116 L182 124 M178 120 L186 120" />
      <circle cx="68" cy="92" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="172" cy="92" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="120" cy="44" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="96" cy="138" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="146" cy="140" r="1.5" fill="currentColor" stroke="none" />
      <line x1="42" y1="158" x2="198" y2="158" strokeDasharray="2 6" />
    </IllustrationFrame>
  );
}

// (v1.11.233, patch 11.215) Search empty: a magnifying glass tilted
// over a stack of three blank list rows. Used in HistoryView when a
// search filter returns nothing. Defaults to the 'md' (96) token so
// the new family reads smaller than the v1.11.84 hero set.
export function SearchEmpty(props: IllustrationProps) {
  return (
    <IllustrationFrame {...props} label="No search results" defaultSize={96}>
      <rect
        x="44"
        y="62"
        width="120"
        height="14"
        rx="3"
        fill={HIGHLIGHT_FILL}
      />
      <rect x="44" y="62" width="120" height="14" rx="3" />
      <rect x="44" y="86" width="120" height="14" rx="3" />
      <rect x="44" y="110" width="120" height="14" rx="3" />
      <line x1="54" y1="69" x2="92" y2="69" strokeDasharray="2 4" />
      <line x1="54" y1="93" x2="80" y2="93" strokeDasharray="2 4" />
      <line x1="54" y1="117" x2="100" y2="117" strokeDasharray="2 4" />
      <circle cx="172" cy="100" r="28" fill={HIGHLIGHT_FILL} />
      <circle cx="172" cy="100" r="28" />
      <line x1="192" y1="120" x2="210" y2="138" />
      <circle cx="172" cy="100" r="2" fill="currentColor" stroke="none" />
    </IllustrationFrame>
  );
}

// (v1.11.233, patch 11.215) Sessions empty: three stacked terminal
// cards with a dashed "no connection" overlay slashed across them.
// Used in the attached-sessions banner when nothing has been
// attached yet.
export function SessionsEmpty(props: IllustrationProps) {
  return (
    <IllustrationFrame {...props} label="No sessions attached" defaultSize={96}>
      <rect
        x="50"
        y="50"
        width="140"
        height="36"
        rx="4"
        fill={HIGHLIGHT_FILL}
      />
      <rect x="50" y="50" width="140" height="36" rx="4" />
      <line x1="50" y1="60" x2="190" y2="60" />
      <circle cx="58" cy="55" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="64" cy="55" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="70" cy="55" r="1.5" fill="currentColor" stroke="none" />
      <path d="M56 72 L60 76 L56 80" />
      <line x1="66" y1="80" x2="86" y2="80" />
      <rect x="44" y="94" width="140" height="32" rx="4" />
      <line x1="44" y1="104" x2="184" y2="104" />
      <circle cx="52" cy="99" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="57" cy="99" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="62" cy="99" r="1.3" fill="currentColor" stroke="none" />
      <rect x="38" y="134" width="140" height="28" rx="4" />
      <line x1="38" y1="144" x2="178" y2="144" />
      <line
        x1="36"
        y1="160"
        x2="208"
        y2="40"
        strokeDasharray="4 4"
      />
    </IllustrationFrame>
  );
}
