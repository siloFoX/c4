// Single global EventSource shared by all hooks. Components subscribe to
// specific event types via useSSE(types, fn). Auto-reconnect on close.

import { useEffect, useRef } from 'react';

type Listener = (payload: { type: string; [key: string]: unknown }) => void;

interface Bus {
  es: EventSource | null;
  listeners: Map<string, Set<Listener>>; // type → callbacks
}

const bus: Bus = { es: null, listeners: new Map() };

function ensureEs() {
  if (bus.es && bus.es.readyState !== EventSource.CLOSED) return bus.es;
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    let msg: { type?: string };
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || !msg.type) return;
    const subs = bus.listeners.get(msg.type);
    if (subs) for (const fn of subs) { try { fn(msg as { type: string }); } catch {} }
    const all = bus.listeners.get('*');
    if (all) for (const fn of all) { try { fn(msg as { type: string }); } catch {} }
  };
  es.onerror = () => {
    // EventSource auto-reconnects; if it permanently closes, drop the
    // reference so the next subscription rebuilds it.
    if (es.readyState === EventSource.CLOSED) bus.es = null;
  };
  bus.es = es;
  return es;
}

/**
 * useSSE — subscribe to one or more event types. Returns nothing; pass an
 * idempotent callback (e.g. fetchData()).
 *
 * @param types — array of event type strings to listen for. Use ['*']
 *   to subscribe to all events.
 * @param onEvent — invoked once per matching event.
 */
export function useSSE(types: readonly string[], onEvent: Listener) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    ensureEs();
    const handler: Listener = (ev) => cb.current(ev);
    for (const t of types) {
      let set = bus.listeners.get(t);
      if (!set) { set = new Set(); bus.listeners.set(t, set); }
      set.add(handler);
    }
    return () => {
      for (const t of types) {
        const set = bus.listeners.get(t);
        if (set) { set.delete(handler); if (set.size === 0) bus.listeners.delete(t); }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.join('|')]);
}
