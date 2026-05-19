import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  AnnouncementBanner,
  DEFAULT_ANNOUNCEMENT_ALIGNMENT,
  DEFAULT_ANNOUNCEMENT_STORAGE_PREFIX,
  DEFAULT_ANNOUNCEMENT_VARIANT,
  clearAnnouncementDismissal,
  getAnnouncementStorageKey,
  isAnnouncementDismissed,
  markAnnouncementDismissed,
} from './announcement-banner';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('getAnnouncementStorageKey', () => {
  it('prefixes the id', () => {
    expect(getAnnouncementStorageKey('q1-shipping')).toBe(
      `${DEFAULT_ANNOUNCEMENT_STORAGE_PREFIX}q1-shipping`,
    );
  });
  it('override wins', () => {
    expect(
      getAnnouncementStorageKey('q1-shipping', 'custom-key'),
    ).toBe('custom-key');
  });
});

describe('isAnnouncementDismissed / markAnnouncementDismissed / clearAnnouncementDismissal', () => {
  it('false when storage is empty', () => {
    expect(isAnnouncementDismissed('q1')).toBe(false);
  });
  it('true after marking', () => {
    markAnnouncementDismissed('q1');
    expect(isAnnouncementDismissed('q1')).toBe(true);
  });
  it('clear removes the flag', () => {
    markAnnouncementDismissed('q1');
    clearAnnouncementDismissal('q1');
    expect(isAnnouncementDismissed('q1')).toBe(false);
  });
  it('honours an override storage key', () => {
    markAnnouncementDismissed('q1', 'custom-key');
    expect(isAnnouncementDismissed('q1', 'custom-key')).toBe(true);
    expect(isAnnouncementDismissed('q1')).toBe(false);
  });
  it('null storage is a no-op', () => {
    expect(isAnnouncementDismissed('x', undefined, null)).toBe(
      false,
    );
    expect(() =>
      markAnnouncementDismissed('x', undefined, null),
    ).not.toThrow();
  });
  it('mark swallows a throwing storage', () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() =>
      markAnnouncementDismissed('x', undefined, throwing),
    ).not.toThrow();
  });
});

describe('Constants', () => {
  it('DEFAULT_ANNOUNCEMENT_VARIANT = info', () => {
    expect(DEFAULT_ANNOUNCEMENT_VARIANT).toBe('info');
  });
  it('DEFAULT_ANNOUNCEMENT_ALIGNMENT = left', () => {
    expect(DEFAULT_ANNOUNCEMENT_ALIGNMENT).toBe('left');
  });
  it('storage prefix is namespaced', () => {
    expect(DEFAULT_ANNOUNCEMENT_STORAGE_PREFIX).toBe(
      'c4:announcement:',
    );
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('AnnouncementBanner component', () => {
  it('renders a region with default aria-label from the title', () => {
    render(
      <AnnouncementBanner id="q1" title="Quarterly update" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Quarterly update',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        ariaLabel="System announcement"
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'System announcement',
    );
  });

  it('falls back to "Announcement" when title is not a string', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title={<span>hi</span>}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Announcement',
    );
  });

  it('renders title + description by default', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title="Heads up"
        description="Maintenance starts at 10pm UTC."
      />,
    );
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(
      screen.getByText('Maintenance starts at 10pm UTC.'),
    ).toBeInTheDocument();
  });

  it('renders children body when supplied (overrides title/description)', () => {
    render(
      <AnnouncementBanner id="q1" title="ignored">
        <span data-testid="custom-body">Custom body</span>
      </AnnouncementBanner>,
    );
    expect(screen.getByTestId('custom-body')).toBeInTheDocument();
    expect(screen.queryByText('ignored')).toBeNull();
  });

  it('default variant is info; data-variant reflects it', () => {
    render(<AnnouncementBanner id="q1" title="x" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-variant',
      'info',
    );
  });

  it.each([
    ['warning'],
    ['success'],
    ['error'],
    ['neutral'],
  ] as const)('variant=%s reflects on data-variant', (variant) => {
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        variant={variant}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-variant',
      variant,
    );
  });

  it('default icon renders per variant', () => {
    const { container } = render(
      <AnnouncementBanner id="q1" title="x" variant="warning" />,
    );
    expect(
      container.querySelector(
        '[data-section="announcement-banner-icon"] svg',
      ),
    ).toBeInTheDocument();
  });

  it('custom icon prop replaces the default', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        icon={<span data-testid="custom-icon">!</span>}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('link slot renders an anchor with the href + label', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        link={{ href: '/changelog', label: 'Read more' }}
      />,
    );
    const a = screen.getByText('Read more').closest('a');
    expect(a).toHaveAttribute('href', '/changelog');
    expect(a).toHaveAttribute('data-external', 'false');
  });

  it('external link gets target=_blank + noopener noreferrer + data-external', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        link={{
          href: 'https://x.example',
          label: 'Read more',
          external: true,
        }}
      />,
    );
    const a = screen.getByText('Read more').closest('a');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a).toHaveAttribute('data-external', 'true');
  });

  it('dismiss button visible by default with aria-label', () => {
    render(<AnnouncementBanner id="q1" title="x" />);
    expect(
      screen.getByLabelText('Dismiss announcement'),
    ).toBeInTheDocument();
  });

  it('dismissible=false hides the dismiss button', () => {
    render(
      <AnnouncementBanner id="q1" title="x" dismissible={false} />,
    );
    expect(
      screen.queryByLabelText('Dismiss announcement'),
    ).toBeNull();
  });

  it('clicking dismiss fires onDismiss + persists flag + closes', () => {
    const onDismiss = vi.fn();
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss announcement'));
    expect(onDismiss).toHaveBeenCalled();
    expect(isAnnouncementDismissed('q1')).toBe(true);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('previously-dismissed id stays closed on next mount', () => {
    markAnnouncementDismissed('q1');
    render(<AnnouncementBanner id="q1" title="x" />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('controlled open=true bypasses the dismissed flag', () => {
    markAnnouncementDismissed('q1');
    render(<AnnouncementBanner id="q1" title="x" open />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('controlled open=false hides even without a stored flag', () => {
    render(
      <AnnouncementBanner id="q1" title="x" open={false} />,
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('onOpenChange fires on dismiss', () => {
    const onOpenChange = vi.fn();
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss announcement'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('alignment default is left; data-alignment reflects it', () => {
    render(<AnnouncementBanner id="q1" title="x" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-alignment',
      'left',
    );
  });

  it('alignment=center reflects on data-alignment', () => {
    render(
      <AnnouncementBanner
        id="q1"
        title="x"
        alignment="center"
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-alignment',
      'center',
    );
  });

  it('data-banner-id mirrors the id prop', () => {
    render(<AnnouncementBanner id="welcome-q1" title="x" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-banner-id',
      'welcome-q1',
    );
  });

  it('data-dismissible reflects state', () => {
    const { rerender } = render(
      <AnnouncementBanner id="q1" title="x" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-dismissible',
      'true',
    );
    rerender(
      <AnnouncementBanner id="q1" title="x" dismissible={false} />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-dismissible',
      'false',
    );
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <AnnouncementBanner ref={ref} id="q1" title="x" />,
    );
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('exposes a stable displayName', () => {
    expect(AnnouncementBanner.displayName).toBe('AnnouncementBanner');
  });

  it('data-section markers present on root, icon, content, dismiss', () => {
    const { container } = render(
      <AnnouncementBanner id="q1" title="x" />,
    );
    expect(
      container.querySelector('[data-section="announcement-banner"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="announcement-banner-icon"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="announcement-banner-content"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="announcement-banner-dismiss"]',
      ),
    ).toBeInTheDocument();
  });

  it('description is omitted when not supplied', () => {
    const { container } = render(
      <AnnouncementBanner id="q1" title="x" />,
    );
    expect(
      container.querySelector(
        '[data-section="announcement-banner-description"]',
      ),
    ).toBeNull();
  });

  it('controlled open ignores internal dismiss + does not flip rendered state', () => {
    const { rerender } = render(
      <AnnouncementBanner id="q1" title="x" open />,
    );
    fireEvent.click(screen.getByLabelText('Dismiss announcement'));
    // still rendered because controlled
    expect(screen.getByRole('region')).toBeInTheDocument();
    rerender(
      <AnnouncementBanner id="q1" title="x" open={false} />,
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('mark from a controlled dismiss still persists the flag', () => {
    render(<AnnouncementBanner id="ctl" title="x" open />);
    fireEvent.click(screen.getByLabelText('Dismiss announcement'));
    expect(isAnnouncementDismissed('ctl')).toBe(true);
  });
});
