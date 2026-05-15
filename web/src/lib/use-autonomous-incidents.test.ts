import { describe, it, expect } from 'vitest';
import {
  toIncidents,
  type AutonomousStatusPayload,
} from './use-autonomous-incidents';

describe('toIncidents()', () => {
  it('returns an empty list for a null payload', () => {
    expect(toIncidents(null)).toEqual([]);
  });

  it('skips success + dispatch entries (only halt / dispatch-error count)', () => {
    const payload: AutonomousStatusPayload = {
      recent: [
        { type: 'success', id: '1', at: 1000 },
        { type: 'dispatch', id: '2', at: 2000 },
      ],
    };
    expect(toIncidents(payload)).toEqual([]);
  });

  it('extracts halt + dispatch-error rows from recent[]', () => {
    const payload: AutonomousStatusPayload = {
      recent: [
        { type: 'halt', id: 'h1', at: 1000, reason: 'circuit-breaker' },
        { type: 'dispatch-error', id: 'd1', at: 2000, reason: 'bad config' },
        { type: 'success', id: 's1', at: 3000 },
      ],
    };
    const out = toIncidents(payload);
    expect(out.length).toBe(2);
    expect(out[0]?.kind).toBe('dispatch-error');
    expect(out[1]?.kind).toBe('halt');
    expect(out[0]?.at).toBe(2000);
    expect(out[1]?.at).toBe(1000);
  });

  it('extracts escalations[] as kind=escalation incidents', () => {
    const payload: AutonomousStatusPayload = {
      escalations: [
        { id: 7, todoId: '11.99', reason: 'reviewer pause', createdAt: 5000 },
      ],
    };
    const out = toIncidents(payload);
    expect(out.length).toBe(1);
    expect(out[0]?.kind).toBe('escalation');
    expect(out[0]?.id).toBe('11.99');
    expect(out[0]?.reason).toBe('reviewer pause');
  });

  it('merges recent + escalations, sorts newest-first, caps at 5', () => {
    const payload: AutonomousStatusPayload = {
      recent: [
        { type: 'halt', at: 100 },
        { type: 'halt', at: 200 },
        { type: 'dispatch-error', at: 300 },
        { type: 'halt', at: 400 },
      ],
      escalations: [
        { id: 1, createdAt: 50, reason: 'a' },
        { id: 2, createdAt: 500, reason: 'b' },
        { id: 3, createdAt: 600, reason: 'c' },
      ],
    };
    const out = toIncidents(payload);
    expect(out.length).toBe(5);
    // Confirm newest-first ordering by timestamp.
    expect(out.map((i) => i.at)).toEqual([600, 500, 400, 300, 200]);
  });

  it('falls back to "kind" then type when reason is missing', () => {
    const payload: AutonomousStatusPayload = {
      recent: [
        { type: 'halt', at: 100, kind: 'halt-streak' },
        { type: 'halt', at: 200 },
      ],
    };
    const out = toIncidents(payload);
    expect(out[0]?.reason).toBe('halt'); // at=200, no kind/reason -> type
    expect(out[1]?.reason).toBe('halt-streak'); // at=100, kind set
  });

  it('uses null for missing id fields', () => {
    const payload: AutonomousStatusPayload = {
      recent: [{ type: 'halt', at: 100 }],
      escalations: [{ id: 1, createdAt: 200 }],
    };
    const out = toIncidents(payload);
    expect(out[0]?.id).toBeNull();
    expect(out[1]?.id).toBeNull();
  });
});
