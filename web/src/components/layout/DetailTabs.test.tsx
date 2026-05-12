import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DetailTabs, { type DetailMode } from './DetailTabs';
import { setLocale } from '../../lib/i18n';

const ALL_MODES: DetailMode[] = ['terminal', 'chat', 'control'];

beforeEach(() => {
  setLocale('en');
});

describe('<DetailTabs>', () => {
  it('renders a tablist with the "Detail view mode" accessible name', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    expect(
      screen.getByRole('tablist', { name: 'Detail view mode' }),
    ).toBeInTheDocument();
  });

  it('renders one tab per DetailMode option', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    const list = screen.getByRole('tablist', { name: 'Detail view mode' });
    expect(within(list).getAllByRole('tab')).toHaveLength(ALL_MODES.length);
  });

  it('renders the Terminal, Chat, and Control labels from the i18n bundle', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Control' })).toBeInTheDocument();
  });

  it('marks the matching tab as aria-selected when value="terminal"', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Control' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('marks the matching tab as aria-selected when value="chat"', () => {
    render(<DetailTabs value="chat" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('marks the matching tab as aria-selected when value="control"', () => {
    render(<DetailTabs value="control" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Control' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders every tab as type="button" so it never accidentally submits a form', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('type', 'button');
    }
  });

  it('applies the bg-primary/30 active class set to the selected tab', () => {
    render(<DetailTabs value="chat" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveClass(
      'bg-primary/30',
    );
  });

  it('applies the text-muted-foreground class set to non-selected tabs', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveClass(
      'text-muted-foreground',
    );
    expect(screen.getByRole('tab', { name: 'Control' })).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('does not apply the muted class to the selected tab (cn() drops the inactive branch)', () => {
    render(<DetailTabs value="chat" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Chat' })).not.toHaveClass(
      'text-muted-foreground',
    );
  });

  it('fires onChange with the clicked tab value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailTabs value="terminal" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('chat');
  });

  it('fires onChange("control") when the Control tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailTabs value="terminal" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Control' }));
    expect(onChange).toHaveBeenCalledWith('control');
  });

  it('fires onChange("terminal") even when the Terminal tab is already active', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailTabs value="terminal" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Terminal' }));
    expect(onChange).toHaveBeenCalledWith('terminal');
  });

  it('responds to keyboard Enter activation by firing onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailTabs value="terminal" onChange={onChange} />);
    const chat = screen.getByRole('tab', { name: 'Chat' });
    chat.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('chat');
  });

  it('responds to keyboard Space activation by firing onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailTabs value="terminal" onChange={onChange} />);
    const control = screen.getByRole('tab', { name: 'Control' });
    control.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('control');
  });

  it('renders the tablist wrapper with the rounded outer border classes', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    const list = screen.getByRole('tablist', { name: 'Detail view mode' });
    expect(list).toHaveClass('rounded-md');
    expect(list).toHaveClass('border');
    expect(list).toHaveClass('border-border');
    expect(list).toHaveClass('overflow-hidden');
  });

  it('marks every tab icon aria-hidden so the accessible name stays the text label', () => {
    const { container } = render(<DetailTabs value="terminal" onChange={() => {}} />);
    const svgs = container.querySelectorAll('button[role="tab"] svg');
    expect(svgs.length).toBe(ALL_MODES.length);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('cycles through every tab value via successive clicks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DetailTabs value="terminal" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    await user.click(screen.getByRole('tab', { name: 'Control' }));
    await user.click(screen.getByRole('tab', { name: 'Terminal' }));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([
      'chat',
      'control',
      'terminal',
    ]);
  });

  it('re-translates tab labels when the locale flips to ko', () => {
    render(<DetailTabs value="terminal" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    // useLocale subscribes to the c4:locale-changed event and re-renders
    // via setState. Wrap setLocale in act() so the update flushes before
    // we assert the next frame.
    act(() => {
      setLocale('ko');
    });
    // ko bundle defines settings.detail.terminal/chat/control with
    // localized text; English "Chat" should no longer match a tab name.
    expect(screen.queryByRole('tab', { name: 'Chat' })).not.toBeInTheDocument();
  });
});
