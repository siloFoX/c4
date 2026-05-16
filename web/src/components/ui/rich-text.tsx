import { Fragment, forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.283, TODO 11.265) RichText -- intentionally narrow,
// read-only Markdown-lite renderer for operator-authored notes
// (notification message bodies, settings rule descriptions,
// template descriptions). Built as a safer cousin of the
// existing `lib/markdown.tsx::renderMarkdown()`:
//
// Differences:
//   - SUPPORTED block grammar: paragraphs (separated by blank
//     lines) and bullet / numbered lists. No headings, no fenced
//     code blocks, no blockquotes -- operator notes should not
//     synthesize page-level headings.
//   - SUPPORTED inline grammar: **bold**, *italic*, `code`,
//     [label](url). Nothing else.
//   - NO HTML pass-through: `&`, `<`, `>` render as literal
//     characters via React's default escaping. The renderer
//     never accepts a node-injection escape hatch.
//   - Link URL safety: only `http(s):` and `mailto:` schemes are
//     honoured. Anything else (`javascript:`, `data:`, etc.)
//     renders as a plain `<span>` with the label so the
//     operator still sees the intent, but the dangerous URL is
//     dropped on the floor.
//
// This primitive is the canonical choice for "render whatever
// notes the operator typed into a textarea". For first-party
// daemon-produced markdown (Plan output, Morning report) keep
// using `renderMarkdown` -- it has the richer surface that
// markdown actually generates.

export interface RichTextProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'content'> {
  // The Markdown-lite source string. `null` / `undefined` /
  // empty / whitespace-only renders nothing (the wrapper div
  // is omitted entirely so the layout collapses).
  content: string | null | undefined;
  className?: string;
}

// Accept-list of URL schemes. Everything else is dropped to a
// plain span so the operator's words survive the strip but the
// dangerous link does not.
const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:'] as const;

function isSafeUrl(url: string): boolean {
  if (!url) return false;
  // Relative paths (no scheme) are safe by default -- the URL
  // resolves under the current origin.
  const trimmed = url.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;
  try {
    // `new URL` requires a base for relative inputs; use a
    // placeholder so the parse succeeds and we can read the
    // scheme reliably even when the input is e.g. "mailto:a@b".
    const parsed = new URL(trimmed, 'https://example.invalid');
    return (SAFE_URL_SCHEMES as readonly string[]).includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let bucket = '';
  let i = 0;
  let counter = 0;

  const flush = () => {
    if (bucket) {
      out.push(<Fragment key={`${keyPrefix}-t${counter++}`}>{bucket}</Fragment>);
      bucket = '';
    }
  };

  while (i < text.length) {
    const ch = text.charAt(i);

    // `code`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      // (v1.11.283, TODO 11.265) Require at least 1 character
      // between the backticks. Empty `` ``  `` runs (e.g. the
      // triple-backtick fence at the start of a fenced code
      // block, which RichText does NOT support) fall through to
      // literal-text rendering rather than collapsing to a
      // visually-empty <code> element.
      if (end > i + 1) {
        flush();
        out.push(
          <code
            key={`${keyPrefix}-c${counter++}`}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    // **bold**
    if (ch === '*' && text.charAt(i + 1) === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > -1) {
        flush();
        out.push(
          <strong
            key={`${keyPrefix}-b${counter++}`}
            className="font-semibold text-foreground"
          >
            {renderInline(text.slice(i + 2, end), `${keyPrefix}-b${counter}`)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }

    // *italic*
    if (ch === '*' && text.charAt(i + 1) !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > -1 && end > i + 1) {
        flush();
        out.push(
          <em
            key={`${keyPrefix}-i${counter++}`}
            className="italic"
          >
            {text.slice(i + 1, end)}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }

    // [label](url)
    if (ch === '[') {
      const closeTxt = text.indexOf(']', i + 1);
      if (closeTxt > -1 && text.charAt(closeTxt + 1) === '(') {
        const closeUrl = text.indexOf(')', closeTxt + 2);
        if (closeUrl > -1) {
          flush();
          const label = text.slice(i + 1, closeTxt);
          const url = text.slice(closeTxt + 2, closeUrl);
          if (isSafeUrl(url)) {
            const external = /^https?:/i.test(url);
            const anchorProps: Record<string, string | undefined> = {
              href: url,
              className:
                'text-primary underline-offset-4 hover:underline',
            };
            if (external) {
              anchorProps['target'] = '_blank';
              anchorProps['rel'] = 'noopener noreferrer';
            }
            out.push(
              <a key={`${keyPrefix}-a${counter++}`} {...anchorProps}>
                {label}
              </a>,
            );
          } else {
            // Unsafe URL: drop the link wrapper but keep the
            // label so the operator's intent survives.
            out.push(
              <span
                key={`${keyPrefix}-x${counter++}`}
                data-rich-text-unsafe-link="true"
              >
                {label}
              </span>,
            );
          }
          i = closeUrl + 1;
          continue;
        }
      }
    }

    bucket += ch;
    i++;
  }

  flush();
  return out;
}

// Block-level pass. Walks line-by-line, batching paragraphs and
// list runs.
function renderBlocks(src: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let blockIdx = 0;
  const lines = src.replace(/\r\n/g, '\n').split('\n');

  const at = (idx: number): string => lines[idx] ?? '';
  const isBullet = (s: string) => /^\s*[-*+]\s+/.test(s);
  const isOrdered = (s: string) => /^\s*\d+\.\s+/.test(s);
  const isBlank = (s: string) => s.trim() === '';

  let i = 0;
  while (i < lines.length) {
    const line = at(i);

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Unordered list
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(at(i))) {
        items.push(at(i).replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      const idx = blockIdx++;
      blocks.push(
        <ul
          key={`ul-${idx}`}
          data-rich-text-block="ul"
          className="list-disc space-y-1 pl-6 text-sm text-foreground"
        >
          {items.map((t, j) => (
            <li key={j}>{renderInline(t, `ul-${idx}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (isOrdered(line)) {
      const items: string[] = [];
      while (i < lines.length && isOrdered(at(i))) {
        items.push(at(i).replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      const idx = blockIdx++;
      blocks.push(
        <ol
          key={`ol-${idx}`}
          data-rich-text-block="ol"
          className="list-decimal space-y-1 pl-6 text-sm text-foreground"
        >
          {items.map((t, j) => (
            <li key={j}>{renderInline(t, `ol-${idx}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: collect consecutive non-blank, non-list lines.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = at(i);
      if (isBlank(next) || isBullet(next) || isOrdered(next)) break;
      para.push(next);
      i++;
    }
    const idx = blockIdx++;
    blocks.push(
      <p
        key={`p-${idx}`}
        data-rich-text-block="p"
        className="text-sm leading-relaxed text-foreground"
      >
        {renderInline(para.join(' '), `p-${idx}`)}
      </p>,
    );
  }

  return blocks;
}

export const RichText = forwardRef<HTMLDivElement, RichTextProps>(
  ({ content, className, ...rest }, ref) => {
    if (content == null) return null;
    const trimmed = String(content).trim();
    if (trimmed === '') return null;

    const blocks = renderBlocks(content);
    if (blocks.length === 0) return null;

    return (
      <div
        ref={ref}
        data-section="rich-text"
        className={cn('flex flex-col gap-2', className)}
        {...rest}
      >
        {blocks}
      </div>
    );
  },
);
RichText.displayName = 'RichText';

// Exported helper -- callable from tests and from non-render
// contexts (e.g. a tooltip body that needs the inline parse but
// not the block wrapper). Always returns an array of ReactNode.
export function renderRichInline(text: string): ReactNode[] {
  return renderInline(text, 'inline');
}

// Exported helper for url-safety unit tests.
export { isSafeUrl as isRichTextSafeUrl };
