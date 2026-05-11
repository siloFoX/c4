import { describe, it, expect, vi } from 'vitest';
import { dispatchEvent } from './dispatch-event';

describe('dispatchEvent (lib)', () => {
  it('fires a CustomEvent with the given name on window', () => {
    const handler = vi.fn();
    window.addEventListener('c4:test-event', handler);
    try {
      dispatchEvent('c4:test-event');
    } finally {
      window.removeEventListener('c4:test-event', handler);
    }
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]![0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe('c4:test-event');
  });

  it('does not fire events of unrelated names', () => {
    const handler = vi.fn();
    window.addEventListener('c4:other', handler);
    try {
      dispatchEvent('c4:test-event');
    } finally {
      window.removeEventListener('c4:other', handler);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by the synthetic CustomEvent constructor', () => {
    const original = window.CustomEvent;
    // @ts-expect-error — deliberately throw from CustomEvent to exercise catch.
    window.CustomEvent = function () {
      throw new Error('synth-event-blocked');
    };
    try {
      expect(() => dispatchEvent('c4:guarded')).not.toThrow();
    } finally {
      window.CustomEvent = original;
    }
  });
});
