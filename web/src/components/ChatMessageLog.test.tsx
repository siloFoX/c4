import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import type { UIEvent } from 'react';
import { setLocale } from '../lib/i18n';
import type { ChatMessage } from '../lib/chat-helpers';
import type { BackfillSource } from './ChatHeader';
import ChatMessageLog from './ChatMessageLog';

// ChatMessageLog is a pure-display scroll container for the
// per-worker chat panel. Three render branches: the backfill
// loading skeleton, the empty placeholder, and the populated
// message list (with the optional Load-older header). Parent
// owns the scrollRef, the messages array, the loading flags,
// and the onScroll + onLoadOlder callbacks. Tests drive the
// full prop union directly. A small Wrapper hosts useRef so
// the scrollRef contract holds without parent boilerplate in
// every case.

type LogProps = Parameters<typeof ChatMessageLog>[0];

interface WrapperOverrides {
  workerName?: string;
  backfillLoading?: boolean;
  backfillSource?: BackfillSource;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  messages?: ChatMessage[];
  onScroll?: LogProps['onScroll'];
  onLoadOlder?: LogProps['onLoadOlder'];
}

function Wrapper(props: WrapperOverrides) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ChatMessageLog
      scrollRef={ref}
      onScroll={props.onScroll ?? (() => {})}
      workerName={props.workerName ?? 'w1'}
      backfillLoading={props.backfillLoading ?? false}
      backfillSource={props.backfillSource ?? null}
      hasOlder={props.hasOlder ?? false}
      loadingOlder={props.loadingOlder ?? false}
      messages={props.messages ?? []}
      onLoadOlder={props.onLoadOlder ?? (() => {})}
    />
  );
}

function renderLog(overrides: WrapperOverrides = {}) {
  const user = userEvent.setup();
  const utils = render(<Wrapper {...overrides} />);
  return { ...utils, user };
}

function makeMsg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    role: 'user',
    text: 'hello',
    ts: 0,
    source: 'live',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<ChatMessageLog>', () => {
  // ---- role=log wrapper + aria -----------------------------------

  it('renders the scroll container with role="log"', () => {
    renderLog();
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('marks the scroll container with aria-live="polite"', () => {
    renderLog();
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  });

  it('sets the aria-label to the interpolated "Chat with <worker>" copy', () => {
    renderLog({ workerName: 'alpha' });
    expect(screen.getByRole('log')).toHaveAttribute(
      'aria-label',
      'Chat with alpha',
    );
  });

  // ---- backfill loading branch -----------------------------------

  it('renders the backfill loading copy when backfillLoading=true', () => {
    renderLog({ backfillLoading: true });
    expect(
      screen.getByText(`Loading past messages\u2026`),
    ).toBeInTheDocument();
  });

  it('renders the skeleton list (aria-hidden) when backfillLoading=true', () => {
    const { container } = renderLog({ backfillLoading: true });
    const skeleton = container.querySelector('ul[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.querySelectorAll('li')).toHaveLength(3);
  });

  it('hides the spinner SVG from assistive tech when backfillLoading=true', () => {
    const { container } = renderLog({ backfillLoading: true });
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });

  it('renders the shared <Spinner> component (data-testid=chat-backfill-spinner) when backfillLoading=true', () => {
    renderLog({ backfillLoading: true });
    expect(screen.getByTestId('chat-backfill-spinner')).toBeInTheDocument();
  });

  it('does NOT render the empty placeholder when backfillLoading=true and messages is empty', () => {
    renderLog({ backfillLoading: true, messages: [] });
    expect(
      screen.queryByText(/No messages yet/),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the per-message <ul> when backfillLoading=true (skeleton wins)', () => {
    const { container } = renderLog({
      backfillLoading: true,
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(container.querySelectorAll('ul').length).toBe(1);
    expect(screen.queryByText('hi')).not.toBeInTheDocument();
  });

  // ---- empty branch ----------------------------------------------

  it('renders the empty placeholder when messages is empty and not loading', () => {
    renderLog({ backfillLoading: false, messages: [] });
    expect(
      screen.getByText('No messages yet. Type below to talk to the worker.'),
    ).toBeInTheDocument();
  });

  it('renders the Sparkles icon (aria-hidden) in the empty branch', () => {
    const { container } = renderLog({
      backfillLoading: false,
      messages: [],
    });
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });

  it('does NOT render the message <ul> when messages is empty', () => {
    const { container } = renderLog({
      backfillLoading: false,
      messages: [],
    });
    expect(container.querySelectorAll('ul')).toHaveLength(0);
  });

  // ---- populated branch ------------------------------------------

  it('renders one <li> per message in the populated branch', () => {
    const { container } = renderLog({
      messages: [
        makeMsg({ id: 'm1', text: 'first', role: 'user' }),
        makeMsg({ id: 'm2', text: 'second', role: 'worker' }),
        makeMsg({ id: 'm3', text: 'third', role: 'user' }),
      ],
    });
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const lis = ul!.querySelectorAll('li');
    expect(lis).toHaveLength(3);
  });

  it('renders message text verbatim inside the bubble <pre>', () => {
    renderLog({
      messages: [makeMsg({ id: 'm1', text: 'hello world' })],
    });
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('marks user bubbles with justify-end (right-aligned)', () => {
    const { container } = renderLog({
      messages: [makeMsg({ id: 'm1', text: 'mine', role: 'user' })],
    });
    const li = container.querySelector('ul li') as HTMLElement;
    expect(li.className).toMatch(/justify-end/);
  });

  it('marks worker bubbles with justify-start (left-aligned)', () => {
    const { container } = renderLog({
      messages: [makeMsg({ id: 'm1', text: 'theirs', role: 'worker' })],
    });
    const li = container.querySelector('ul li') as HTMLElement;
    expect(li.className).toMatch(/justify-start/);
  });

  it('labels user bubbles with "You" header text', () => {
    renderLog({
      messages: [makeMsg({ id: 'm1', text: 'hi', role: 'user' })],
    });
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('labels worker bubbles with the workerName header text', () => {
    renderLog({
      workerName: 'agent-x',
      messages: [makeMsg({ id: 'm1', text: 'hi', role: 'worker' })],
    });
    expect(screen.getByText('agent-x')).toBeInTheDocument();
  });

  it('renders the formatted HH:MM:SS timestamp for each bubble', () => {
    // 0 = 1970-01-01T00:00:00Z; in jsdom the local TZ depends on the host.
    // We assert the format via regex instead of an absolute string.
    const { container } = renderLog({
      messages: [makeMsg({ id: 'm1', text: 'hi', ts: 0 })],
    });
    expect(container.textContent ?? '').toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('marks a backfill-source message with the "past" badge label', () => {
    renderLog({
      messages: [
        makeMsg({ id: 'm1', text: 'old one', source: 'backfill' }),
      ],
    });
    expect(screen.getByText('past')).toBeInTheDocument();
  });

  it('does NOT render the "past" label for a live-source message', () => {
    renderLog({
      messages: [
        makeMsg({ id: 'm1', text: 'fresh', source: 'live' }),
      ],
    });
    expect(screen.queryByText('past')).not.toBeInTheDocument();
  });

  it('renders multiple messages in document order (oldest first)', () => {
    renderLog({
      messages: [
        makeMsg({ id: 'a', text: 'first', role: 'user' }),
        makeMsg({ id: 'b', text: 'second', role: 'worker' }),
        makeMsg({ id: 'c', text: 'third', role: 'user' }),
      ],
    });
    const first = screen.getByText('first');
    const second = screen.getByText('second');
    const third = screen.getByText('third');
    expect(
      first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      second.compareDocumentPosition(third) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('appends a new message bubble when messages grows by one (streaming-like rerender)', () => {
    const { rerender, container } = renderLog({
      messages: [makeMsg({ id: 'm1', text: 'one' })],
    });
    expect(container.querySelectorAll('ul li')).toHaveLength(1);
    rerender(
      <Wrapper
        messages={[
          makeMsg({ id: 'm1', text: 'one' }),
          makeMsg({ id: 'm2', text: 'two', role: 'worker' }),
        ]}
      />,
    );
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
  });

  // ---- load-older header (hasOlder + scrollback gate) ------------

  it('does NOT render the Load-older entry when hasOlder=false', () => {
    renderLog({
      hasOlder: false,
      backfillSource: 'scrollback',
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.queryByRole('button', { name: 'Load older' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the Load-older entry when backfillSource is not scrollback', () => {
    renderLog({
      hasOlder: true,
      backfillSource: 'session',
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.queryByRole('button', { name: 'Load older' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the Load-older entry when backfillSource is null', () => {
    renderLog({
      hasOlder: true,
      backfillSource: null,
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.queryByRole('button', { name: 'Load older' }),
    ).not.toBeInTheDocument();
  });

  it('renders the Load-older button when hasOlder=true, backfillSource=scrollback, loadingOlder=false', () => {
    renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      loadingOlder: false,
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.getByRole('button', { name: 'Load older' }),
    ).toBeInTheDocument();
  });

  it('renders the loading copy in place of the Load-older button when loadingOlder=true', () => {
    renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      loadingOlder: true,
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.getByText('Loading older messages...'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load older' }),
    ).not.toBeInTheDocument();
  });

  it('fires onLoadOlder once when the Load-older button is clicked', async () => {
    const onLoadOlder = vi.fn();
    const { user } = renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
      onLoadOlder,
    });
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('fires onLoadOlder on Enter activation when the Load-older button is focused', async () => {
    const onLoadOlder = vi.fn();
    const { user } = renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
      onLoadOlder,
    });
    const btn = screen.getByRole('button', { name: 'Load older' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onLoadOlder on initial render', () => {
    const onLoadOlder = vi.fn();
    renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
      onLoadOlder,
    });
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('renders the Load-older entry as the first <li> when present', () => {
    const { container } = renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      messages: [
        makeMsg({ id: 'm1', text: 'one' }),
        makeMsg({ id: 'm2', text: 'two' }),
      ],
    });
    const lis = container.querySelectorAll('ul li');
    expect(lis).toHaveLength(3); // 1 header + 2 messages
    expect(within(lis[0] as HTMLElement).getByRole('button', { name: 'Load older' })).toBeInTheDocument();
  });

  // ---- onScroll wiring -------------------------------------------

  it('fires onScroll with the scroll event when the container scrolls', () => {
    const onScroll = vi.fn();
    renderLog({ onScroll });
    const log = screen.getByRole('log');
    act(() => {
      log.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onScroll on initial render', () => {
    const onScroll = vi.fn();
    renderLog({ onScroll });
    expect(onScroll).not.toHaveBeenCalled();
  });

  it('forwards a synthetic UIEvent to onScroll (currentTarget snapshotted inside the handler)', () => {
    const captured: EventTarget[] = [];
    const onScroll = vi.fn((e: UIEvent<HTMLDivElement>) => {
      captured.push(e.currentTarget);
    });
    renderLog({ onScroll });
    const log = screen.getByRole('log');
    act(() => {
      log.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(log);
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering from backfillLoading=true to false swaps skeleton for the empty placeholder', () => {
    const { rerender } = renderLog({ backfillLoading: true });
    expect(
      screen.getByText(`Loading past messages\u2026`),
    ).toBeInTheDocument();
    rerender(<Wrapper backfillLoading={false} messages={[]} />);
    expect(
      screen.queryByText(`Loading past messages\u2026`),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('No messages yet. Type below to talk to the worker.'),
    ).toBeInTheDocument();
  });

  it('rerendering from empty to populated swaps placeholder for the message <ul>', () => {
    const { rerender, container } = renderLog({ messages: [] });
    expect(
      screen.getByText('No messages yet. Type below to talk to the worker.'),
    ).toBeInTheDocument();
    rerender(
      <Wrapper messages={[makeMsg({ id: 'm1', text: 'first' })]} />,
    );
    expect(container.querySelectorAll('ul li')).toHaveLength(1);
    expect(
      screen.queryByText(/No messages yet/),
    ).not.toBeInTheDocument();
  });

  it('rerendering with a brand-new messages array replaces the rendered bubbles', () => {
    const { rerender } = renderLog({
      messages: [makeMsg({ id: 'm1', text: 'old' })],
    });
    expect(screen.getByText('old')).toBeInTheDocument();
    rerender(
      <Wrapper messages={[makeMsg({ id: 'm2', text: 'fresh' })]} />,
    );
    expect(screen.queryByText('old')).not.toBeInTheDocument();
    expect(screen.getByText('fresh')).toBeInTheDocument();
  });

  it('rerendering from loadingOlder=false to true swaps the button for the loading copy', () => {
    const { rerender } = renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      loadingOlder: false,
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.getByRole('button', { name: 'Load older' }),
    ).toBeInTheDocument();
    rerender(
      <Wrapper
        hasOlder={true}
        backfillSource="scrollback"
        loadingOlder={true}
        messages={[makeMsg({ id: 'm1', text: 'hi' })]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Load older' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Loading older messages...'),
    ).toBeInTheDocument();
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the empty placeholder copy in Korean when the locale flips', () => {
    renderLog({ messages: [] });
    expect(
      screen.getByText('No messages yet. Type below to talk to the worker.'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText(
        'No messages yet. Type below to talk to the worker.',
      ),
    ).not.toBeInTheDocument();
  });

  it('re-renders the loading copy in Korean when the locale flips', () => {
    renderLog({ backfillLoading: true });
    expect(
      screen.getByText(`Loading past messages\u2026`),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText(`Loading past messages\u2026`),
    ).not.toBeInTheDocument();
  });

  it('re-renders the Load-older button label in Korean when the locale flips', () => {
    renderLog({
      hasOlder: true,
      backfillSource: 'scrollback',
      messages: [makeMsg({ id: 'm1', text: 'hi' })],
    });
    expect(
      screen.getByRole('button', { name: 'Load older' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Load older' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the aria-label in Korean when the locale flips', () => {
    renderLog({ workerName: 'w1' });
    expect(screen.getByRole('log')).toHaveAttribute(
      'aria-label',
      'Chat with w1',
    );
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByRole('log').getAttribute('aria-label')).not.toBe(
      'Chat with w1',
    );
  });
});
