import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_USER_CARD_HOVER_DELAY,
  UserCard,
  formatJoinedDate,
  getInitials,
  getStatusDotClass,
  getStatusLabel,
} from './user-card';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getInitials', () => {
  it('empty for empty', () => {
    expect(getInitials('')).toBe('');
  });
  it('first char of single word', () => {
    expect(getInitials('alice')).toBe('A');
  });
  it('first + last word for multi-word', () => {
    expect(getInitials('Alice Liddell')).toBe('AL');
  });
  it('uses first + last word for 3+ words', () => {
    expect(getInitials('Ada Mary Lovelace')).toBe('AL');
  });
  it('handles extra whitespace', () => {
    expect(getInitials('  Ada   Lovelace  ')).toBe('AL');
  });
});

describe('getStatusLabel', () => {
  it('returns the human label per status', () => {
    expect(getStatusLabel('online')).toBe('Online');
    expect(getStatusLabel('away')).toBe('Away');
    expect(getStatusLabel('busy')).toBe('Busy');
    expect(getStatusLabel('offline')).toBe('Offline');
    expect(getStatusLabel('unknown')).toBe('Unknown');
  });
});

describe('getStatusDotClass', () => {
  it('returns a non-empty class per status', () => {
    const all = ['online', 'away', 'busy', 'offline', 'unknown'] as const;
    for (const s of all) {
      expect(getStatusDotClass(s).length).toBeGreaterThan(0);
    }
  });
});

describe('formatJoinedDate', () => {
  it('empty for undefined / unparseable', () => {
    expect(formatJoinedDate(undefined)).toBe('');
    expect(formatJoinedDate('not a date')).toBe('');
  });
  it('returns YYYY-MM-DD for ISO string', () => {
    expect(formatJoinedDate('2026-05-19T10:00:00Z')).toBe(
      '2026-05-19',
    );
  });
  it('accepts Date + number', () => {
    expect(formatJoinedDate(new Date('2026-01-01T00:00:00Z'))).toBe(
      '2026-01-01',
    );
    expect(
      formatJoinedDate(Date.UTC(2026, 0, 1, 0, 0, 0)),
    ).toBe('2026-01-01');
  });
});

describe('Constants', () => {
  it('DEFAULT_USER_CARD_HOVER_DELAY = 150', () => {
    expect(DEFAULT_USER_CARD_HOVER_DELAY).toBe(150);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('UserCard component', () => {
  it('renders a region with default aria-label', () => {
    render(<UserCard name="Ada Lovelace" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Ada Lovelace card',
    );
  });

  it('honors custom ariaLabel', () => {
    render(
      <UserCard name="Ada" ariaLabel="profile chip" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'profile chip',
    );
  });

  it('renders the name', () => {
    render(<UserCard name="Ada Lovelace" />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders the role when supplied', () => {
    render(<UserCard name="Ada" role="Mathematician" />);
    expect(screen.getByText('Mathematician')).toBeInTheDocument();
  });

  it('renders fallback initials when no avatarSrc', () => {
    render(<UserCard name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('renders the avatar image when avatarSrc supplied', () => {
    render(
      <UserCard
        name="Ada"
        avatarSrc="https://example/a.png"
        avatarAlt="ada"
      />,
    );
    expect(screen.getByAltText('ada')).toBeInTheDocument();
  });

  it('default alt falls back to name', () => {
    render(
      <UserCard name="Ada" avatarSrc="https://example/a.png" />,
    );
    expect(screen.getByAltText('Ada')).toBeInTheDocument();
  });

  it('status dot renders by default with aria-label', () => {
    render(<UserCard name="Ada" status="online" />);
    expect(
      screen.getByLabelText('Status: Online'),
    ).toBeInTheDocument();
  });

  it('status dot mirrors data-status', () => {
    const { container } = render(
      <UserCard name="Ada" status="busy" />,
    );
    const dot = container.querySelector(
      '[data-section="user-card-status-dot"]',
    );
    expect(dot).toHaveAttribute('data-status', 'busy');
  });

  it('showStatus=false hides the dot', () => {
    const { container } = render(
      <UserCard name="Ada" status="online" showStatus={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="user-card-status-dot"]',
      ),
    ).toBeNull();
  });

  it('showRole=false hides the role text', () => {
    render(
      <UserCard name="Ada" role="x" showRole={false} />,
    );
    expect(screen.queryByText('x')).toBeNull();
  });

  it('root mirrors size + status + interactive data attrs', () => {
    render(
      <UserCard
        name="Ada"
        status="online"
        size="lg"
        onClick={() => {}}
      />,
    );
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-size', 'lg');
    expect(region).toHaveAttribute('data-status', 'online');
    expect(region).toHaveAttribute('data-interactive', 'true');
  });

  it('href makes the trigger an anchor', () => {
    render(
      <UserCard
        name="Ada"
        href="/profile/ada"
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/profile/ada');
  });

  it('onClick (no href) makes the trigger a button', () => {
    const onClick = vi.fn();
    render(<UserCard name="Ada" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('non-interactive renders a static span (no button / link)', () => {
    render(<UserCard name="Ada" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('hover schedule shows the popover after delay', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { container } = render(
      <UserCard
        name="Ada"
        profile={{ bio: 'maths' }}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = container.querySelector(
      '[data-section="user-card-trigger"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });

  it('hover leave hides the popover after delay', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { container } = render(
      <UserCard
        name="Ada"
        profile={{ bio: 'maths' }}
        onOpenChange={onOpenChange}
        defaultOpen
      />,
    );
    const trigger = container.querySelector(
      '[data-section="user-card-trigger"]',
    ) as HTMLElement;
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it('focus opens immediately + blur schedules close', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { container } = render(
      <UserCard
        name="Ada"
        profile={{ bio: 'maths' }}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = container.querySelector(
      '[data-section="user-card-trigger"]',
    ) as HTMLElement;
    fireEvent.focus(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.blur(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it('open=true forces the popover open', () => {
    render(
      <UserCard
        name="Ada"
        profile={{ bio: 'maths' }}
        open
      />,
    );
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('popover hidden when profile is missing (even with open=true)', () => {
    render(<UserCard name="Ada" open />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('showHoverCard=false suppresses the popover entirely', () => {
    render(
      <UserCard
        name="Ada"
        profile={{ bio: 'maths' }}
        open
        showHoverCard={false}
      />,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('popover renders bio + email + location + joined', () => {
    render(
      <UserCard
        name="Ada"
        profile={{
          bio: 'invented programming',
          email: 'ada@x.test',
          location: 'London',
          joinedAt: '2026-05-19',
        }}
        open
      />,
    );
    expect(
      screen.getByText('invented programming'),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@x.test')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
    expect(
      screen.getByText(/Joined 2026-05-19/),
    ).toBeInTheDocument();
  });

  it('popover links render with external attrs when external:true', () => {
    render(
      <UserCard
        name="Ada"
        profile={{
          links: [
            { label: 'GitHub', href: 'https://gh', external: true },
            { label: 'Internal', href: '/internal' },
          ],
        }}
        open
      />,
    );
    const gh = screen.getByText('GitHub').closest('a');
    expect(gh).toHaveAttribute('target', '_blank');
    expect(gh).toHaveAttribute('rel', 'noopener noreferrer');
    const internal = screen.getByText('Internal').closest('a');
    expect(internal).not.toHaveAttribute('target');
  });

  it('popover email link uses mailto', () => {
    render(
      <UserCard
        name="Ada"
        profile={{ email: 'ada@x.test' }}
        open
      />,
    );
    expect(
      screen.getByText('ada@x.test').closest('a'),
    ).toHaveAttribute('href', 'mailto:ada@x.test');
  });

  it('popover status label reflects status', () => {
    render(
      <UserCard
        name="Ada"
        status="busy"
        profile={{ bio: 'x' }}
        open
      />,
    );
    expect(screen.getByText('Busy')).toBeInTheDocument();
  });

  it('controlled open pins the rendered state', () => {
    const { rerender } = render(
      <UserCard name="Ada" profile={{ bio: 'x' }} open={false} />,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    rerender(
      <UserCard name="Ada" profile={{ bio: 'x' }} open />,
    );
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('hoverDelay prop overrides default', () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    const { container } = render(
      <UserCard
        name="Ada"
        profile={{ bio: 'x' }}
        hoverDelay={300}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = container.querySelector(
      '[data-section="user-card-trigger"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });

  it('size data attr swaps the avatar pixel dimension', () => {
    const { container } = render(
      <UserCard name="Ada" size="sm" />,
    );
    const wrap = container.querySelector(
      '[data-section="user-card-avatar-wrapper"]',
    ) as HTMLElement;
    expect(wrap.style.width).toBe('24px');
  });

  it('exposes a stable displayName', () => {
    expect(UserCard.displayName).toBe('UserCard');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<UserCard ref={ref} name="Ada" />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('aria-describedby points at the popover id when hover card enabled', () => {
    const { container } = render(
      <UserCard name="Ada Lovelace" profile={{ bio: 'x' }} />,
    );
    const trigger = container.querySelector(
      '[data-section="user-card-trigger"]',
    );
    expect(trigger).toHaveAttribute(
      'aria-describedby',
      'user-card-popover-Ada-Lovelace',
    );
  });
});
