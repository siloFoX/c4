import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('<Button>', () => {
  it('renders a <button> with the children as accessible name', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honors an explicit type override (e.g. submit)', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('applies the default variant + size class set when no variant is passed', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('bg-primary');
    expect(btn).toHaveClass('h-10');
  });

  it('switches variant classes when a variant prop is set', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });

  it('switches size classes when a size prop is set', () => {
    render(<Button size="sm">Tiny</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-8');
  });

  it('merges caller-provided className with the variant classes', () => {
    render(<Button className="extra-tag">Tag</Button>);
    expect(screen.getByRole('button')).toHaveClass('extra-tag');
  });

  it('forwards click events to the onClick handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards a ref to the underlying <button> element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Button.displayName).toBe('Button');
  });

  // (v1.11.326, TODO 11.308) Loading state.

  it('loading=true renders an inline spinner and aria-busy', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.querySelector('[data-section="button-spinner"]')).not.toBeNull();
  });

  it('loading=true auto-disables the button', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('loading=true emits SR-only "Loading" text by default', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('loading=true honours a custom loadingLabel', () => {
    render(
      <Button loading loadingLabel="Saving">
        Save
      </Button>,
    );
    expect(screen.getByText('Saving')).toBeInTheDocument();
  });

  it('loading=false does NOT render the spinner or aria-busy', () => {
    render(<Button loading={false}>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-busy')).toBeNull();
    expect(btn.querySelector('[data-section="button-spinner"]')).toBeNull();
  });

  it('loading=true does NOT fire onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading keeps the children in the DOM (width does not jump)', () => {
    render(<Button loading>Save</Button>);
    expect(
      screen.getByRole('button').querySelector(
        '[data-section="button-children"]',
      ),
    ).not.toBeNull();
  });

  it('loading aria-hides the children so the spinner + SR text are the only announced content', () => {
    render(<Button loading>Save</Button>);
    const childrenSlot = screen
      .getByRole('button')
      .querySelector('[data-section="button-children"]');
    expect(childrenSlot?.getAttribute('aria-hidden')).toBe('true');
  });

  // (v1.11.326, TODO 11.308) Icon-only accessibility.

  it('warns in dev when size="icon" is used without aria-label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <Button size="icon">
          <svg aria-hidden="true" />
        </Button>,
      );
      expect(warn).toHaveBeenCalled();
      const msg = warn.mock.calls[0]?.[0];
      expect(typeof msg).toBe('string');
      expect(String(msg)).toMatch(/aria-label/);
    } finally {
      warn.mockRestore();
    }
  });

  it('does NOT warn when size="icon" is used WITH aria-label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <Button size="icon" aria-label="Delete row">
          <svg aria-hidden="true" />
        </Button>,
      );
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('aria-label passes through onto the button element', () => {
    render(
      <Button size="icon" aria-label="Delete row">
        <svg aria-hidden="true" />
      </Button>,
    );
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Delete row',
    );
  });

  // (v1.11.326, TODO 11.308) Data-attribute selectors for e2e.

  it('exposes data-section="button" + data-variant + data-size + data-loading', () => {
    render(<Button variant="destructive" size="lg" loading>Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('data-section')).toBe('button');
    expect(btn.getAttribute('data-variant')).toBe('destructive');
    expect(btn.getAttribute('data-size')).toBe('lg');
    expect(btn.getAttribute('data-loading')).toBe('true');
  });

  // (v1.11.326, TODO 11.308) Tone refinements.

  it('destructive variant includes the destructive focus ring', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button').className).toContain(
      'focus-visible:ring-destructive',
    );
  });

  it('ghost variant uses bg-transparent and accent/60 hover state', () => {
    render(<Button variant="ghost">Hover</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bg-transparent');
    expect(cls).toContain('hover:bg-accent/60');
  });
});
