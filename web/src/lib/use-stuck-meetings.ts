import { useSilentPoll } from './use-silent-poll';
import type { StuckResponse } from '../components/MeetingsStuckBanner';

// (v1.10.627) Extracted from MeetingsView. Phase 6.15 stuck-
// meetings poll — fetch /api/meetings/stuck?hours=1 every 60s,
// silently fall back to null on older daemons.
// (v1.10.743) Polling shape lifted to lib/use-silent-poll.

export function useStuckMeetings(): StuckResponse | null {
  return useSilentPoll<StuckResponse>('/api/meetings/stuck?hours=1', 60000);
}
