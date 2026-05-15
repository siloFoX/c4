import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Copy, WrapText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { copyTextToClipboard } from '../../hooks/use-copy';

export interface CodeBlockProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  code?: string;
  language?: string;
  wrap?: boolean;
  defaultWrap?: boolean;
  showCopy?: boolean;
  maxHeight?: string;
  className?: string;
  // (v1.11.271, TODO 11.253) Optional filename header bar. When
  // set, renders an editor-style chrome strip above the code with
  // the file path (mono, muted) on the left. The language label
  // (already supported) docks to the right of the bar instead of
  // overlapping the code. Useful for "look at this snippet from
  // config.json" callouts.
  filename?: string;
  // (v1.11.271, TODO 11.253) Render a numeric line gutter on the
  // left. Numbers track the code lines (split on \n) and stay in
  // sync with `wrap` -- wrapped lines stay aligned with their
  // gutter row so the operator can quote "line 23 is the problem"
  // without losing visual anchor.
  showLineNumbers?: boolean;
}

function resolveText(children: ReactNode, code: string | undefined): string {
  if (typeof code === 'string') return code;
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  return '';
}

export function CodeBlock({
  children,
  code,
  language,
  wrap,
  defaultWrap,
  showCopy,
  maxHeight,
  className,
  filename,
  showLineNumbers,
  ...rest
}: CodeBlockProps) {
  const isControlledWrap = typeof wrap === 'boolean';
  const [internalWrap, setInternalWrap] = useState<boolean>(
    typeof defaultWrap === 'boolean' ? defaultWrap : false,
  );
  const effectiveWrap = isControlledWrap ? (wrap as boolean) : internalWrap;
  const showToggle = !isControlledWrap && typeof defaultWrap === 'boolean';

  // (v1.11.251, TODO 11.233) The inline `navigator.clipboard?.
  // writeText(text)` call site now routes through the shared
  // `copyTextToClipboard()` imperative helper from
  // `hooks/use-copy`. The helper handles the Clipboard API +
  // textarea fallback in one place. The local `copied` pulse
  // stays here (rather than via `useCopy`) so the visual
  // feedback flips synchronously on click -- matching the
  // existing test contract for "Copied chip flips on after
  // click" (the hook variant only flips after the async write
  // resolves, which would break the synchronous assertion).
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const codeRef = useRef<HTMLElement | null>(null);

  const content = code != null ? code : children;
  const copyTextFallback = resolveText(children, code);

  const onCopy = () => {
    const text = codeRef.current?.textContent ?? copyTextFallback;
    void copyTextToClipboard(text);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const onToggleWrap = () => {
    setInternalWrap((v) => !v);
  };

  const copyEnabled = showCopy !== false;
  // (v1.11.271, TODO 11.253) Header bar fires when either the
  // filename or a language label is provided. The header docks
  // the language label to the right edge so it does not overlap
  // the code (the prior absolute-positioned label sat on top of
  // the first line). Copy + wrap buttons move into the header
  // when the bar is present; otherwise they keep the prior
  // absolute-positioned layout.
  const hasHeader = Boolean(filename) || (language && (filename !== undefined));
  const headerShown = Boolean(filename) || language !== undefined;

  // Resolve the code text for line-number gutter. Falls back to
  // the rendered children when `code` is omitted.
  const textForLines: string =
    typeof code === 'string'
      ? code
      : typeof children === 'string'
        ? children
        : typeof children === 'number'
          ? String(children)
          : '';
  const lineCount = showLineNumbers
    ? Math.max(1, textForLines.split('\n').length)
    : 0;

  const actionsRow = (
    <div className="flex items-center gap-1">
      {showToggle ? (
        <button
          type="button"
          onClick={onToggleWrap}
          aria-label={effectiveWrap ? 'Disable wrap' : 'Enable wrap'}
          aria-pressed={effectiveWrap}
          className="inline-flex h-6 w-6 items-center justify-center rounded border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          <WrapText className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {copyEnabled ? (
        <>
          {copied ? (
            <span
              data-code-block-copied
              className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Copied
            </span>
          ) : null}
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy code"
            className="inline-flex h-6 w-6 items-center justify-center rounded border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div
      role="region"
      aria-label={
        filename
          ? `${filename} code block`
          : language
            ? `${language} code block`
            : 'code block'
      }
      className={cn(
        'relative overflow-hidden rounded-md border bg-muted',
        className,
      )}
      {...rest}
    >
      {headerShown ? (
        // (v1.11.271, TODO 11.253) Editor-style chrome bar above
        // the code. Left side: filename (mono, muted). Right side:
        // language label badge + Copy / wrap buttons. The bar
        // shares the same bg-muted family as the code itself so
        // the seam is barely visible -- the rule is the only
        // divider.
        <div
          data-code-block-header
          className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-1.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            {filename ? (
              <span
                data-code-block-filename
                className="truncate font-mono text-[11px] text-muted-foreground"
              >
                {filename}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {language ? (
              <span
                data-code-block-language
                className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {language}
              </span>
            ) : null}
            {actionsRow}
          </div>
        </div>
      ) : (
        <>
          {/* Headerless layout keeps the v1.11.270 absolute-positioned
              language badge + actions row for byte-identical default
              appearance. */}
          {language ? (
            <span
              data-code-block-language
              className="absolute left-2 top-2 z-10 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {language}
            </span>
          ) : null}
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
            {actionsRow}
          </div>
        </>
      )}
      <pre
        tabIndex={0}
        className={cn(
          'font-mono text-sm text-foreground',
          // When the header bar is present, drop the rounded top
          // (header already rounds it) and skip the top border
          // (the rule is the bar's bottom border).
          headerShown
            ? 'border-0'
            : 'rounded-md border bg-muted',
          // Without line numbers: simple padded pre. With line
          // numbers: zero left padding so the gutter can take its
          // own column.
          showLineNumbers ? 'flex p-0' : 'p-3',
          maxHeight && `max-h-${maxHeight} overflow-y-auto`,
        )}
      >
        {showLineNumbers ? (
          <span
            aria-hidden="true"
            data-code-block-line-numbers
            className="select-none border-r border-border bg-muted/40 px-2 py-3 text-right font-mono text-xs text-muted-foreground"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i} className="block">
                {i + 1}
              </span>
            ))}
          </span>
        ) : null}
        <code
          ref={codeRef}
          data-code-block-code
          className={cn(
            'block',
            effectiveWrap ? 'whitespace-pre-wrap' : 'whitespace-pre',
            showLineNumbers && 'flex-1 px-3 py-3',
          )}
        >
          {content}
        </code>
      </pre>
    </div>
  );
}

CodeBlock.displayName = 'CodeBlock';
