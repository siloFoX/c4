import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './icon-button';

describe('<IconButton>', () => {
  it('renders the icon child inside a <button>', () => {
    render(
      <IconButton aria-label="close" icon={<svg data-testid="x-icon" />} />,
    );
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
    expect(screen.getByTestId('x-icon')).toBeInTheDocument();
  });

  it('uses the aria-label as the button accessible name', () => {
    render(<IconButton aria-label="settings" icon={<span />} />);
    expect(
      screen.getByRole('button', { name: 'settings' }),
    ).toBeInTheDocument();
  });

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<IconButton aria-label="x" icon={<span />} />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honors an explicit type override', () => {
    render(<IconButton aria-label="submit" icon={<span />} type="submit" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('forwards click events to the onClick handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton aria-label="x" icon={<span />} onClick={onClick} />,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        aria-label="x"
        icon={<span />}
        onClick={onClick}
        disabled
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('merges caller-provided className with the base classes', () => {
    render(
      <IconButton
        aria-label="x"
        icon={<span />}
        className="extra-tag"
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('extra-tag');
    expect(btn).toHaveClass('rounded-md');
  });

  it('forwards a ref to the underlying <button> element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton ref={ref} aria-label="x" icon={<span />} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('exposes a stable displayName for devtools', () => {
    expect(IconButton.displayName).toBe('IconButton');
  });

  // ----- (v1.11.329, TODO 11.311) Tone presets -----

  describe('tone', () => {
    it('neutral tone (default) uses text-muted-foreground + accent hover', () => {
      render(<IconButton aria-label="x" icon={<span />} />);
      const cls = screen.getByRole('button').className;
      expect(cls).toContain('text-muted-foreground');
      expect(cls).toContain('hover:bg-accent');
    });

    it('danger tone uses text-destructive + destructive focus ring', () => {
      render(<IconButton aria-label="x" icon={<span />} tone="danger" />);
      const cls = screen.getByRole('button').className;
      expect(cls).toContain('text-destructive');
      expect(cls).toContain('focus-visible:ring-destructive');
    });

    it('accent tone uses text-primary + primary hover', () => {
      render(<IconButton aria-label="x" icon={<span />} tone="accent" />);
      const cls = screen.getByRole('button').className;
      expect(cls).toContain('text-primary');
      expect(cls).toContain('hover:bg-primary/10');
    });

    it('exposes data-tone for e2e selectors', () => {
      render(<IconButton aria-label="x" icon={<span />} tone="danger" />);
      expect(screen.getByRole('button').getAttribute('data-tone')).toBe(
        'danger',
      );
    });
  });

  // ----- (v1.11.329, TODO 11.311) Size presets -----

  describe('size', () => {
    it('default md size uses h-9 w-9', () => {
      render(<IconButton aria-label="x" icon={<span />} />);
      const cls = screen.getByRole('button').className;
      expect(cls).toContain('h-9');
      expect(cls).toContain('w-9');
    });

    it('sm size uses h-8 w-8', () => {
      render(<IconButton aria-label="x" icon={<span />} size="sm" />);
      const cls = screen.getByRole('button').className;
      expect(cls).toContain('h-8');
      expect(cls).toContain('w-8');
    });

    it('lg size uses h-10 w-10', () => {
      render(<IconButton aria-label="x" icon={<span />} size="lg" />);
      const cls = screen.getByRole('button').className;
      expect(cls).toContain('h-10');
      expect(cls).toContain('w-10');
    });

    it('every size preserves the 44x44 mobile touch target', () => {
      for (const size of ['sm', 'md', 'lg'] as const) {
        const { unmount } = render(
          <IconButton aria-label="x" icon={<span />} size={size} />,
        );
        const cls = screen.getByRole('button').className;
        expect(cls).toContain('min-h-[44px]');
        expect(cls).toContain('min-w-[44px]');
        unmount();
      }
    });

    it('exposes data-size for e2e selectors', () => {
      render(<IconButton aria-label="x" icon={<span />} size="lg" />);
      expect(screen.getByRole('button').getAttribute('data-size')).toBe('lg');
    });
  });

  // ----- (v1.11.329, TODO 11.311) Loading state -----

  describe('loading', () => {
    it('loading=true renders an inline spinner', () => {
      render(<IconButton aria-label="Save" icon={<span />} loading />);
      expect(
        screen
          .getByRole('button')
          .querySelector('[data-section="icon-button-spinner"]'),
      ).not.toBeNull();
    });

    it('loading=true hides the icon slot', () => {
      render(
        <IconButton
          aria-label="Save"
          icon={<span data-testid="icon" />}
          loading
        />,
      );
      // Icon slot is replaced by the spinner.
      expect(screen.queryByTestId('icon')).toBeNull();
    });

    it('loading=true sets aria-busy="true"', () => {
      render(<IconButton aria-label="Save" icon={<span />} loading />);
      expect(screen.getByRole('button').getAttribute('aria-busy')).toBe(
        'true',
      );
    });

    it('loading=true auto-disables the button', () => {
      render(<IconButton aria-label="Save" icon={<span />} loading />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('loading=true emits the default "Loading" SR text', () => {
      render(<IconButton aria-label="Save" icon={<span />} loading />);
      expect(screen.getByText('Loading')).toBeInTheDocument();
    });

    it('loading=true honours a custom loadingLabel', () => {
      render(
        <IconButton
          aria-label="Save"
          icon={<span />}
          loading
          loadingLabel="Saving"
        />,
      );
      expect(screen.getByText('Saving')).toBeInTheDocument();
    });

    it('loading=true blocks onClick', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <IconButton
          aria-label="Save"
          icon={<span />}
          loading
          onClick={onClick}
        />,
      );
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('loading=false does NOT render the spinner or aria-busy', () => {
      render(<IconButton aria-label="x" icon={<span />} loading={false} />);
      const btn = screen.getByRole('button');
      expect(
        btn.querySelector('[data-section="icon-button-spinner"]'),
      ).toBeNull();
      expect(btn.getAttribute('aria-busy')).toBeNull();
    });

    it('exposes data-loading for e2e selectors', () => {
      render(<IconButton aria-label="x" icon={<span />} loading />);
      expect(screen.getByRole('button').getAttribute('data-loading')).toBe(
        'true',
      );
    });
  });

  // ----- (v1.11.329, TODO 11.311) Data attributes baseline -----

  it('icon slot carries data-section="icon-button-icon" + aria-hidden', () => {
    render(<IconButton aria-label="x" icon={<span data-testid="i" />} />);
    const slot = document.querySelector('[data-section="icon-button-icon"]');
    expect(slot).not.toBeNull();
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
  });

  it('button carries data-section="icon-button"', () => {
    render(<IconButton aria-label="x" icon={<span />} />);
    expect(screen.getByRole('button').getAttribute('data-section')).toBe(
      'icon-button',
    );
  });
});
