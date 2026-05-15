import { useCallback } from 'react';
import type { ActionItemType } from '../components/MeetingsView';
import type { ActionItemsResponse } from '../components/MeetingsActionItemsPanel';
import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';

// (v1.10.742) Extracted from MeetingsActionItemsPanel.
// Two export handlers that hand the action-item
// roster off to an external system:
//
//  1. JSON download — emits the full payload via a
//     synthetic <a download> click, then revokes the
//     object URL so the browser doesn't pin the blob.
//  2. Markdown copy — groups items by type with an
//     `## TYPE (count)` heading + bullet body, then
//     writes to navigator.clipboard. Failures are
//     silently swallowed; the panel renders no
//     feedback for the copy path.
//
// Kept generic so a future meeting-detail export
// (the same shape, different filename) can reuse.

const KIND_ORDER: ActionItemType[] = ['decision', 'action', 'todo', 'blocker'];

export interface UseActionItemsExportState {
  handleDownloadJson: () => void;
  handleCopyMd: () => void;
  copied: boolean;
}

export function useActionItemsExport(args: {
  actions: ActionItemsResponse | null;
  meetingId: string;
}): UseActionItemsExportState {
  const { actions, meetingId } = args;
  const { copy, copied } = useCopyToClipboard();

  const handleDownloadJson = useCallback(() => {
    if (!actions) return;
    const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `action-items-${meetingId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [actions, meetingId]);

  const handleCopyMd = useCallback(() => {
    if (!actions) return;
    const lines: string[] = [];
    KIND_ORDER.forEach((k) => {
      const group = actions.items.filter((it) => it.type === k);
      if (group.length === 0) return;
      lines.push(`## ${k.toUpperCase()} (${group.length})`);
      group.forEach((it) => {
        lines.push(`- ${it.text}`);
      });
      lines.push('');
    });
    const md = lines.join('\n').trim();
    void copy(md);
  }, [actions, copy]);

  return { handleDownloadJson, handleCopyMd, copied };
}
