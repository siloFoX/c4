import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import {
  AlertCircle,
  Cpu,
  FlaskConical,
  Globe,
  Server,
  Terminal,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.452, TODO 11.434) EnvBadge primitive.
//
// Environment indicator chip (production / staging /
// development / preview / test / local) with a color-coded
// kind class, an optional click-to-switch popover that lists
// the available environments, and a `Banner` sub-component
// that ships a full-width strip suitable for the top of the
// app chrome (`role="banner"`).
//
// Reference: /root/c4/arps-design-system-v1/.

export type EnvKind =
  | 'production'
  | 'staging'
  | 'development'
  | 'preview'
  | 'test'
  | 'local'
  | 'unknown';

export interface EnvBadgeOption {
  env: string;
  label?: string;
  description?: ReactNode;
}

export interface EnvBadgeProps {
  env: string;
  label?: string;
  description?: ReactNode;
  options?: readonly EnvBadgeOption[];
  onSwitch?: (env: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  showLabel?: boolean;
}

export interface EnvBannerProps extends EnvBadgeProps {
  bannerClassName?: string;
  align?: 'left' | 'center' | 'right';
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const ENV_KINDS: readonly EnvKind[] = [
  'production',
  'staging',
  'development',
  'preview',
  'test',
  'local',
  'unknown',
];

const ENV_KIND_ALIASES: Record<string, EnvKind> = {
  production: 'production',
  prod: 'production',
  live: 'production',
  release: 'production',
  staging: 'staging',
  stage: 'staging',
  uat: 'staging',
  qa: 'staging',
  development: 'development',
  dev: 'development',
  preview: 'preview',
  pr: 'preview',
  test: 'test',
  testing: 'test',
  ci: 'test',
  local: 'local',
  localhost: 'local',
};

export function getEnvKind(env: string | undefined | null): EnvKind {
  if (!env) return 'unknown';
  const key = env.toString().trim().toLowerCase();
  return ENV_KIND_ALIASES[key] ?? 'unknown';
}

const ENV_LABELS: Record<EnvKind, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  preview: 'Preview',
  test: 'Test',
  local: 'Local',
  unknown: 'Environment',
};

export function getEnvLabel(env: string | undefined | null): string {
  return ENV_LABELS[getEnvKind(env)];
}

const ENV_BADGE_CLASS: Record<EnvKind, string> = {
  production:
    'bg-destructive/15 text-destructive border-destructive/40',
  staging: 'bg-warning/15 text-warning border-warning/40',
  development: 'bg-primary/15 text-primary border-primary/40',
  preview: 'bg-success/15 text-success border-success/40',
  test: 'bg-muted text-muted-foreground border-border',
  local: 'bg-muted text-foreground border-border',
  unknown: 'bg-muted text-foreground border-border',
};

export function getEnvBadgeClass(env: string | undefined | null): string {
  return ENV_BADGE_CLASS[getEnvKind(env)];
}

const ENV_BANNER_CLASS: Record<EnvKind, string> = {
  production: 'bg-destructive/10 text-destructive',
  staging: 'bg-warning/10 text-warning',
  development: 'bg-primary/10 text-primary',
  preview: 'bg-success/10 text-success',
  test: 'bg-muted text-foreground',
  local: 'bg-muted text-foreground',
  unknown: 'bg-muted text-foreground',
};

export function getEnvBannerClass(env: string | undefined | null): string {
  return ENV_BANNER_CLASS[getEnvKind(env)];
}

export function isProductionEnv(env: string | undefined | null): boolean {
  return getEnvKind(env) === 'production';
}

function getDefaultIcon(kind: EnvKind): ReactNode {
  switch (kind) {
    case 'production':
      return <AlertCircle aria-hidden="true" className="h-3 w-3" />;
    case 'staging':
      return <Server aria-hidden="true" className="h-3 w-3" />;
    case 'development':
      return <Cpu aria-hidden="true" className="h-3 w-3" />;
    case 'preview':
      return <Globe aria-hidden="true" className="h-3 w-3" />;
    case 'test':
      return <FlaskConical aria-hidden="true" className="h-3 w-3" />;
    case 'local':
      return <Terminal aria-hidden="true" className="h-3 w-3" />;
    default:
      return <Globe aria-hidden="true" className="h-3 w-3" />;
  }
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const SIZE_CHIP_CLASS: Record<NonNullable<EnvBadgeProps['size']>, string> =
  {
    sm: 'h-5 px-1.5 text-[10px]',
    md: 'h-6 px-2 text-xs',
    lg: 'h-7 px-2.5 text-sm',
  };

interface EnvBadgeComponent
  extends React.ForwardRefExoticComponent<
    EnvBadgeProps & React.RefAttributes<HTMLDivElement>
  > {
  Banner: typeof EnvBanner;
}

const EnvBadgeBase = forwardRef(function EnvBadge(
  {
    env,
    label,
    description,
    options,
    onSwitch,
    size = 'md',
    className,
    ariaLabel,
    icon,
    showLabel = true,
  }: EnvBadgeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const kind = getEnvKind(env);
  const resolvedLabel = label ?? getEnvLabel(env);
  const isInteractive =
    typeof onSwitch === 'function' && (options?.length ?? 0) > 0;
  const [open, setOpen] = useState<boolean>(false);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        popoverRef.current &&
        target &&
        popoverRef.current.contains(target)
      )
        return;
      if (
        triggerRef.current &&
        target &&
        triggerRef.current.contains(target)
      )
        return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (next: string) => {
      onSwitch?.(next);
      setOpen(false);
    },
    [onSwitch],
  );

  const chipContent = (
    <>
      <span
        aria-hidden="true"
        data-section="env-badge-icon"
        className="inline-flex items-center"
      >
        {icon ?? getDefaultIcon(kind)}
      </span>
      {showLabel ? (
        <span
          data-section="env-badge-label"
          className="font-medium"
        >
          {resolvedLabel}
        </span>
      ) : null}
    </>
  );

  const chipClass = cn(
    'inline-flex items-center gap-1 rounded-full border font-mono uppercase tracking-wide',
    getEnvBadgeClass(env),
    SIZE_CHIP_CLASS[size],
  );

  return (
    <div
      ref={ref}
      role="status"
      aria-label={ariaLabel ?? `${resolvedLabel} environment`}
      data-section="env-badge"
      data-env={env}
      data-env-kind={kind}
      data-size={size}
      data-interactive={isInteractive ? 'true' : 'false'}
      data-open={open ? 'true' : 'false'}
      className={cn('relative inline-flex', className)}
    >
      {isInteractive ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          data-section="env-badge-trigger"
          onClick={() => setOpen((p) => !p)}
          className={cn(
            chipClass,
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          {chipContent}
        </button>
      ) : (
        <span
          data-section="env-badge-trigger"
          className={chipClass}
        >
          {chipContent}
        </span>
      )}
      {description !== undefined && !isInteractive ? (
        <span
          data-section="env-badge-description"
          className="ml-2 text-xs text-muted-foreground"
        >
          {description}
        </span>
      ) : null}
      {isInteractive && open ? (
        <div
          ref={popoverRef}
          role="listbox"
          aria-label={`${resolvedLabel} environment options`}
          data-section="env-badge-popover"
          className="absolute left-0 top-full z-20 mt-1 flex w-48 flex-col gap-0.5 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
        >
          {options!.map((opt) => {
            const optKind = getEnvKind(opt.env);
            const isCurrent = opt.env === env;
            return (
              <button
                key={opt.env}
                type="button"
                role="option"
                aria-selected={isCurrent}
                data-section="env-badge-option"
                data-env={opt.env}
                data-env-kind={optKind}
                data-current={isCurrent ? 'true' : 'false'}
                onClick={() => handleSelect(opt.env)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded px-2 py-1 text-left text-xs hover:bg-muted',
                  isCurrent && 'bg-muted/50 font-medium',
                )}
              >
                <span className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    data-section="env-badge-option-icon"
                    className="inline-flex"
                  >
                    {getDefaultIcon(optKind)}
                  </span>
                  <span data-section="env-badge-option-label">
                    {opt.label ?? getEnvLabel(opt.env)}
                  </span>
                </span>
                {opt.description !== undefined ? (
                  <span
                    data-section="env-badge-option-description"
                    className="pl-4 text-[10px] text-muted-foreground"
                  >
                    {opt.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

EnvBadgeBase.displayName = 'EnvBadge';

// ---------------------------------------------------------------
// Banner variant (top-bar slot, role=banner)
// ---------------------------------------------------------------

export const EnvBanner = forwardRef(function EnvBanner(
  {
    env,
    label,
    description,
    options,
    onSwitch,
    size = 'md',
    className,
    bannerClassName,
    ariaLabel,
    icon,
    align = 'left',
    showLabel = true,
  }: EnvBannerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const kind = getEnvKind(env);
  const resolvedLabel = label ?? getEnvLabel(env);

  return (
    <div
      ref={ref}
      role="banner"
      aria-label={ariaLabel ?? `${resolvedLabel} environment banner`}
      data-section="env-banner"
      data-env={env}
      data-env-kind={kind}
      data-align={align}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-1.5 text-xs',
        getEnvBannerClass(env),
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
        bannerClassName,
      )}
    >
      <EnvBadgeBase
        env={env}
        size={size}
        showLabel={showLabel}
        {...(label !== undefined ? { label } : {})}
        {...(options ? { options } : {})}
        {...(onSwitch ? { onSwitch } : {})}
        {...(icon !== undefined ? { icon } : {})}
        {...(className !== undefined ? { className } : {})}
      />
      {description !== undefined ? (
        <span
          data-section="env-banner-description"
          className="text-xs"
        >
          {description}
        </span>
      ) : null}
    </div>
  );
});

EnvBanner.displayName = 'EnvBanner';

// ---------------------------------------------------------------
// Attach Banner sub-component
// ---------------------------------------------------------------

export const EnvBadge: EnvBadgeComponent = EnvBadgeBase as EnvBadgeComponent;
EnvBadge.Banner = EnvBanner;
