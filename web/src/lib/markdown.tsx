import { Fragment, type ReactNode } from 'react';

// Minimal markdown renderer used by Plan + Morning pages. Covers the
// features the daemon actually emits: ATX headings, fenced code blocks,
// unordered/ordered lists, inline code, bold, italic, links, blockquote,
// horizontal rule, and paragraphs. We avoid pulling in react-markdown
// since the project targets zero new runtime deps and the produced
// content is our own -- so the surface is predictable.

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let bucket = '';
  let counter = 0;

  const flush = () => {
    if (bucket) {
      out.push(<Fragment key={`t-${counter++}`}>{bucket}</Fragment>);
      bucket = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];
    // `code`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > -1) {
        flush();
        out.push(
          <code
            key={`c-${counter++}`}
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
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > -1) {
        flush();
        out.push(
          <strong key={`b-${counter++}`} className="font-semibold">
            {renderInline(text.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // *italic* or _italic_
    if ((ch === '*' || ch === '_') && text[i + 1] !== ch) {
      const end = text.indexOf(ch, i + 1);
      if (end > -1 && end > i + 1) {
        flush();
        out.push(
          <em key={`i-${counter++}`} className="italic">
            {text.slice(i + 1, end)}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    // [text](url)
    if (ch === '[') {
      const closeTxt = text.indexOf(']', i + 1);
      if (closeTxt > -1 && text[closeTxt + 1] === '(') {
        const closeUrl = text.indexOf(')', closeTxt + 2);
        if (closeUrl > -1) {
          flush();
          const label = text.slice(i + 1, closeTxt);
          const url = text.slice(closeTxt + 2, closeUrl);
          out.push(
            <a
              key={`a-${counter++}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {label}
            </a>,
          );
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

export function renderMarkdown(src: string): ReactNode {
  if (!src) return null;
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre
          key={`pre-${blockIdx++}`}
          className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs"
        >
          <code data-lang={lang || undefined}>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    // ATX headings
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const sizes = [
        'text-2xl',
        'text-xl',
        'text-lg',
        'text-base',
        'text-sm',
        'text-sm',
      ];
      blocks.push(
        <div
          key={`h-${blockIdx++}`}
          className={`font-semibold text-foreground ${sizes[level - 1] || 'text-base'}`}
          role="heading"
          aria-level={level}
        >
          {renderInline(text)}
        </div>,
      );
      i++;
      continue;
    }
    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${blockIdx++}`} className="border-border" />);
      i++;
      continue;
    }
    // Blockquote
    if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`q-${blockIdx++}`}
          className="border-l-2 border-primary/60 bg-muted/20 px-3 py-2 text-sm italic text-muted-foreground"
        >
          {renderInline(body.join(' '))}
        </blockquote>,
      );
      continue;
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${blockIdx++}`} className="list-disc space-y-1 pl-6 text-sm">
          {items.map((t, j) => (
            <li key={j}>{renderInline(t)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${blockIdx++}`} className="list-decimal space-y-1 pl-6 text-sm">
          {items.map((t, j) => (
            <li key={j}>{renderInline(t)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Paragraph -- collect consecutive non-empty, non-structural lines
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (
        next.trim() === '' ||
        /^```/.test(next) ||
        /^(#{1,6})\s+/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next) ||
        next.startsWith('>')
      ) {
        break;
      }
      para.push(next);
      i++;
    }
    blocks.push(
      <p key={`p-${blockIdx++}`} className="text-sm leading-relaxed text-foreground">
        {renderInline(para.join(' '))}
      </p>,
    );
  }

  return <div className="flex flex-col gap-2">{blocks}</div>;
}
