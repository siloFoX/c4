import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { Link, isExternalHref } from './link';

describe('isExternalHref', () => {
  it('classifies https URLs as external', () => {
    expect(isExternalHref('https://example.com/foo')).toBe(true);
  });

  it('classifies http URLs as external', () => {
    expect(isExternalHref('http://example.com')).toBe(true);
  });

  it('classifies mailto: as external', () => {
    expect(isExternalHref('mailto:a@b.com')).toBe(true);
  });

  it('classifies tel: as external', () => {
    expect(isExternalHref('tel:+15551234')).toBe(true);
  });

  it('classifies protocol-relative URLs as external', () => {
    expect(isExternalHref('//cdn.example.com/x.png')).toBe(true);
  });

  it('classifies relative paths as internal', () => {
    expect(isExternalHref('about')).toBe(false);
    expect(isExternalHref('./about')).toBe(false);
    expect(isExternalHref('../parent')).toBe(false);
  });

  it('classifies absolute same-origin paths as internal', () => {
    expect(isExternalHref('/dashboard')).toBe(false);
    expect(isExternalHref('/users/42')).toBe(false);
  });

  it('classifies anchor fragments as internal', () => {
    expect(isExternalHref('#section-1')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isExternalHref(undefined as unknown as string)).toBe(false);
  });
});

describe('<Link>', () => {
  afterEach(() => cleanup());

  it('renders an <a> with the children as accessible name', () => {
    render(<Link href="/about">About</Link>);
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
  });

  it('sets href on the underlying anchor', () => {
    render(<Link href="/about">About</Link>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/about');
  });

  it('default variant applies text-primary + hover:underline', () => {
    render(<Link href="/about">About</Link>);
    const a = screen.getByRole('link');
    expect(a.className).toContain('text-primary');
    expect(a.className).toContain('hover:underline');
  });

  it('muted variant applies text-muted-foreground', () => {
    render(
      <Link href="/about" variant="muted">
        About
      </Link>,
    );
    expect(screen.getByRole('link').className).toContain(
      'text-muted-foreground',
    );
  });

  it('inline variant applies text-inherit + underline (always)', () => {
    render(
      <Link href="/about" variant="inline">
        About
      </Link>,
    );
    const cls = screen.getByRole('link').className;
    expect(cls).toContain('text-inherit');
    expect(cls).toContain('underline');
  });

  // Internal vs external behaviour.

  it('internal href does NOT set target or rel', () => {
    render(<Link href="/about">About</Link>);
    const a = screen.getByRole('link');
    expect(a.getAttribute('target')).toBeNull();
    expect(a.getAttribute('rel')).toBeNull();
  });

  it('internal href does NOT render the external icon', () => {
    render(<Link href="/about">About</Link>);
    expect(
      document.querySelector('[data-section="link-external-icon"]'),
    ).toBeNull();
  });

  it('external href sets target="_blank" automatically', () => {
    render(<Link href="https://example.com">Example</Link>);
    expect(screen.getByRole('link').getAttribute('target')).toBe('_blank');
  });

  it('external href sets rel="noopener noreferrer" automatically', () => {
    render(<Link href="https://example.com">Example</Link>);
    const rel = screen.getByRole('link').getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('external href renders the external icon by default', () => {
    render(<Link href="https://example.com">Example</Link>);
    expect(
      document.querySelector('[data-section="link-external-icon"]'),
    ).not.toBeNull();
  });

  it('external icon is aria-hidden so AT does not announce it', () => {
    render(<Link href="https://example.com">Example</Link>);
    const icon = document.querySelector(
      '[data-section="link-external-icon"]',
    );
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('hideExternalIcon=true suppresses the external icon', () => {
    render(
      <Link href="https://example.com" hideExternalIcon>
        Example
      </Link>,
    );
    expect(
      document.querySelector('[data-section="link-external-icon"]'),
    ).toBeNull();
  });

  it('external=false override prevents auto-detect (e.g. proxy URL)', () => {
    render(
      <Link href="https://example.com" external={false}>
        Proxy route
      </Link>,
    );
    const a = screen.getByRole('link');
    expect(a.getAttribute('target')).toBeNull();
    expect(a.getAttribute('rel')).toBeNull();
    expect(
      document.querySelector('[data-section="link-external-icon"]'),
    ).toBeNull();
  });

  it('external=true override forces external semantics on a relative href', () => {
    render(
      <Link href="/legacy" external>
        Legacy
      </Link>,
    );
    const a = screen.getByRole('link');
    expect(a.getAttribute('target')).toBe('_blank');
    const rel = a.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('caller-supplied target overrides the auto-applied _blank', () => {
    render(
      <Link href="https://example.com" target="_self">
        Example
      </Link>,
    );
    expect(screen.getByRole('link').getAttribute('target')).toBe('_self');
  });

  it('non-_blank target does NOT add the security rel tokens', () => {
    render(
      <Link href="https://example.com" target="_self">
        Example
      </Link>,
    );
    // _self external link without _blank should keep rel undefined unless caller passed one.
    expect(screen.getByRole('link').getAttribute('rel')).toBeNull();
  });

  it('caller-supplied rel is merged with the security tokens (no duplicates)', () => {
    render(
      <Link href="https://example.com" rel="nofollow">
        Example
      </Link>,
    );
    const rel = (screen.getByRole('link').getAttribute('rel') ?? '').split(
      /\s+/,
    );
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(rel).toContain('nofollow');
    // Sanity: noopener appears once.
    expect(rel.filter((t) => t === 'noopener').length).toBe(1);
  });

  it('mailto: link is classified as external (icon + rel tokens)', () => {
    render(<Link href="mailto:a@b.com">Email</Link>);
    const a = screen.getByRole('link');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(
      document.querySelector('[data-section="link-external-icon"]'),
    ).not.toBeNull();
  });

  // Data attributes + ergonomics.

  it('exposes data-section="link" + data-variant + data-external', () => {
    render(
      <Link href="https://example.com" variant="muted">
        Example
      </Link>,
    );
    const a = screen.getByRole('link');
    expect(a.getAttribute('data-section')).toBe('link');
    expect(a.getAttribute('data-variant')).toBe('muted');
    expect(a.getAttribute('data-external')).toBe('true');
  });

  it('children render inside data-section="link-content"', () => {
    render(<Link href="/about">About</Link>);
    const content = document.querySelector(
      '[data-section="link-content"]',
    );
    expect(content?.textContent).toBe('About');
  });

  it('forwards the ref to the underlying anchor', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <Link ref={ref} href="/about">
        About
      </Link>,
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it('merges caller-provided className', () => {
    render(
      <Link href="/about" className="extra-tag">
        About
      </Link>,
    );
    expect(screen.getByRole('link').className).toContain('extra-tag');
  });

  it('has a stable displayName', () => {
    expect(Link.displayName).toBe('Link');
  });
});
