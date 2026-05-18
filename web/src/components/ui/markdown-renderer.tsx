import {
  Fragment,
  forwardRef,
  useCallback,
  useMemo,
} from 'react';
import type {
  ForwardedRef,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { CodeBlock } from './code-block';

// (v1.11.418, TODO 11.400) MarkdownRenderer primitive.
//
// Secure markdown -> React renderer with:
//   - Fenced code blocks routed through `<CodeBlock>` (11.379)
//     for syntax highlighting + copy button parity.
//   - URL sanitization (`safeUrl`) blocking `javascript:`,
//     `data:`, `vbscript:`, `file:`; allowing `http(s)`,
//     `mailto:`, `tel:`, fragment, and relative paths. Failed
//     URLs render as plain text (the link disappears, the label
//     stays).
//   - Optional GFM checkbox list items
//     (`- [ ]` / `- [x]`).
//   - Custom anchor click handler.
//
// Block grammar (intentionally narrow -- the host owns the
// source so the surface is predictable):
//
//   - ATX headings  (# / ## / ... / ######)
//   - Fenced code   (``` / ```lang)
//   - Blockquote    (lines starting with `> `)
//   - Horizontal rule (--- / *** / ___)
//   - Ordered list  (1. ...)
//   - Unordered list (-/*/+ ...)
//   - Checkbox list (- [ ] / - [x])
//   - Paragraph     (everything else, blank-line separated)
//
// Inline grammar:
//
//   - `code`
//   - **bold**, *italic*, _italic_, ~~strikethrough~~
//   - [label](url)
//   - bare http(s) URL auto-link
//
// Reference: /root/c4/arps-design-system-v1/.

export type MarkdownBlockType =
  | 'heading'
  | 'code'
  | 'blockquote'
  | 'hr'
  | 'ul'
  | 'ol'
  | 'checkbox-list'
  | 'paragraph';

export interface MarkdownBlock {
  type: MarkdownBlockType;
  text?: string;
  level?: number;
  language?: string;
  items?: string[];
  checkboxes?: Array<{ checked: boolean; text: string }>;
}

// ---------------------------------------------------------------
// URL sanitization
// ---------------------------------------------------------------

const SAFE_SCHEMES = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

const BLOCKED_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
]);

export function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;
  // Relative paths (/, ./, ../) and hash fragments are safe.
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return trimmed;
  }
  // Anchor or scheme detection -- only `<scheme>:` matters.
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) {
    // No scheme -> treat as relative path.
    return trimmed;
  }
  // Disallow control characters in the scheme.
  const scheme = trimmed.slice(0, colonIdx + 1).toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme)) return null;
  if (SAFE_SCHEMES.has(scheme)) return trimmed;
  // Unknown scheme -- block by default (safer fallback).
  return null;
}

// ---------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------

const FENCE_RE = /^```(\S*)\s*$/;
const HR_RE = /^(\-{3,}|\*{3,}|_{3,})$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const ORDERED_RE = /^(\d+)\.\s+(.*)$/;
const UNORDERED_RE = /^[-*+]\s+(.*)$/;
const CHECKBOX_RE = /^[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

function isFenceStart(line: string): RegExpMatchArray | null {
  return line.match(FENCE_RE);
}

export function parseMarkdownBlocks(
  source: string,
): MarkdownBlock[] {
  const lines = source.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // Skip blank lines between blocks.
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    // Fenced code block (```lang ... ```)
    const fence = isFenceStart(line);
    if (fence) {
      const language = fence[1] ?? '';
      const buf: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i]!;
        if (next.match(FENCE_RE)) {
          i += 1;
          break;
        }
        buf.push(next);
        i += 1;
      }
      blocks.push({
        type: 'code',
        text: buf.join('\n'),
        language,
      });
      continue;
    }
    // Heading
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        text: heading[2]!.trim(),
      });
      i += 1;
      continue;
    }
    // Horizontal rule
    if (HR_RE.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    // Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const next = lines[i]!;
        const m = next.match(BLOCKQUOTE_RE);
        if (!m) break;
        buf.push(m[1] ?? '');
        i += 1;
      }
      blocks.push({ type: 'blockquote', text: buf.join('\n') });
      continue;
    }
    // Checkbox list -- contiguous lines starting with - [ ] or - [x]
    if (CHECKBOX_RE.test(line)) {
      const items: Array<{ checked: boolean; text: string }> = [];
      while (i < lines.length) {
        const m = lines[i]!.match(CHECKBOX_RE);
        if (!m) break;
        const mark = (m[1] ?? '').toLowerCase();
        items.push({
          checked: mark === 'x',
          text: (m[2] ?? '').trim(),
        });
        i += 1;
      }
      blocks.push({ type: 'checkbox-list', checkboxes: items });
      continue;
    }
    // Ordered list
    if (ORDERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i]!.match(ORDERED_RE);
        if (!m) break;
        items.push((m[2] ?? '').trim());
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    // Unordered list (and NOT checkbox)
    if (UNORDERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i]!;
        if (CHECKBOX_RE.test(next)) break;
        const m = next.match(UNORDERED_RE);
        if (!m) break;
        items.push((m[1] ?? '').trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    // Paragraph: collect lines until blank line or block start
    const buf: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i]!;
      if (
        next.trim() === '' ||
        isFenceStart(next) ||
        HEADING_RE.test(next) ||
        HR_RE.test(next.trim()) ||
        BLOCKQUOTE_RE.test(next) ||
        CHECKBOX_RE.test(next) ||
        ORDERED_RE.test(next) ||
        UNORDERED_RE.test(next)
      ) {
        break;
      }
      buf.push(next);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: buf.join(' ') });
  }
  return blocks;
}

// ---------------------------------------------------------------
// Inline renderer
// ---------------------------------------------------------------

interface InlineContext {
  onAnchorClick?: (href: string, event: ReactMouseEvent<HTMLAnchorElement>) => void;
  linkTarget: '_blank' | '_self';
  sanitizeUrl: (url: string) => string | null;
  keyPrefix: string;
}

function renderInline(
  text: string,
  ctx: InlineContext,
): ReactNode[] {
  const out: ReactNode[] = [];
  let bucket = '';
  let counter = 0;
  let i = 0;

  const flush = () => {
    if (bucket !== '') {
      out.push(
        <Fragment key={`${ctx.keyPrefix}-t-${counter++}`}>
          {bucket}
        </Fragment>,
      );
      bucket = '';
    }
  };

  while (i < text.length) {
    const ch = text.charAt(i);
    // `code`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > -1) {
        flush();
        out.push(
          <code
            key={`${ctx.keyPrefix}-c-${counter++}`}
            data-section="markdown-inline-code"
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
            key={`${ctx.keyPrefix}-b-${counter++}`}
            data-section="markdown-inline-bold"
            className="font-semibold"
          >
            {renderInline(text.slice(i + 2, end), {
              ...ctx,
              keyPrefix: `${ctx.keyPrefix}-b${counter}`,
            })}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // ~~strikethrough~~
    if (ch === '~' && text.charAt(i + 1) === '~') {
      const end = text.indexOf('~~', i + 2);
      if (end > -1) {
        flush();
        out.push(
          <del
            key={`${ctx.keyPrefix}-s-${counter++}`}
            data-section="markdown-inline-strike"
            className="text-muted-foreground line-through"
          >
            {renderInline(text.slice(i + 2, end), {
              ...ctx,
              keyPrefix: `${ctx.keyPrefix}-s${counter}`,
            })}
          </del>,
        );
        i = end + 2;
        continue;
      }
    }
    // *italic* / _italic_
    if ((ch === '*' || ch === '_') && text.charAt(i + 1) !== ch) {
      const end = text.indexOf(ch, i + 1);
      if (end > -1 && end > i + 1) {
        flush();
        out.push(
          <em
            key={`${ctx.keyPrefix}-i-${counter++}`}
            data-section="markdown-inline-italic"
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
          const label = text.slice(i + 1, closeTxt);
          const rawUrl = text.slice(closeTxt + 2, closeUrl);
          const safe = ctx.sanitizeUrl(rawUrl);
          flush();
          if (safe === null) {
            // Drop the link; keep the label as plain text.
            out.push(
              <Fragment
                key={`${ctx.keyPrefix}-d-${counter++}`}
              >
                {label}
              </Fragment>,
            );
          } else {
            const handler = ctx.onAnchorClick;
            out.push(
              <a
                key={`${ctx.keyPrefix}-a-${counter++}`}
                href={safe}
                target={ctx.linkTarget}
                rel={
                  ctx.linkTarget === '_blank'
                    ? 'noopener noreferrer'
                    : undefined
                }
                data-section="markdown-link"
                data-href-raw={rawUrl}
                onClick={
                  handler
                    ? (e: ReactMouseEvent<HTMLAnchorElement>) => {
                        handler(safe, e);
                      }
                    : undefined
                }
                className="text-primary underline-offset-4 hover:underline"
              >
                {label}
              </a>,
            );
          }
          i = closeUrl + 1;
          continue;
        }
      }
    }
    // Bare http(s) URL auto-link. Probe from current position
    // for "http://" or "https://" prefix.
    if (
      ch === 'h' &&
      (text.startsWith('http://', i) || text.startsWith('https://', i))
    ) {
      let end = i;
      while (end < text.length) {
        const next = text.charAt(end);
        if (next === ' ' || next === ')' || next === ']' || next === '\n') {
          break;
        }
        end += 1;
      }
      const url = text.slice(i, end);
      const safe = ctx.sanitizeUrl(url);
      if (safe !== null) {
        flush();
        const handler = ctx.onAnchorClick;
        out.push(
          <a
            key={`${ctx.keyPrefix}-u-${counter++}`}
            href={safe}
            target={ctx.linkTarget}
            rel={
              ctx.linkTarget === '_blank'
                ? 'noopener noreferrer'
                : undefined
            }
            data-section="markdown-autolink"
            onClick={
              handler
                ? (e: ReactMouseEvent<HTMLAnchorElement>) => {
                    handler(safe, e);
                  }
                : undefined
            }
            className="text-primary underline-offset-4 hover:underline"
          >
            {url}
          </a>,
        );
        i = end;
        continue;
      }
    }
    bucket += ch;
    i += 1;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export interface MarkdownRendererProps {
  source: string;
  language?: string;
  className?: string;
  ariaLabel?: string;
  enableCheckboxes?: boolean;
  onAnchorClick?: (
    href: string,
    event: ReactMouseEvent<HTMLAnchorElement>,
  ) => void;
  onCheckboxChange?: (index: number, checked: boolean) => void;
  linkTarget?: '_blank' | '_self';
  sanitizeUrl?: (url: string) => string | null;
}

export const MarkdownRenderer = forwardRef(function MarkdownRenderer(
  {
    source,
    language: defaultLanguage = 'text',
    className,
    ariaLabel = 'Markdown content',
    enableCheckboxes = true,
    onAnchorClick,
    onCheckboxChange,
    linkTarget = '_blank',
    sanitizeUrl: sanitize,
  }: MarkdownRendererProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const blocks = useMemo(
    () => parseMarkdownBlocks(source),
    [source],
  );

  const sanitizeFn = useCallback(
    (url: string) => (sanitize ? sanitize(url) : safeUrl(url)),
    [sanitize],
  );

  const inlineCtx = useMemo<InlineContext>(
    () => ({
      linkTarget,
      sanitizeUrl: sanitizeFn,
      keyPrefix: 'r',
      ...(onAnchorClick ? { onAnchorClick } : {}),
    }),
    [onAnchorClick, linkTarget, sanitizeFn],
  );

  // Pre-count checkboxes across the whole document so each one
  // can fire `onCheckboxChange(index, checked)` with a stable id.
  const checkboxOffsets = useMemo<number[]>(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const block of blocks) {
      offsets.push(running);
      if (block.type === 'checkbox-list') {
        running += block.checkboxes?.length ?? 0;
      }
    }
    return offsets;
  }, [blocks]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="markdown-renderer"
      data-block-count={blocks.length}
      className={cn(
        'prose prose-sm max-w-none text-sm text-foreground',
        className,
      )}
    >
      {blocks.map((block, idx) => {
        const key = `b-${idx}`;
        switch (block.type) {
          case 'heading': {
            const Tag = `h${block.level ?? 1}` as
              | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            const sizeClass =
              block.level === 1
                ? 'text-2xl font-bold'
                : block.level === 2
                ? 'text-xl font-semibold'
                : block.level === 3
                ? 'text-lg font-semibold'
                : 'text-base font-semibold';
            return (
              <Tag
                key={key}
                data-section="markdown-heading"
                data-level={block.level ?? 1}
                className={cn(sizeClass, 'mt-4 mb-2')}
              >
                {renderInline(block.text ?? '', {
                  ...inlineCtx,
                  keyPrefix: `${key}-h`,
                })}
              </Tag>
            );
          }
          case 'code': {
            return (
              <CodeBlock
                key={key}
                data-section="markdown-code-block"
                code={block.text ?? ''}
                language={block.language || defaultLanguage}
                className="my-3"
              />
            );
          }
          case 'blockquote': {
            return (
              <blockquote
                key={key}
                data-section="markdown-blockquote"
                className="my-3 border-l-2 border-border bg-muted/30 px-3 py-1 text-muted-foreground"
              >
                {renderInline(block.text ?? '', {
                  ...inlineCtx,
                  keyPrefix: `${key}-bq`,
                })}
              </blockquote>
            );
          }
          case 'hr': {
            return (
              <hr
                key={key}
                data-section="markdown-hr"
                className="my-4 border-border"
              />
            );
          }
          case 'ul': {
            return (
              <ul
                key={key}
                data-section="markdown-ul"
                className="my-2 list-disc pl-6"
              >
                {(block.items ?? []).map((item, itemIdx) => (
                  <li
                    key={`${key}-li-${itemIdx}`}
                    data-section="markdown-li"
                  >
                    {renderInline(item, {
                      ...inlineCtx,
                      keyPrefix: `${key}-l${itemIdx}`,
                    })}
                  </li>
                ))}
              </ul>
            );
          }
          case 'ol': {
            return (
              <ol
                key={key}
                data-section="markdown-ol"
                className="my-2 list-decimal pl-6"
              >
                {(block.items ?? []).map((item, itemIdx) => (
                  <li
                    key={`${key}-li-${itemIdx}`}
                    data-section="markdown-li"
                  >
                    {renderInline(item, {
                      ...inlineCtx,
                      keyPrefix: `${key}-l${itemIdx}`,
                    })}
                  </li>
                ))}
              </ol>
            );
          }
          case 'checkbox-list': {
            if (!enableCheckboxes) {
              // Fall back to a plain unordered list.
              return (
                <ul
                  key={key}
                  data-section="markdown-ul"
                  data-checkbox-disabled="true"
                  className="my-2 list-disc pl-6"
                >
                  {(block.checkboxes ?? []).map((cb, cbIdx) => (
                    <li
                      key={`${key}-li-${cbIdx}`}
                      data-section="markdown-li"
                    >
                      {renderInline(cb.text, {
                        ...inlineCtx,
                        keyPrefix: `${key}-l${cbIdx}`,
                      })}
                    </li>
                  ))}
                </ul>
              );
            }
            const baseIdx = checkboxOffsets[idx] ?? 0;
            return (
              <ul
                key={key}
                data-section="markdown-checkbox-list"
                className="my-2 list-none pl-1"
              >
                {(block.checkboxes ?? []).map((cb, cbIdx) => {
                  const flatIdx = baseIdx + cbIdx;
                  return (
                    <li
                      key={`${key}-cb-${cbIdx}`}
                      data-section="markdown-checkbox-item"
                      data-checkbox-index={flatIdx}
                      data-checked={cb.checked ? 'true' : 'false'}
                      className="flex items-start gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={cb.checked}
                        aria-label={cb.text}
                        data-section="markdown-checkbox"
                        onChange={(e) =>
                          onCheckboxChange?.(
                            flatIdx,
                            e.target.checked,
                          )
                        }
                        readOnly={!onCheckboxChange}
                        className="mt-0.5"
                      />
                      <span data-section="markdown-checkbox-text">
                        {renderInline(cb.text, {
                          ...inlineCtx,
                          keyPrefix: `${key}-cb${cbIdx}`,
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          }
          case 'paragraph':
          default: {
            return (
              <p
                key={key}
                data-section="markdown-paragraph"
                className="my-2 leading-relaxed"
              >
                {renderInline(block.text ?? '', {
                  ...inlineCtx,
                  keyPrefix: `${key}-p`,
                })}
              </p>
            );
          }
        }
      })}
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
