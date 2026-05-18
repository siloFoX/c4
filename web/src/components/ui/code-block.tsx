import { Fragment, useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Copy, WrapText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { copyTextToClipboard } from '../../hooks/use-copy';

// (v1.11.397, TODO 11.379) Built-in syntax highlighter.
//
// Plug-in story: callers pass `highlight={(code, language) =>
// ReactNode}` to render their own highlighter (shiki, hljs,
// prism). Pass `highlight={false}` to opt out entirely and
// render plain text.
//
// When `highlight` is undefined and a `language` is supplied,
// the built-in regex tokeniser handles JSON / JavaScript /
// TypeScript / bash. Unknown languages fall through to plain
// text. Keep the tokeniser intentionally small -- adopters who
// need full grammar accuracy plug in shiki via the callback.
//
// Token classes resolve to semantic Tailwind tokens so the
// palette tracks the theme:
//   - keyword:   text-info       (e.g. const, let, if, for)
//   - string:    text-success    (single/double-quoted runs)
//   - number:    text-warning    (numeric literals incl. floats)
//   - comment:   text-muted-foreground italic (line comments)
//   - boolean:   text-info       (true / false / null)
//   - variable:  text-foreground (bash $foo / ${foo})

export type CodeBlockTokenType =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'boolean'
  | 'variable';

export interface CodeBlockToken {
  type: CodeBlockTokenType;
  text: string;
}

const TOKEN_CLASS: Record<CodeBlockTokenType, string> = {
  plain: 'text-foreground',
  keyword: 'text-info',
  string: 'text-success',
  number: 'text-warning',
  comment: 'italic text-muted-foreground',
  boolean: 'text-info',
  variable: 'text-foreground',
};

// (v1.11.397, TODO 11.379) Per-language keyword sets. Lower-
// case keys; the tokeniser matches case-sensitive but the
// keyword regex is built from these arrays.
const JS_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'new', 'class', 'extends', 'super', 'this', 'typeof',
  'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw',
  'async', 'await', 'export', 'import', 'from', 'as', 'default',
  'void', 'delete', 'yield', 'static', 'public', 'private',
  'protected', 'readonly', 'abstract', 'interface', 'enum',
  'implements', 'declare', 'namespace',
];

const TS_KEYWORDS = [
  ...JS_KEYWORDS,
  'type', 'keyof', 'satisfies', 'is', 'never', 'unknown',
  'infer', 'asserts',
];

const BASH_KEYWORDS = [
  'if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for',
  'while', 'until', 'do', 'done', 'in', 'function', 'return',
  'export', 'echo', 'cd', 'pwd', 'ls', 'rm', 'cp', 'mv', 'mkdir',
  'touch', 'cat', 'grep', 'sed', 'awk', 'find', 'set', 'unset',
  'source', 'alias',
];

function escapeRegexAlt(words: readonly string[]): string {
  return words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

// Generic tokeniser: walks the source character by character,
// trying each rule in priority order. Returns the longest match
// or a single-character plain token.
interface Rule {
  type: CodeBlockTokenType;
  re: RegExp;
}

function tokenize(source: string, rules: Rule[]): CodeBlockToken[] {
  const out: CodeBlockToken[] = [];
  let i = 0;
  let buffer = '';
  while (i < source.length) {
    const rest = source.slice(i);
    let matched: { rule: Rule; text: string } | null = null;
    for (const r of rules) {
      r.re.lastIndex = 0;
      const m = r.re.exec(rest);
      if (m && m.index === 0 && m[0].length > 0) {
        matched = { rule: r, text: m[0] };
        break;
      }
    }
    if (matched) {
      if (buffer.length > 0) {
        out.push({ type: 'plain', text: buffer });
        buffer = '';
      }
      out.push({ type: matched.rule.type, text: matched.text });
      i += matched.text.length;
    } else {
      buffer += source[i];
      i += 1;
    }
  }
  if (buffer.length > 0) out.push({ type: 'plain', text: buffer });
  return out;
}

const COMMON_STRING = /^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'/;
const COMMON_NUMBER = /^-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i;

function rulesForJs(language: 'javascript' | 'typescript'): Rule[] {
  const keywords =
    language === 'typescript' ? TS_KEYWORDS : JS_KEYWORDS;
  const kwRe = new RegExp(`^\\b(?:${escapeRegexAlt(keywords)})\\b`);
  return [
    { type: 'comment', re: /^\/\/[^\n]*/ },
    { type: 'comment', re: /^\/\*[\s\S]*?\*\// },
    { type: 'string', re: COMMON_STRING },
    { type: 'string', re: /^`(?:\\.|[^`\\])*`/ },
    { type: 'boolean', re: /^\b(?:true|false|null|undefined)\b/ },
    { type: 'number', re: COMMON_NUMBER },
    { type: 'keyword', re: kwRe },
  ];
}

function rulesForJson(): Rule[] {
  return [
    { type: 'string', re: COMMON_STRING },
    { type: 'boolean', re: /^\b(?:true|false|null)\b/ },
    { type: 'number', re: COMMON_NUMBER },
  ];
}

function rulesForBash(): Rule[] {
  const kwRe = new RegExp(`^\\b(?:${escapeRegexAlt(BASH_KEYWORDS)})\\b`);
  return [
    { type: 'comment', re: /^#[^\n]*/ },
    { type: 'string', re: COMMON_STRING },
    { type: 'variable', re: /^\$\{[^}]*\}/ },
    { type: 'variable', re: /^\$[A-Za-z_][A-Za-z0-9_]*/ },
    { type: 'number', re: COMMON_NUMBER },
    { type: 'keyword', re: kwRe },
  ];
}

// (v1.11.397, TODO 11.379) Language alias map. Operators write
// `language="js"` / `language="ts"` / `language="sh"` more
// often than the canonical names; resolve aliases here.
const LANGUAGE_ALIAS: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
};

// (v1.11.397, TODO 11.379) Pure helper exported for unit
// testing. Returns the token list for the given code +
// language; falls back to a single `plain` token when the
// language is unsupported.
export function highlightCode(
  code: string,
  language?: string,
): CodeBlockToken[] {
  if (!code) return [];
  const raw = (language ?? '').toLowerCase();
  const lang = LANGUAGE_ALIAS[raw] ?? raw;
  let rules: Rule[] | null = null;
  if (lang === 'javascript' || lang === 'typescript') {
    rules = rulesForJs(lang);
  } else if (lang === 'json') {
    rules = rulesForJson();
  } else if (lang === 'bash') {
    rules = rulesForBash();
  }
  if (!rules) return [{ type: 'plain', text: code }];
  return tokenize(code, rules);
}

// (v1.11.397, TODO 11.379) The set of languages the built-in
// highlighter knows about. Useful for tests + downstream
// "show supported languages" listings.
export const CODE_BLOCK_SUPPORTED_LANGUAGES: readonly string[] = [
  'javascript', 'typescript', 'json', 'bash',
];

function renderTokens(tokens: CodeBlockToken[]): ReactNode {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === 'plain') return <Fragment key={i}>{t.text}</Fragment>;
        return (
          <span key={i} data-token={t.type} className={TOKEN_CLASS[t.type]}>
            {t.text}
          </span>
        );
      })}
    </>
  );
}

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
  // (v1.11.397, TODO 11.379) Syntax highlighter plug-in.
  //   - `undefined` (default): use the built-in tokeniser when
  //     `language` matches `CODE_BLOCK_SUPPORTED_LANGUAGES`,
  //     else render plain text.
  //   - `false`: skip highlighting entirely.
  //   - `(code, language?) => ReactNode`: caller-supplied
  //     highlighter (shiki, hljs, prism). The return value
  //     replaces the code body verbatim.
  highlight?: false | ((code: string, language?: string) => ReactNode);
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
  highlight,
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

  // (v1.11.397, TODO 11.379) Resolve the body content. Order of
  // precedence:
  //   1. `highlight={false}` -> plain text (legacy path).
  //   2. `highlight={fn}` + string `code` -> caller-supplied
  //      highlighter output.
  //   3. `language` matches a built-in tokeniser + string `code`
  //      -> built-in `highlightCode()` output.
  //   4. otherwise -> raw `code` or `children` ReactNode.
  const rawText = resolveText(children, code);
  let content: ReactNode;
  if (highlight === false) {
    content = code != null ? code : children;
  } else if (typeof highlight === 'function' && typeof rawText === 'string' && rawText.length > 0) {
    content = highlight(rawText, language);
  } else if (
    typeof code === 'string' &&
    language &&
    CODE_BLOCK_SUPPORTED_LANGUAGES.includes(
      (LANGUAGE_ALIAS[language.toLowerCase()] ?? language.toLowerCase()),
    )
  ) {
    content = renderTokens(highlightCode(code, language));
  } else {
    content = code != null ? code : children;
  }
  const copyTextFallback = rawText;

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
