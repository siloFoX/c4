// Render a FTS5-style snippet with `<<token>>` markers as React
// nodes — emits a highlighted span for each captured token,
// preserving the surrounding text. Pure function so the same
// helper works in any list / row / detail surface that renders
// search results.
//
// Used by:
//   - MeetingsView (search rows, snippet line)
//   - future: any place that surfaces FTS5 snippets

import type { ReactNode } from 'react';
import { createElement } from 'react';

export function renderSnippet(snippet: string): ReactNode {
  if (!snippet) return snippet;
  const parts: ReactNode[] = [];
  const re = /<<([^>]+)>>/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(snippet)) !== null) {
    if (m.index > lastIdx) parts.push(snippet.slice(lastIdx, m.index));
    parts.push(
      createElement(
        'span',
        {
          key: key++,
          className: 'rounded bg-amber-500/20 px-0.5 text-amber-700 dark:text-amber-300',
        },
        m[1],
      ),
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < snippet.length) parts.push(snippet.slice(lastIdx));
  return parts.length > 0 ? parts : snippet;
}
