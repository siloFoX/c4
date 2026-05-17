import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from './error-state';

describe('<ErrorState>', () => {
  it('renders the title text', () => {
    render(<ErrorState title="Something broke" />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <ErrorState
        title="Failed"
        description="The server returned 500"
      />,
    );
    expect(screen.getByText('The server returned 500')).toBeInTheDocument();
  });

  it('renders an Error.message when error is an Error instance', () => {
    render(
      <ErrorState
        title="Failed"
        error={new Error('boom: deep failure')}
      />,
    );
    expect(screen.getByText('boom: deep failure')).toBeInTheDocument();
  });

  it('renders the raw string when error is a string', () => {
    render(<ErrorState title="Failed" error="raw network error" />);
    expect(screen.getByText('raw network error')).toBeInTheDocument();
  });

  it('renders a retry button + fires onRetry on click', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Failed" onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('honors a custom retryLabel', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Failed"
        onRetry={onRetry}
        retryLabel="Try again"
      />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('skips the retry button when onRetry is omitted', () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses destructive accent on the title + icon', () => {
    const { container } = render(<ErrorState title="Bad" />);
    const title = screen.getByText('Bad');
    expect(title.className).toContain('text-destructive');
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('text-destructive');
  });

  it('uses bg-secondary on the retry button', () => {
    render(<ErrorState title="Failed" onRetry={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Retry' });
    expect(btn.className).toContain('bg-secondary');
    expect(btn.className).toContain('hover:bg-secondary/80');
  });

  it('sets role=alert on the wrapper for assistive tech', () => {
    const { container } = render(<ErrorState title="Bad" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'alert');
  });

  it('merges caller className', () => {
    const { container } = render(<ErrorState title="x" className="my-err" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-err');
    expect(wrapper).toHaveClass('bg-card');
  });

  // (v1.11.314, TODO 11.296) New icon slot + reportLink +
  // showDetails + data-section selectors.

  describe('icon slot', () => {
    it('renders the default AlertTriangle when no icon prop is set', () => {
      render(<ErrorState title="t" />);
      const iconSlot = document.querySelector(
        '[data-section="error-state-icon"]',
      );
      expect(iconSlot).not.toBeNull();
      // lucide-react renders an <svg> for the AlertTriangle.
      expect(iconSlot!.querySelector('svg')).not.toBeNull();
    });

    it('replaces the default glyph when icon is provided', () => {
      render(
        <ErrorState
          title="t"
          icon={<span data-testid="my-icon">!</span>}
        />,
      );
      expect(screen.getByTestId('my-icon')).toBeInTheDocument();
    });
  });

  describe('reportLink', () => {
    it('renders a report anchor with label + relative href', () => {
      render(
        <ErrorState
          title="t"
          reportLink={{ label: 'Report this', href: '/feedback' }}
        />,
      );
      const link = screen.getByRole('link', { name: 'Report this' });
      expect(link.getAttribute('href')).toBe('/feedback');
    });

    it('external report link gets target=_blank + rel=noreferrer noopener', () => {
      render(
        <ErrorState
          title="t"
          reportLink={{
            label: 'File issue',
            href: 'https://github.com/x/y/issues/new',
          }}
        />,
      );
      const link = screen.getByRole('link', { name: 'File issue' });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer noopener');
    });

    it('relative report link does NOT get external target/rel attrs', () => {
      render(
        <ErrorState
          title="t"
          reportLink={{ label: 'Report', href: '/feedback' }}
        />,
      );
      const link = screen.getByRole('link', { name: 'Report' });
      expect(link.getAttribute('target')).toBeNull();
      expect(link.getAttribute('rel')).toBeNull();
    });

    it('reportLink is hidden when omitted', () => {
      render(<ErrorState title="t" />);
      expect(
        document.querySelector('[data-section="error-state-report-link"]'),
      ).toBeNull();
    });
  });

  describe('showDetails', () => {
    it('does NOT render <details> when showDetails is false', () => {
      const err = new Error('boom');
      render(<ErrorState title="t" error={err} />);
      expect(
        document.querySelector('[data-section="error-state-details"]'),
      ).toBeNull();
    });

    it('renders <details> + <pre> stack when showDetails + error.stack set', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at fn (file.ts:1:1)';
      render(<ErrorState title="t" error={err} showDetails />);
      expect(
        document.querySelector('[data-section="error-state-details"]'),
      ).not.toBeNull();
      const stack = document.querySelector(
        '[data-section="error-state-stack"]',
      );
      expect(stack?.textContent).toContain('Error: boom');
      expect(stack?.textContent).toContain('at fn (file.ts:1:1)');
    });

    it('inline message is suppressed when details is rendered', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at fn (file.ts:1:1)';
      render(<ErrorState title="t" error={err} showDetails />);
      // The message would have rendered in the data-section
      // error-state-message slot. With details on, that slot
      // drops out.
      expect(
        document.querySelector('[data-section="error-state-message"]'),
      ).toBeNull();
    });

    it('falls back to inline message when error is a string (no stack)', () => {
      render(<ErrorState title="t" error="boom" showDetails />);
      expect(
        document.querySelector('[data-section="error-state-details"]'),
      ).toBeNull();
      expect(
        document.querySelector('[data-section="error-state-message"]'),
      ).not.toBeNull();
    });

    it('summary label is the canonical "Stack trace" string', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n  at line';
      render(<ErrorState title="t" error={err} showDetails />);
      const summary = document.querySelector(
        '[data-section="error-state-details-summary"]',
      );
      expect(summary?.textContent).toBe('Stack trace');
    });
  });

  describe('data-section selectors', () => {
    it('exposes data-section="error-state" on the wrapper', () => {
      render(<ErrorState title="t" />);
      expect(
        document.querySelector('[data-section="error-state"]'),
      ).not.toBeNull();
    });

    it('exposes data-section="error-state-text" on the text block', () => {
      render(<ErrorState title="t" description="d" />);
      expect(
        document.querySelector('[data-section="error-state-text"]'),
      ).not.toBeNull();
    });

    it('exposes data-section="error-state-title" + "error-state-description"', () => {
      render(<ErrorState title="The title" description="A description." />);
      const title = document.querySelector(
        '[data-section="error-state-title"]',
      );
      expect(title?.textContent).toBe('The title');
      const desc = document.querySelector(
        '[data-section="error-state-description"]',
      );
      expect(desc?.textContent).toBe('A description.');
    });

    it('exposes data-section="error-state-retry" on the retry button', () => {
      render(<ErrorState title="t" onRetry={() => {}} />);
      expect(
        document.querySelector('[data-section="error-state-retry"]'),
      ).not.toBeNull();
    });
  });

  describe('displayName', () => {
    it('exposes a stable displayName for devtools', () => {
      expect(ErrorState.displayName).toBe('ErrorState');
    });
  });
});
