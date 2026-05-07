import type { JSX } from 'react';
import { cn } from './cn';
import type { TurnTokens } from '../components/ConversationView';

// (v1.10.560) Extracted from ConversationView. Pure render +
// format helpers — markdown rendering, inline formatter,
// tool-arg / tool-result stringification, token / time
// formatters. No JSX state, just transformation. Drops ~250
// lines of helper code from ConversationView.

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatTokens(t: TurnTokens): string {
  const parts: string[] = [];
  if (t.input) parts.push(`${t.input.toLocaleString()} in`);
  if (t.output) parts.push(`${t.output.toLocaleString()} out`);
  if (t.cacheRead) parts.push(`${t.cacheRead.toLocaleString()} cache-r`);
  if (t.cacheCreate) parts.push(`${t.cacheCreate.toLocaleString()} cache-w`);
  return parts.join(' ');
}

// Minimal markdown renderer - handles paragraphs, headings, fenced
// code blocks, inline code, bold, italic, unordered lists, and block
// quotes. Deliberately zero-dep so the bundle stays lean per the 8.18
// spec. Assistant output shape covers ~95% with these primitives.
export function renderMarkdown(source: string): JSX.Element[] {
  if (!source) return [];
  const out: JSX.Element[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let key = 0;
  // (v1.10.522) Bounds-checked accessor — under
  // noUncheckedIndexedAccess, lines[i] returns string | undefined.
  // We always guard with i < lines.length, so '' fallback is
  // unreachable at runtime.
  const at = (idx: number): string => lines[idx] ?? '';

  while (i < lines.length) {
    const line = at(i);
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(at(i))) {
        buf.push(at(i));
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing fence
      out.push(
        <pre
          key={`md-${key++}`}
          className="my-2 overflow-x-auto rounded-md border border-border bg-muted/60 px-3 py-2 text-xs leading-relaxed"
        >
          <code className={cn('font-mono text-foreground', lang && `language-${lang}`)}>
            {buf.join('\n')}
          </code>
        </pre>,
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = (headingMatch[1] ?? '').length;
      const text = headingMatch[2] ?? '';
      const sizeClass =
        level <= 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
      out.push(
        <p
          key={`md-${key++}`}
          className={cn('my-2 font-semibold text-foreground', sizeClass)}
        >
          {renderInline(text)}
        </p>,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(at(i))) {
        buf.push(at(i).replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(
        <blockquote
          key={`md-${key++}`}
          className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
        >
          {renderInline(buf.join('\n'))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(at(i))) {
        items.push(at(i).replace(/^[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul key={`md-${key++}`} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(at(i))) {
        items.push(at(i).replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      out.push(
        <ol key={`md-${key++}`} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Consecutive non-empty lines coalesce into one paragraph.
    const paraBuf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      at(i).trim() &&
      !/^```/.test(at(i)) &&
      !/^#{1,6}\s/.test(at(i)) &&
      !/^>\s?/.test(at(i)) &&
      !/^[-*]\s+/.test(at(i)) &&
      !/^\d+\.\s+/.test(at(i))
    ) {
      paraBuf.push(at(i));
      i += 1;
    }
    out.push(
      <p key={`md-${key++}`} className="my-2 whitespace-pre-wrap leading-relaxed">
        {renderInline(paraBuf.join('\n'))}
      </p>,
    );
  }
  return out;
}

// Inline formatter for **bold**, *italic*, `code`, and [link](url). Not
// a full CommonMark - intentionally - but covers what Claude emits.
export function renderInline(text: string): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  let i = 0;
  let keyIdx = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      nodes.push(<span key={`t-${keyIdx++}`}>{buf}</span>);
      buf = '';
    }
  };
  while (i < text.length) {
    const rest = text.slice(i);
    const codeMatch = rest.match(/^`([^`]+)`/);
    if (codeMatch) {
      flush();
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {codeMatch[1]}
        </code>,
      );
      i += codeMatch[0].length;
      continue;
    }
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      flush();
      nodes.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold">
          {boldMatch[1]}
        </strong>,
      );
      i += boldMatch[0].length;
      continue;
    }
    const italicMatch = rest.match(/^\*([^*\n]+)\*/);
    if (italicMatch) {
      flush();
      nodes.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {italicMatch[1]}
        </em>,
      );
      i += italicMatch[0].length;
      continue;
    }
    const linkMatch = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      flush();
      nodes.push(
        <a
          key={`l-${keyIdx++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {linkMatch[1]}
        </a>,
      );
      i += linkMatch[0].length;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return nodes;
}

export function truncate(text: string, max = 400): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function formatToolArgs(args: unknown): string {
  if (args === null || args === undefined) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

export function formatToolResult(result: unknown): string {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result
      .map((chunk) => {
        if (chunk && typeof chunk === 'object' && 'text' in (chunk as Record<string, unknown>)) {
          return String((chunk as { text?: unknown }).text ?? '');
        }
        return typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
      })
      .filter(Boolean)
      .join('\n');
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}
