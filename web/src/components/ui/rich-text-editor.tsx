import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  ForwardedRef,
  HTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.421, TODO 11.403) RichTextEditor primitive.
//
// Slate-flavoured contract over native contentEditable -- the
// editor uses `document.execCommand` for the canonical inline
// formatting commands (bold / italic / underline / insertUnordered
// List / insertOrderedList / createLink) and ships its own paste
// sanitizer (`sanitizeHtmlForRichText`) so foreign clipboard HTML
// arrives clean. The host owns the HTML string via `value` +
// `onChange`. We do NOT pull in Slate as a runtime dependency --
// the project's "zero new deps" budget is preserved.
//
// Reference: /root/c4/arps-design-system-v1/.

export const DEFAULT_RICH_TEXT_ALLOWED_TAGS = [
  'b',
  'strong',
  'i',
  'em',
  'u',
  'a',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
];

export const DEFAULT_RICH_TEXT_ALLOWED_ATTRS: Record<
  string,
  string[]
> = {
  a: ['href', 'target', 'rel', 'title'],
  span: ['class'],
  div: ['class'],
  p: ['class'],
};

const BLOCKED_URL_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
]);

const SAFE_URL_SCHEMES = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

export function safeRichTextHref(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return trimmed;
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return trimmed;
  const scheme = trimmed.slice(0, colonIdx + 1).toLowerCase();
  if (BLOCKED_URL_SCHEMES.has(scheme)) return null;
  if (SAFE_URL_SCHEMES.has(scheme)) return trimmed;
  return null;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export interface SanitizeOptions {
  allowedTags?: string[];
  allowedAttrs?: Record<string, string[]>;
}

function sanitizeNode(
  node: Node,
  out: Node,
  doc: Document,
  allowedTagsLower: Set<string>,
  allowedAttrs: Record<string, string[]>,
): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ''));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (!allowedTagsLower.has(tag)) {
      // Inline-strip: keep the children but drop the element wrapper.
      sanitizeNode(el, out, doc, allowedTagsLower, allowedAttrs);
      return;
    }
    const clone = doc.createElement(tag);
    const okAttrs = allowedAttrs[tag] ?? [];
    for (const attr of Array.from(el.attributes)) {
      if (!okAttrs.includes(attr.name.toLowerCase())) continue;
      if (attr.name.toLowerCase() === 'href') {
        const safe = safeRichTextHref(attr.value);
        if (safe === null) continue;
        clone.setAttribute('href', safe);
        // Force defensive rel/target for cross-origin links.
        if (!clone.getAttribute('rel')) {
          clone.setAttribute('rel', 'noopener noreferrer');
        }
        if (!clone.getAttribute('target')) {
          clone.setAttribute('target', '_blank');
        }
        continue;
      }
      clone.setAttribute(attr.name, attr.value);
    }
    sanitizeNode(el, clone, doc, allowedTagsLower, allowedAttrs);
    out.appendChild(clone);
  });
}

export function sanitizeHtmlForRichText(
  html: string,
  options?: SanitizeOptions,
): string {
  if (html === '') return '';
  if (typeof document === 'undefined') {
    // Server-side fallback: strip every tag.
    return html.replace(/<[^>]+>/g, '');
  }
  const allowedTagsLower = new Set(
    (options?.allowedTags ?? DEFAULT_RICH_TEXT_ALLOWED_TAGS).map(
      (t) => t.toLowerCase(),
    ),
  );
  const allowedAttrs =
    options?.allowedAttrs ?? DEFAULT_RICH_TEXT_ALLOWED_ATTRS;
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<!doctype html><body>${html}</body>`,
    'text/html',
  );
  const out = doc.createElement('div');
  sanitizeNode(doc.body, out, doc, allowedTagsLower, allowedAttrs);
  return out.innerHTML;
}

export function extractRichTextLinks(html: string): string[] {
  if (html === '') return [];
  if (typeof document === 'undefined') return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<!doctype html><body>${html}</body>`,
    'text/html',
  );
  const out: string[] = [];
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const href = (a as HTMLAnchorElement).getAttribute('href');
    if (href) out.push(href);
  });
  return out;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'createLink';

export const RICH_TEXT_TOOLBAR_COMMANDS: ReadonlyArray<{
  command: RichTextCommand;
  label: string;
  shortcut?: string;
}> = [
  { command: 'bold', label: 'Bold', shortcut: 'Ctrl+B' },
  { command: 'italic', label: 'Italic', shortcut: 'Ctrl+I' },
  { command: 'underline', label: 'Underline', shortcut: 'Ctrl+U' },
  { command: 'insertUnorderedList', label: 'Bullet list' },
  { command: 'insertOrderedList', label: 'Numbered list' },
  { command: 'createLink', label: 'Link' },
];

export interface RichTextEditorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'onPaste'> {
  value: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  className?: string;
  allowedTags?: string[];
  allowedAttrs?: Record<string, string[]>;
  showToolbar?: boolean;
  onLinkRequest?: () => Promise<string | null> | string | null;
  onPaste?: (sanitized: string, raw: string) => void;
}

export const RichTextEditor = forwardRef(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Type here...',
    readOnly = false,
    ariaLabel = 'Rich text editor',
    className,
    allowedTags,
    allowedAttrs,
    showToolbar = true,
    onLinkRequest,
    onPaste,
    ...rest
  }: RichTextEditorProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onPasteRef = useRef(onPaste);
  const onLinkRequestRef = useRef(onLinkRequest);

  useEffect(() => {
    onChangeRef.current = onChange;
    onPasteRef.current = onPaste;
    onLinkRequestRef.current = onLinkRequest;
  }, [onChange, onPaste, onLinkRequest]);

  const sanitizeOptions = useMemo<SanitizeOptions | undefined>(() => {
    if (!allowedTags && !allowedAttrs) return undefined;
    const opts: SanitizeOptions = {};
    if (allowedTags) opts.allowedTags = allowedTags;
    if (allowedAttrs) opts.allowedAttrs = allowedAttrs;
    return opts;
  }, [allowedTags, allowedAttrs]);

  // Sync incoming value into the contenteditable -- but only when
  // it differs from the current innerHTML, so typing does not
  // bounce the caret.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    onChangeRef.current?.(el.innerHTML);
  }, []);

  const exec = useCallback(
    (command: RichTextCommand, arg?: string) => {
      if (readOnly) return;
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      if (typeof document.execCommand !== 'function') return;
      document.execCommand(command, false, arg);
      // After execCommand, propagate the new HTML.
      onChangeRef.current?.(el.innerHTML);
    },
    [readOnly],
  );

  const handleToolbarClick = useCallback(
    async (command: RichTextCommand) => {
      if (command === 'createLink') {
        const handler = onLinkRequestRef.current;
        let raw: string | null = null;
        if (handler) {
          const out = await handler();
          raw = out ?? null;
        } else if (typeof window !== 'undefined' && window.prompt) {
          raw = window.prompt('Link URL');
        }
        if (raw === null) return;
        const safe = safeRichTextHref(raw);
        if (safe === null) return;
        exec('createLink', safe);
      } else {
        exec(command);
      }
    },
    [exec],
  );

  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (readOnly) return;
      event.preventDefault();
      const raw =
        event.clipboardData.getData('text/html') ||
        event.clipboardData.getData('text/plain');
      const sanitized = sanitizeHtmlForRichText(raw, sanitizeOptions);
      // Insert the sanitized HTML at the current selection.
      if (typeof document.execCommand === 'function') {
        document.execCommand('insertHTML', false, sanitized);
      } else {
        // Fallback: replace the whole content.
        const el = editorRef.current;
        if (el) el.innerHTML = sanitized;
      }
      onPasteRef.current?.(sanitized, raw);
      const el = editorRef.current;
      if (el) onChangeRef.current?.(el.innerHTML);
    },
    [readOnly, sanitizeOptions],
  );

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      editorRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const isEmpty = value === '' || value === '<br>' || value === '<p></p>';

  return (
    <div
      data-section="rich-text-editor"
      data-read-only={readOnly ? 'true' : 'false'}
      data-empty={isEmpty ? 'true' : 'false'}
      className={cn(
        'flex flex-col rounded-md border border-border bg-card',
        className,
      )}
      {...rest}
    >
      {showToolbar ? (
        <div
          role="toolbar"
          aria-label="Formatting"
          data-section="rich-text-editor-toolbar"
          className="flex items-center gap-1 border-b border-border px-1 py-0.5"
        >
          {RICH_TEXT_TOOLBAR_COMMANDS.map((entry) => (
            <button
              key={entry.command}
              type="button"
              aria-label={entry.label}
              data-section="rich-text-editor-toolbar-button"
              data-command={entry.command}
              disabled={readOnly}
              onClick={() => {
                void handleToolbarClick(entry.command);
              }}
              className="rounded px-2 py-0.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={setRefs}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-readonly={readOnly ? 'true' : undefined}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-section="rich-text-editor-content"
        data-placeholder={placeholder}
        onInput={handleInput}
        onPaste={handlePaste}
        className={cn(
          'min-h-24 flex-1 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isEmpty &&
            'before:pointer-events-none before:absolute before:text-muted-foreground before:content-[attr(data-placeholder)]',
        )}
      />
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';
