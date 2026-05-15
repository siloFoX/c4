import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvatarGroup, type AvatarGroupItem } from './avatar-group';

function items(n: number): AvatarGroupItem[] {
  return Array.from({ length: n }, (_, i) => ({ name: `User ${i + 1}` }));
}

describe('<AvatarGroup>', () => {
  it('tags the root with data-section="avatar-group"', () => {
    render(<AvatarGroup items={items(3)} />);
    expect(
      document.querySelector('[data-section="avatar-group"]'),
    ).not.toBeNull();
  });

  it('renders one Avatar per item when count <= max', () => {
    render(<AvatarGroup items={items(3)} max={5} />);
    const avatars = document.querySelectorAll(
      '[data-avatar-group-item]',
    );
    expect(avatars.length).toBe(3);
  });

  it('renders no overflow chip when count <= max', () => {
    render(<AvatarGroup items={items(5)} max={5} />);
    expect(
      document.querySelector('[data-avatar-group-overflow]'),
    ).toBeNull();
  });

  it('renders the overflow chip when count exceeds max', () => {
    render(<AvatarGroup items={items(8)} max={5} />);
    const chip = document.querySelector('[data-avatar-group-overflow]');
    expect(chip).not.toBeNull();
    // 8 items, max=5 -> 4 avatars + "+4" chip (5 visible slots).
    expect(chip!.textContent).toBe('+4');
  });

  it('avatars + chip together respect the max slot count', () => {
    render(<AvatarGroup items={items(10)} max={5} />);
    const visible = document.querySelectorAll('[data-avatar-group-item]');
    const chip = document.querySelector('[data-avatar-group-overflow]');
    expect(visible.length).toBe(4);
    expect(chip).not.toBeNull();
    expect(visible.length + 1).toBe(5);
  });

  it('chip count reflects items.length - (max - 1)', () => {
    render(<AvatarGroup items={items(12)} max={4} />);
    const chip = document.querySelector('[data-avatar-group-overflow]');
    // 12 items, max=4 -> 3 avatars + "+9" chip
    expect(chip!.textContent).toBe('+9');
  });

  it('exposes data-count and data-overflow on the root for e2e', () => {
    render(<AvatarGroup items={items(7)} max={3} />);
    const root = document.querySelector('[data-section="avatar-group"]')!;
    expect(root.getAttribute('data-count')).toBe('7');
    // 7 items, max=3 -> 2 avatars + "+5" chip
    expect(root.getAttribute('data-overflow')).toBe('5');
  });

  it('renders nothing visible when items is empty (count=0)', () => {
    render(<AvatarGroup items={[]} />);
    expect(
      document.querySelectorAll('[data-avatar-group-item]').length,
    ).toBe(0);
    expect(
      document.querySelector('[data-avatar-group-overflow]'),
    ).toBeNull();
    const root = document.querySelector('[data-section="avatar-group"]')!;
    expect(root.getAttribute('data-count')).toBe('0');
  });

  it('max=0 is clamped to 1 (always at least one slot)', () => {
    render(<AvatarGroup items={items(5)} max={0} />);
    const visible = document.querySelectorAll('[data-avatar-group-item]');
    const chip = document.querySelector('[data-avatar-group-overflow]');
    // max clamped to 1: 0 avatars + "+5" chip
    expect(visible.length).toBe(0);
    expect(chip!.textContent).toBe('+5');
  });

  it('max=1 with 1 item renders that avatar with no chip', () => {
    render(<AvatarGroup items={items(1)} max={1} />);
    expect(
      document.querySelectorAll('[data-avatar-group-item]').length,
    ).toBe(1);
    expect(
      document.querySelector('[data-avatar-group-overflow]'),
    ).toBeNull();
  });

  it('overflow chip exposes accessible label via aria-label', () => {
    render(<AvatarGroup items={items(8)} max={5} />);
    const chip = document.querySelector('[data-avatar-group-overflow]');
    expect(chip!.getAttribute('aria-label')).toBe('4 more');
  });

  it('honours a custom overflowAriaLabel callback', () => {
    render(
      <AvatarGroup
        items={items(8)}
        max={5}
        overflowAriaLabel={(n) => `Plus ${n} more participants`}
      />,
    );
    const chip = document.querySelector('[data-avatar-group-overflow]');
    expect(chip!.getAttribute('aria-label')).toBe(
      'Plus 4 more participants',
    );
  });

  it('root role=group exposes a participant count in aria-label', () => {
    render(<AvatarGroup items={items(3)} />);
    const root = document.querySelector('[role="group"]')!;
    expect(root.getAttribute('aria-label')).toBe('3 participants');
  });

  it('singular "1 participant" wording when count is exactly 1', () => {
    render(<AvatarGroup items={items(1)} />);
    const root = document.querySelector('[role="group"]')!;
    expect(root.getAttribute('aria-label')).toBe('1 participant');
  });

  it('first avatar has no overlap class; subsequent avatars + chip do', () => {
    render(<AvatarGroup items={items(6)} max={4} size="md" />);
    const wrappers = document.querySelectorAll(
      '[data-avatar-group-item]',
    );
    expect(wrappers[0]!.className).not.toContain('-ml-3');
    expect(wrappers[1]!.className).toContain('-ml-3');
    const chip = document.querySelector('[data-avatar-group-overflow]');
    expect(chip!.className).toContain('-ml-3');
  });

  it('size="sm" applies -ml-2 overlap', () => {
    render(<AvatarGroup items={items(3)} size="sm" />);
    const wrappers = document.querySelectorAll(
      '[data-avatar-group-item]',
    );
    expect(wrappers[1]!.className).toContain('-ml-2');
  });

  it('size="lg" applies -ml-4 overlap', () => {
    render(<AvatarGroup items={items(3)} size="lg" />);
    const wrappers = document.querySelectorAll(
      '[data-avatar-group-item]',
    );
    expect(wrappers[1]!.className).toContain('-ml-4');
  });

  it('merges caller className with built-in classes', () => {
    render(
      <AvatarGroup items={items(2)} className="custom-roster" />,
    );
    const root = document.querySelector('[data-section="avatar-group"]')!;
    expect(root.className).toContain('custom-roster');
    expect(root.className).toContain('inline-flex');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<AvatarGroup items={items(2)} data-testid="my-roster" />);
    expect(screen.getByTestId('my-roster')).toBeInTheDocument();
  });

  it('chip is hidden when items.length == max (no slot reserved)', () => {
    render(<AvatarGroup items={items(5)} max={5} />);
    expect(
      document.querySelector('[data-avatar-group-overflow]'),
    ).toBeNull();
    expect(
      document.querySelectorAll('[data-avatar-group-item]').length,
    ).toBe(5);
  });

  it('chip kicks in when items.length == max + 1', () => {
    render(<AvatarGroup items={items(6)} max={5} />);
    const visible = document.querySelectorAll('[data-avatar-group-item]');
    const chip = document.querySelector('[data-avatar-group-overflow]');
    // 6 items, max=5 -> 4 avatars + "+2" chip (6 - (5-1) = 2)
    expect(visible.length).toBe(4);
    expect(chip!.textContent).toBe('+2');
  });
});
