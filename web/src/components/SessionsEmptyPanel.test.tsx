import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SessionsEmptyPanel is pure display with two branches gated by
// `showStartFirst`. Parent owns the modal openers (onNewChat,
// onAttachNew). The panel composes SessionsComparisonCard as a
// child in both branches; we stub it to a thin marker so this
// suite exercises only the panel's branching + prop-wiring logic
// without re-exercising the comparison card's own coverage.

let lastComparisonProps: { className?: string } | null = null;

vi.mock('./SessionsComparisonCard', () => ({
  default: (props: { className?: string }) => {
    lastComparisonProps = props;
    return (
      <div
        data-testid="comparison-card"
        data-classname={props.className ?? ''}
      >
        cmp
      </div>
    );
  },
}));

import SessionsEmptyPanel from './SessionsEmptyPanel';

beforeEach(() => {
  setLocale('en');
  lastComparisonProps = null;
});

function renderPanel(
  overrides: Partial<Parameters<typeof SessionsEmptyPanel>[0]> = {},
) {
  const onNewChat = vi.fn();
  const onAttachNew = vi.fn();
  const props = {
    showStartFirst: false,
    onNewChat,
    onAttachNew,
    ...overrides,
  };
  const utils = render(<SessionsEmptyPanel {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onNewChat, onAttachNew, props };
}

describe('<SessionsEmptyPanel>', () => {
  // ---- showStartFirst=false branch (the default "select a session" prompt)

  it('renders the select-prompt copy when showStartFirst=false', () => {
    renderPanel({ showStartFirst: false });
    expect(
      screen.getByText('Select a session to view the conversation.'),
    ).toBeInTheDocument();
  });

  it('does NOT render the start-first title when showStartFirst=false', () => {
    renderPanel({ showStartFirst: false });
    expect(
      screen.queryByText('Start your first conversation'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the start-first body when showStartFirst=false', () => {
    renderPanel({ showStartFirst: false });
    expect(
      screen.queryByText(/No sessions yet/),
    ).not.toBeInTheDocument();
  });

  it('does NOT render any CTA button when showStartFirst=false', () => {
    renderPanel({ showStartFirst: false });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders the comparison card child in the false branch', () => {
    renderPanel({ showStartFirst: false });
    expect(screen.getByTestId('comparison-card')).toBeInTheDocument();
  });

  it('does NOT fire onNewChat in the false branch (no button)', () => {
    const { onNewChat } = renderPanel({ showStartFirst: false });
    expect(onNewChat).not.toHaveBeenCalled();
  });

  it('does NOT fire onAttachNew in the false branch (no button)', () => {
    const { onAttachNew } = renderPanel({ showStartFirst: false });
    expect(onAttachNew).not.toHaveBeenCalled();
  });

  // ---- showStartFirst=true branch (the "Start your first conversation" CTA pair)

  it('renders the start-first title from the i18n bundle', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.getByText('Start your first conversation'),
    ).toBeInTheDocument();
  });

  it('renders the start-first body from the i18n bundle', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.getByText(
        'No sessions yet. Spin up a new chat in this workspace, or attach an existing Claude Code transcript by JSONL path.',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT render the select-prompt copy in the true branch', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.queryByText('Select a session to view the conversation.'),
    ).not.toBeInTheDocument();
  });

  it('renders exactly two CTA buttons in the true branch', () => {
    renderPanel({ showStartFirst: true });
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders the "Start a new chat" button with its i18n aria-label', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.getByRole('button', { name: 'Start a new chat' }),
    ).toBeInTheDocument();
  });

  it('renders the "Attach an existing session" button with its i18n aria-label', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.getByRole('button', { name: 'Attach an existing session' }),
    ).toBeInTheDocument();
  });

  it('renders the new-chat button label inside the new-chat button', () => {
    renderPanel({ showStartFirst: true });
    const btn = screen.getByRole('button', { name: 'Start a new chat' });
    expect(btn).toHaveTextContent('Start a new chat');
  });

  it('renders the attach button label inside the attach button', () => {
    renderPanel({ showStartFirst: true });
    const btn = screen.getByRole('button', {
      name: 'Attach an existing session',
    });
    expect(btn).toHaveTextContent('Attach existing');
  });

  it('renders the comparison card child in the true branch', () => {
    renderPanel({ showStartFirst: true });
    expect(screen.getByTestId('comparison-card')).toBeInTheDocument();
  });

  // ---- callback wiring -------------------------------------------

  it('fires onNewChat once when the new-chat button is clicked', async () => {
    const { user, onNewChat } = renderPanel({ showStartFirst: true });
    await user.click(screen.getByRole('button', { name: 'Start a new chat' }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('fires onNewChat on every new-chat click (no internal latch / debounce)', async () => {
    const { user, onNewChat } = renderPanel({ showStartFirst: true });
    const btn = screen.getByRole('button', { name: 'Start a new chat' });
    await user.click(btn);
    await user.click(btn);
    expect(onNewChat).toHaveBeenCalledTimes(2);
  });

  it('fires onAttachNew once when the attach button is clicked', async () => {
    const { user, onAttachNew } = renderPanel({ showStartFirst: true });
    await user.click(
      screen.getByRole('button', { name: 'Attach an existing session' }),
    );
    expect(onAttachNew).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachNew on every attach click (no internal latch / debounce)', async () => {
    const { user, onAttachNew } = renderPanel({ showStartFirst: true });
    const btn = screen.getByRole('button', {
      name: 'Attach an existing session',
    });
    await user.click(btn);
    await user.click(btn);
    expect(onAttachNew).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire onAttachNew when the new-chat button is clicked', async () => {
    const { user, onNewChat, onAttachNew } = renderPanel({
      showStartFirst: true,
    });
    await user.click(screen.getByRole('button', { name: 'Start a new chat' }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onAttachNew).not.toHaveBeenCalled();
  });

  it('does NOT fire onNewChat when the attach button is clicked', async () => {
    const { user, onNewChat, onAttachNew } = renderPanel({
      showStartFirst: true,
    });
    await user.click(
      screen.getByRole('button', { name: 'Attach an existing session' }),
    );
    expect(onAttachNew).toHaveBeenCalledTimes(1);
    expect(onNewChat).not.toHaveBeenCalled();
  });

  it('fires onNewChat on Enter key activation when the new-chat CTA is focused', async () => {
    const { user, onNewChat } = renderPanel({ showStartFirst: true });
    const btn = screen.getByRole('button', { name: 'Start a new chat' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachNew on Space key activation when the attach CTA is focused', async () => {
    const { user, onAttachNew } = renderPanel({ showStartFirst: true });
    const btn = screen.getByRole('button', {
      name: 'Attach an existing session',
    });
    btn.focus();
    await user.keyboard(' ');
    expect(onAttachNew).toHaveBeenCalledTimes(1);
  });

  // ---- icons ------------------------------------------------------

  it('renders both Plus decorative icons as aria-hidden in the true branch', () => {
    const { container } = renderPanel({ showStartFirst: true });
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('renders no decorative svg icons in the false branch', () => {
    const { container } = renderPanel({ showStartFirst: false });
    // ComparisonCard is mocked, so the only svgs would come from the
    // panel itself in the false branch. There are none.
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(0);
  });

  // ---- branch switching ------------------------------------------

  it('switches from false to true branch when showStartFirst flips', () => {
    const { rerender, props } = renderPanel({ showStartFirst: false });
    expect(
      screen.queryByText('Start your first conversation'),
    ).not.toBeInTheDocument();
    rerender(<SessionsEmptyPanel {...props} showStartFirst={true} />);
    expect(
      screen.getByText('Start your first conversation'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Select a session to view the conversation.'),
    ).not.toBeInTheDocument();
  });

  it('switches from true to false branch when showStartFirst flips', () => {
    const { rerender, props } = renderPanel({ showStartFirst: true });
    expect(
      screen.getByText('Start your first conversation'),
    ).toBeInTheDocument();
    rerender(<SessionsEmptyPanel {...props} showStartFirst={false} />);
    expect(
      screen.queryByText('Start your first conversation'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Select a session to view the conversation.'),
    ).toBeInTheDocument();
  });

  it('keeps the comparison card rendered across the branch flip', () => {
    const { rerender, props } = renderPanel({ showStartFirst: false });
    expect(screen.getByTestId('comparison-card')).toBeInTheDocument();
    rerender(<SessionsEmptyPanel {...props} showStartFirst={true} />);
    expect(screen.getByTestId('comparison-card')).toBeInTheDocument();
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the new-chat button', () => {
    const { rerender, props } = renderPanel({ showStartFirst: true });
    rerender(<SessionsEmptyPanel {...props} />);
    expect(
      screen.getAllByRole('button', { name: 'Start a new chat' }),
    ).toHaveLength(1);
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the select-prompt copy in Korean when the locale flips', () => {
    renderPanel({ showStartFirst: false });
    expect(
      screen.getByText('Select a session to view the conversation.'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('Select a session to view the conversation.'),
    ).not.toBeInTheDocument();
  });

  it('re-renders the start-first title in Korean when the locale flips', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.getByText('Start your first conversation'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('Start your first conversation'),
    ).not.toBeInTheDocument();
  });

  it('re-renders the CTA aria-label in Korean when the locale flips', () => {
    renderPanel({ showStartFirst: true });
    expect(
      screen.getByRole('button', { name: 'Start a new chat' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Start a new chat' }),
    ).not.toBeInTheDocument();
  });
});
