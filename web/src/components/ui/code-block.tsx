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

  return (
    <div
      role="region"
      aria-label={language ? `${language} code block` : 'code block'}
      className={cn('relative', className)}
      {...rest}
    >
      {language ? (
        <span
          data-code-block-language
          className="absolute left-2 top-2 z-10 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {language}
        </span>
      ) : null}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
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
      <pre
        tabIndex={0}
        className={cn(
          'rounded-md border bg-muted p-3 font-mono text-sm text-foreground',
          maxHeight && `max-h-${maxHeight} overflow-y-auto`,
        )}
      >
        <code
          ref={codeRef}
          data-code-block-code
          className={cn(
            'block',
            effectiveWrap ? 'whitespace-pre-wrap' : 'whitespace-pre',
          )}
        >
          {content}
        </code>
      </pre>
    </div>
  );
}

CodeBlock.displayName = 'CodeBlock';
