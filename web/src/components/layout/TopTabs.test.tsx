import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopTabs, { type TopView } from './TopTabs';

const ALL_VIEWS: TopView[] = [
  'workers',
  'history',
  'sessions',
  'meetings',
  'specialists',
  'wiki',
  'autonomous',
  'chat',
  'workflows',
  'features',
  'settings',
];

describe('<TopTabs>', () => {
  it('renders a tablist with one tab per TopView option', () => {
    render(<TopTabs value="workers" onChange={() => {}} />);
    const list = screen.getByRole('tablist', { name: 'Top view' });
    expect(within(list).getAllByRole('tab')).toHaveLength(ALL_VIEWS.length);
  });

  it('marks the tab matching the value prop as aria-selected', () => {
    render(<TopTabs value="history" onChange={() => {}} />);
    const history = screen.getByRole('tab', { name: 'History' });
    expect(history).toHaveAttribute('aria-selected', 'true');
    const workers = screen.getByRole('tab', { name: 'Workers' });
    expect(workers).toHaveAttribute('aria-selected', 'false');
  });

  it('applies the active class set to the selected tab and the muted set to others', () => {
    render(<TopTabs value="settings" onChange={() => {}} />);
    const settings = screen.getByRole('tab', { name: 'Settings' });
    expect(settings).toHaveClass('bg-primary/30');
    const workers = screen.getByRole('tab', { name: 'Workers' });
    expect(workers).toHaveClass('text-muted-foreground');
  });

  it('renders each tab as type="button" so it never accidentally submits a form', () => {
    render(<TopTabs value="workers" onChange={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    for (const tab of tabs) {
      expect(tab).toHaveAttribute('type', 'button');
    }
  });

  it('plumbs an aria-label and a title onto every tab so icon-only sm displays stay readable', () => {
    render(<TopTabs value="workers" onChange={() => {}} />);
    const chat = screen.getByRole('tab', { name: 'Chat' });
    expect(chat).toHaveAttribute('aria-label', 'Chat');
    expect(chat).toHaveAttribute('title', 'Chat');
  });

  it('fires onChange with the clicked tab id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TopTabs value="workers" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('chat');
  });

  it('fires onChange even when the clicked tab is already active', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TopTabs value="workers" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Workers' }));
    expect(onChange).toHaveBeenCalledWith('workers');
  });

  it('omits a badge node when no badges prop is passed', () => {
    render(<TopTabs value="workers" onChange={() => {}} />);
    const meetings = screen.getByRole('tab', { name: 'Meetings' });
    expect(within(meetings).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('renders a badge with the count when the matching key is set', () => {
    render(
      <TopTabs
        value="workers"
        onChange={() => {}}
        badges={{ meetings: { count: 3, tone: 'amber' } }}
      />,
    );
    const meetings = screen.getByRole('tab', { name: 'Meetings' });
    expect(within(meetings).getByText('3')).toBeInTheDocument();
  });

  it('clamps badge counts greater than 99 to "99+"', () => {
    render(
      <TopTabs
        value="workers"
        onChange={() => {}}
        badges={{ specialists: { count: 150, tone: 'amber' } }}
      />,
    );
    const specialists = screen.getByRole('tab', { name: 'Specialists' });
    expect(within(specialists).getByText('99+')).toBeInTheDocument();
  });

  it('hides the badge when count is 0', () => {
    render(
      <TopTabs
        value="workers"
        onChange={() => {}}
        badges={{ meetings: { count: 0, tone: 'amber' } }}
      />,
    );
    const meetings = screen.getByRole('tab', { name: 'Meetings' });
    expect(within(meetings).queryByText('0')).not.toBeInTheDocument();
  });

  it('applies the amber tone classes to amber badges', () => {
    render(
      <TopTabs
        value="workers"
        onChange={() => {}}
        badges={{ meetings: { count: 2, tone: 'amber' } }}
      />,
    );
    const badge = screen.getByText('2');
    expect(badge.className).toMatch(/warning/);
  });

  it('applies the destructive tone classes to destructive badges', () => {
    render(
      <TopTabs
        value="workers"
        onChange={() => {}}
        badges={{ autonomous: { count: 1, tone: 'destructive' } }}
      />,
    );
    const badge = screen.getByText('1');
    expect(badge).toHaveClass('text-destructive');
  });

  it('applies the muted tone classes to muted badges', () => {
    render(
      <TopTabs
        value="workers"
        onChange={() => {}}
        badges={{ wiki: { count: 4, tone: 'muted' } }}
      />,
    );
    const badge = screen.getByText('4');
    expect(badge).toHaveClass('text-muted-foreground');
  });

  it('responds to keyboard activation by firing onChange via Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TopTabs value="workers" onChange={onChange} />);
    const chat = screen.getByRole('tab', { name: 'Chat' });
    chat.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('chat');
  });

  it('responds to keyboard activation by firing onChange via Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TopTabs value="workers" onChange={onChange} />);
    const chat = screen.getByRole('tab', { name: 'Chat' });
    chat.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('chat');
  });
});
