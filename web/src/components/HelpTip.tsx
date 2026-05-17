import { Fragment, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip } from './ui';
import { cn } from '../lib/cn';

// (v1.11.264, TODO 11.246) Inline contextual help. Renders a small
// HelpCircle glyph that opens a Tooltip on hover / focus, with the
// help copy as the body. Two content shapes:
//   - `content`: a string with a minimal inline markdown subset
//     (**bold** / *italic* / `code` / `[label](url)`). Rendered
//     server-safe via `renderInlineMarkdown` -- no third-party
//     parser, no XSS surface, no `dangerouslySetInnerHTML`.
//   - `children`: a ReactNode for richer tooltip bodies (multi-line
//     content, custom layout, embedded controls).
//   Pass either one; if both are present `children` wins so a
//   caller can override the parsed content per-instance.
//
// Accessibility:
//   - The trigger is a real <button> so it gets focus + keyboard
//     activation for free; the Tooltip primitive then wires
//     aria-describedby + onFocus/onBlur.
//   - `aria-label` defaults to "Help" but can be overridden via
//     `ariaLabel` so screen-reader users hear the surface they are
//     about to learn about ("Help for Density preferences").

const BOLD = /\*\*([^*]+)\*\*/;
const ITALIC = /\*([^*]+)\*/;
const CODE = /`([^`]+)`/;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/;

// Recursive inline-only markdown renderer. Walks a single line at a
// time so we never run into block-level edge cases (no headings, no
// lists, no tables). Order of operations matters: code > bold >
// italic > link so `**foo**` inside `` `code` `` stays literal.
function renderInlineMarkdown(input: string): ReactNode {
  if (typeof input !== 'string') return input;
  if (input === '') return '';
  // 1) Split on backtick code spans first so the inner contents are
  //    rendered verbatim (no further parsing).
  const codeMatch = input.match(CODE);
  if (codeMatch && codeMatch.index !== undefined) {
    const before = input.slice(0, codeMatch.index);
    const after = input.slice(codeMatch.index + codeMatch[0].length);
    return (
      <Fragment>
        {renderInlineMarkdown(before)}
        <code className="rounded bg-muted px-1 font-mono text-[11px]">
          {codeMatch[1]}
        </code>
        {renderInlineMarkdown(after)}
      </Fragment>
    );
  }
  // 2) Bold.
  const boldMatch = input.match(BOLD);
  if (boldMatch && boldMatch.index !== undefined) {
    const before = input.slice(0, boldMatch.index);
    const after = input.slice(boldMatch.index + boldMatch[0].length);
    return (
      <Fragment>
        {renderInlineMarkdown(before)}
        <strong className="font-semibold">{boldMatch[1]}</strong>
        {renderInlineMarkdown(after)}
      </Fragment>
    );
  }
  // 3) Italic.
  const italicMatch = input.match(ITALIC);
  if (italicMatch && italicMatch.index !== undefined) {
    const before = input.slice(0, italicMatch.index);
    const after = input.slice(italicMatch.index + italicMatch[0].length);
    return (
      <Fragment>
        {renderInlineMarkdown(before)}
        <em className="italic">{italicMatch[1]}</em>
        {renderInlineMarkdown(after)}
      </Fragment>
    );
  }
  // 4) Link. Only http(s) / mailto / hash + relative paths are
  //    accepted; anything else (javascript:, data:, etc.) is
  //    rejected to preserve the no-XSS contract.
  const linkMatch = input.match(LINK);
  if (linkMatch && linkMatch.index !== undefined) {
    const before = input.slice(0, linkMatch.index);
    const after = input.slice(linkMatch.index + linkMatch[0].length);
    const url = linkMatch[2]!;
    const safe =
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('mailto:') ||
      url.startsWith('#') ||
      url.startsWith('/');
    if (!safe) {
      return (
        <Fragment>
          {renderInlineMarkdown(before)}
          <span>{linkMatch[1]}</span>
          {renderInlineMarkdown(after)}
        </Fragment>
      );
    }
    return (
      <Fragment>
        {renderInlineMarkdown(before)}
        <a
          href={url}
          target={url.startsWith('http') ? '_blank' : undefined}
          rel={url.startsWith('http') ? 'noreferrer noopener' : undefined}
          className="text-primary underline-offset-2 hover:underline"
        >
          {linkMatch[1]}
        </a>
        {renderInlineMarkdown(after)}
      </Fragment>
    );
  }
  // 5) No markup left -- plain text.
  return input;
}

export { renderInlineMarkdown };

export interface HelpTipProps {
  content?: string;
  children?: ReactNode;
  ariaLabel?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  iconClassName?: string;
  size?: 'sm' | 'md';
  'data-testid'?: string;
}

export default function HelpTip({
  content,
  children,
  ariaLabel,
  placement = 'top',
  className,
  iconClassName,
  size = 'sm',
  'data-testid': testId,
}: HelpTipProps) {
  const body: ReactNode =
    children !== undefined
      ? children
      : content
        ? renderInlineMarkdown(content)
        : null;
  if (body === null) return null;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  return (
    /* (v1.11.294, TODO 11.276) HelpTip is the canonical
       "Settings field hint" surface (Theme / Density / Locale /
       feature-flag rows etc). Opt into the new Tooltip arrow
       + slightly longer hide-delay so operator scans across
       multiple hints feel less jumpy. */
    <Tooltip
      label={body}
      placement={placement}
      arrow
      showDelay={150}
      hideDelay={100}
    >
      <button
        type="button"
        aria-label={ariaLabel ?? 'Help'}
        data-testid={testId ?? 'help-tip'}
        data-section="help-tip"
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className,
        )}
      >
        <HelpCircle
          aria-hidden="true"
          className={cn(iconSize, iconClassName)}
        />
      </button>
    </Tooltip>
  );
}

HelpTip.displayName = 'HelpTip';
