import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

// (v1.10.676) Extracted from ChatView. Owns the
// auto-scroll-on-new-content state for a scroll
// container. The `bumpKey` arg is anything that changes
// when new content arrives (e.g. messages.length) — the
// layout effect scrolls to bottom whenever it changes
// AND `autoScroll` is currently true. The hook also
// exposes the same `AUTOSCROLL_THRESHOLD_PX` constant
// the legacy code shipped so the onScroll caller can
// classify the user's manual scroll as "at bottom" or
// "scrolled away" using identical math.

export const AUTOSCROLL_THRESHOLD_PX = 24;

interface AutoScrollState {
  autoScroll: boolean;
  setAutoScroll: (next: boolean) => void;
  jumpToBottom: () => void;
  /** True if the scroll container is within AUTOSCROLL_THRESHOLD_PX of bottom. */
  isAtBottom: () => boolean;
}

export function useAutoScroll(args: {
  scrollRef: RefObject<HTMLDivElement | null>;
  bumpKey: number;
}): AutoScrollState {
  const { scrollRef, bumpKey } = args;
  const [autoScroll, setAutoScroll] = useState(true);

  useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [bumpKey, autoScroll, scrollRef]);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  }, [scrollRef]);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return false;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= AUTOSCROLL_THRESHOLD_PX;
  }, [scrollRef]);

  return { autoScroll, setAutoScroll, jumpToBottom, isAtBottom };
}
