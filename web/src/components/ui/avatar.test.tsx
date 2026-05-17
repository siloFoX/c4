import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, avatarColorClass, avatarInitials } from './avatar';

describe('avatarInitials()', () => {
  it('returns one uppercase letter for a single word', () => {
    expect(avatarInitials('alice')).toBe('A');
  });

  it('returns two uppercase letters for a two-word name', () => {
    expect(avatarInitials('Alice Bob')).toBe('AB');
  });

  it('uses first + last initial when 3+ words', () => {
    expect(avatarInitials('Alice Bea Carol')).toBe('AC');
  });

  it('trims whitespace', () => {
    expect(avatarInitials('   alice   bob   ')).toBe('AB');
  });

  it('returns empty string for undefined / empty', () => {
    expect(avatarInitials(undefined)).toBe('');
    expect(avatarInitials('')).toBe('');
    expect(avatarInitials('   ')).toBe('');
  });
});

describe('avatarColorClass()', () => {
  it('is stable for the same name', () => {
    expect(avatarColorClass('worker-1')).toBe(avatarColorClass('worker-1'));
    expect(avatarColorClass('alice')).toBe(avatarColorClass('alice'));
  });

  it('returns a class string from the palette', () => {
    const cls = avatarColorClass('hello');
    expect(typeof cls).toBe('string');
    expect(cls.length).toBeGreaterThan(0);
    expect(cls).toMatch(/bg-/);
  });
});

describe('<Avatar>', () => {
  it('renders initials fallback when no src is provided', () => {
    render(<Avatar name="Alice Bob" />);
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('renders an <img> with src + alt when src is provided', () => {
    render(<Avatar name="Alice" src="/avatar.png" alt="Alice avatar" />);
    const inner = screen.getByRole('img', { name: 'Alice avatar' });
    expect(inner.tagName).toBe('IMG');
    expect(inner).toHaveAttribute('src', '/avatar.png');
    expect(inner).toHaveAttribute('alt', 'Alice avatar');
  });

  it('falls back to name when alt is not provided on the img', () => {
    render(<Avatar name="Alice" src="/a.png" />);
    const inner = screen.getByRole('img', { name: 'Alice' });
    expect(inner.tagName).toBe('IMG');
    expect(inner).toHaveAttribute('alt', 'Alice');
  });

  it('falls back to initials when src is falsy', () => {
    render(<Avatar name="Carol Dean" src="" />);
    expect(screen.getByText('CD')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Carol Dean' })?.querySelector('img')).toBeFalsy();
  });

  it('applies sm size classes', () => {
    render(<Avatar name="A" size="sm" />);
    const node = screen.getByRole('img', { name: 'A' });
    expect(node.className).toContain('h-6');
    expect(node.className).toContain('w-6');
    expect(node.className).toContain('text-xs');
  });

  it('applies md size classes (default)', () => {
    render(<Avatar name="A" />);
    const node = screen.getByRole('img', { name: 'A' });
    expect(node.className).toContain('h-8');
    expect(node.className).toContain('w-8');
    expect(node.className).toContain('text-sm');
  });

  it('applies lg size classes', () => {
    render(<Avatar name="A" size="lg" />);
    const node = screen.getByRole('img', { name: 'A' });
    expect(node.className).toContain('h-10');
    expect(node.className).toContain('w-10');
    expect(node.className).toContain('text-base');
  });

  it('sets role=img and aria-label from name when alt is missing', () => {
    render(<Avatar name="Worker One" />);
    const node = screen.getByRole('img', { name: 'Worker One' });
    expect(node).toHaveAttribute('aria-label', 'Worker One');
  });

  it('aria-label prefers alt over name', () => {
    render(<Avatar name="Ignored" alt="Preferred" />);
    expect(screen.getByRole('img', { name: 'Preferred' })).toBeInTheDocument();
  });

  it('renders a stable bg color class deterministic from name', () => {
    render(<Avatar name="repeat-me" />);
    const a = screen.getByRole('img', { name: 'repeat-me' });
    const expected = avatarColorClass('repeat-me');
    for (const token of expected.split(/\s+/)) {
      expect(a.className).toContain(token);
    }
  });

  it('forwards caller className', () => {
    render(<Avatar name="A" className="ring-2" />);
    expect(screen.getByRole('img', { name: 'A' }).className).toContain('ring-2');
  });

  it('renders the rounded-full shape', () => {
    render(<Avatar name="A" />);
    expect(screen.getByRole('img', { name: 'A' }).className).toContain('rounded-full');
  });

  // -- v1.11.244 perf tweaks (TODO 11.226) -------------------------

  it('inherits decoding="async" + loading="eager" from the Image primitive when src is provided', () => {
    render(<Avatar src="/u.png" alt="user" />);
    const img = screen.getByAltText('user') as HTMLImageElement;
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.getAttribute('loading')).toBe('eager');
  });

  it('forwards srcSet + sizes to the underlying <img> for DPR-aware avatars', () => {
    render(
      <Avatar
        src="/u.png"
        alt="user"
        srcSet="/u@1x.png 1x, /u@2x.png 2x"
        sizes="32px"
      />,
    );
    const img = screen.getByAltText('user') as HTMLImageElement;
    expect(img.getAttribute('srcset')).toBe('/u@1x.png 1x, /u@2x.png 2x');
    expect(img.getAttribute('sizes')).toBe('32px');
  });

  // (v1.11.300, TODO 11.282) New xs size + status overlay.

  it('size="xs" applies the new 20px tile classes', () => {
    render(<Avatar name="Eve" size="xs" />);
    expect(screen.getByRole('img', { name: 'Eve' })).toHaveClass('h-5');
  });

  it('does NOT render the status overlay when status is omitted', () => {
    const { container } = render(<Avatar name="Eve" />);
    expect(container.querySelector('[data-section="avatar-status"]')).toBeNull();
  });

  it('renders the status overlay when status is set (initials variant)', () => {
    const { container } = render(<Avatar name="Eve" status="online" />);
    const dot = container.querySelector('[data-section="avatar-status"]');
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute('data-status')).toBe('online');
  });

  it('renders the status overlay around the image variant too', () => {
    const { container } = render(
      <Avatar src="/u.png" alt="user" status="busy" />,
    );
    const root = container.querySelector('[data-section="avatar-root"]');
    expect(root).not.toBeNull();
    const dot = container.querySelector('[data-section="avatar-status"]');
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute('data-status')).toBe('busy');
  });

  it('status overlay uses the matching palette colour class per variant', () => {
    const { container, rerender } = render(
      <Avatar name="Eve" status="busy" />,
    );
    expect(
      container.querySelector('[data-section="avatar-status"]')!.className,
    ).toMatch(/bg-warning/);
    rerender(<Avatar name="Eve" status="online" />);
    expect(
      container.querySelector('[data-section="avatar-status"]')!.className,
    ).toMatch(/bg-success/);
    rerender(<Avatar name="Eve" status="offline" />);
    expect(
      container.querySelector('[data-section="avatar-status"]')!.className,
    ).toMatch(/bg-muted-foreground/);
  });

  it('status overlay scales with the avatar size class', () => {
    const { container, rerender } = render(
      <Avatar name="Eve" size="xs" status="online" />,
    );
    expect(
      container.querySelector('[data-section="avatar-status"]')!.className,
    ).toMatch(/h-1\.5/);
    rerender(<Avatar name="Eve" size="lg" status="online" />);
    expect(
      container.querySelector('[data-section="avatar-status"]')!.className,
    ).toMatch(/h-3/);
  });

  it('SR label folds the status variant into the announced name (initials)', () => {
    render(<Avatar name="Alice" status="busy" />);
    const node = screen.getByRole('img', { name: /Alice/ });
    expect(node.getAttribute('aria-label')).toBe('Alice, busy');
  });

  it('aria-label on the wrapper carries name + status when src is set', () => {
    const { container } = render(
      <Avatar src="/u.png" alt="Bob" status="away" />,
    );
    const wrapper = container.querySelector(
      '[data-section="avatar-root"]',
    ) as HTMLElement;
    expect(wrapper.getAttribute('aria-label')).toBe('Bob, away');
  });
});
