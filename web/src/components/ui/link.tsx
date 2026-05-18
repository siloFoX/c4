import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.328, TODO 11.310) Link -- canonical styled
// `<a>` primitive with internal/external auto-detection.
//
// Every anchor in the c4 web app needs the same set of
// affordances:
//   - A consistent text colour + hover underline based on
//     the design tokens (so the dark-mode / light-mode
//     flip works without editing every link).
//   - External links automatically open in a new tab
//     (`target="_blank"`) with `rel="noopener noreferrer"`
//     so a malicious destination cannot reach back via
//     `window.opener` and `Referer` is not leaked.
//   - External links get a trailing icon so operators
//     see they will leave the app before clicking.
//
// Today these affordances are inlined at every call
// site (raw `<a>` tags with bespoke className strings)
// or skipped entirely (a couple of external links in
// the docs surface omit `rel="noopener"` and rely on the
// "new tab" intent alone). Patch 11.310 ships the
// primitive so every link reaches for the same shape.
//
// Variants:
//   - `default` -- primary-coloured link with underline
//     on hover. Use for the main "action" links (CTAs,
//     "Learn more" affordances, "View details" links).
//   - `muted` -- muted-foreground link with underline
//     on hover. Use for secondary / metadata links
//     (timestamps that link to a detail page, breadcrumb
//     segments rendered as anchors).
//   - `inline` -- inherit text colour, always-underlined
//     so the link is identifiable inside running prose.
//     Use for "click here" affordances inside a
//     paragraph.

export type LinkVariant = 'default' | 'muted' | 'inline';

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  // Anchor target. Strings starting with a URL scheme
  // (`https://`, `http://`, `mailto:`, etc) OR `//` are
  // treated as external; everything else (relative
  // paths, anchor fragments, absolute-but-same-origin
  // paths) is treated as internal.
  href: string;
  // Force the internal/external classification when
  // auto-detection guesses wrong (e.g. an internal route
  // that happens to start with an absolute URL through a
  // reverse proxy). Default `undefined` (auto-detect).
  external?: boolean;
  // Hide the trailing external icon. Defaults to false
  // when external = true; pass `true` to suppress it
  // for compact link rows where the visual indicator
  // would be redundant. Has no effect on internal
  // links (they never render the icon).
  hideExternalIcon?: boolean;
  // Variant -- see module-level JSDoc above.
  variant?: LinkVariant;
  // Accessible label override. When the link content is
  // an icon-only flourish (rare), pass `aria-label` to
  // give it a non-blank accessible name. Standard
  // a11y -- not a new prop, just documented here so the
  // adopter contract is explicit.
  children: ReactNode;
}

const VARIANT_CLASSES: Record<LinkVariant, string> = {
  default:
    'text-primary hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
  muted:
    'text-muted-foreground hover:text-foreground hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
  inline:
    'text-inherit underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
};

// (v1.11.328, TODO 11.310) External-link detection.
// We treat the following hrefs as external:
//   - Any URL with an explicit scheme (`https:`,
//     `http:`, `mailto:`, `tel:`, `ftp:`, etc).
//   - Protocol-relative URLs (`//example.com`).
// Everything else (relative paths, absolute paths
// without a scheme, anchor fragments) is internal.
//
// The detector is intentionally permissive about the
// scheme shape: any `[a-zA-Z][a-zA-Z0-9+\-.]*:` prefix
// counts. This catches both the common cases
// (`https:`, `mailto:`) and the long tail (`obsidian:`,
// `vscode:`) without needing an explicit allowlist.
const EXTERNAL_RE = /^(?:[a-zA-Z][a-zA-Z0-9+\-.]*:|\/\/)/;

export function isExternalHref(href: string): boolean {
  if (typeof href !== 'string') return false;
  return EXTERNAL_RE.test(href);
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      href,
      external,
      hideExternalIcon = false,
      variant = 'default',
      className,
      target,
      rel,
      children,
      ...props
    },
    ref,
  ) => {
    const isExternal =
      external !== undefined ? external : isExternalHref(href);

    // External links open in a new tab by default. If
    // the caller passed an explicit `target`, honour
    // it (e.g. `_self` for an external link that
    // should still navigate in-place).
    const resolvedTarget = target ?? (isExternal ? '_blank' : undefined);

    // rel is layered: callers can append their own rel
    // tokens, but the security tokens (noopener,
    // noreferrer) are added unconditionally for
    // external new-tab links because the cost of NOT
    // having them outweighs any caller preference.
    let resolvedRel: string | undefined;
    if (isExternal && resolvedTarget === '_blank') {
      const tokens = new Set<string>();
      tokens.add('noopener');
      tokens.add('noreferrer');
      if (rel) {
        for (const t of rel.split(/\s+/)) {
          if (t) tokens.add(t);
        }
      }
      resolvedRel = Array.from(tokens).join(' ');
    } else if (rel) {
      resolvedRel = rel;
    }

    const showExternalIcon =
      isExternal && !hideExternalIcon;

    return (
      <a
        ref={ref}
        href={href}
        target={resolvedTarget}
        rel={resolvedRel}
        data-section="link"
        data-variant={variant}
        data-external={isExternal ? 'true' : 'false'}
        className={cn(
          'inline-flex items-center gap-1',
          VARIANT_CLASSES[variant],
          className,
        )}
        {...props}
      >
        <span data-section="link-content">{children}</span>
        {showExternalIcon && (
          <ExternalLinkIcon
            data-section="link-external-icon"
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
          />
        )}
      </a>
    );
  },
);
Link.displayName = 'Link';
