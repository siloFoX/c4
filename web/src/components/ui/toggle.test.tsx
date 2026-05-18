import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './toggle';

describe('<Toggle>', () => {
  it('renders a <button> with role="button" + aria-pressed="false" by default', () => {
    render(<Toggle aria-label="Bold">B</Toggle>);
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('reflects controlled pressed=true via aria-pressed', () => {
    render(
      <Toggle pressed onPressedChange={() => {}} aria-label="Bold">
        B
      </Toggle>,
    );
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('controlled: clicking fires onPressedChange with the toggled value but does NOT mutate internal state', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <Toggle
        pressed={false}
        onPressedChange={onPressedChange}
        aria-label="Bold"
      >
        B
      </Toggle>,
    );
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onPressedChange).toHaveBeenCalledWith(true);
    // Parent did not call setState, so the button stays
    // aria-pressed=false.
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('uncontrolled: defaultPressed seeds the initial state', () => {
    render(<Toggle defaultPressed aria-label="Bold">B</Toggle>);
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('uncontrolled: clicking flips internal state', async () => {
    const user = userEvent.setup();
    render(<Toggle aria-label="Bold">B</Toggle>);
    const btn = screen.getByRole('button', { name: 'Bold' });
    await user.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    await user.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('uncontrolled: onPressedChange still fires when provided', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <Toggle onPressedChange={onPressedChange} aria-label="Bold">
        B
      </Toggle>,
    );
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it('mixed: controlled `pressed` wins over `defaultPressed`', () => {
    render(
      <Toggle
        pressed={false}
        defaultPressed
        onPressedChange={() => {}}
        aria-label="Bold"
      >
        B
      </Toggle>,
    );
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('Space + Enter toggle via native button keystroke synthesis', async () => {
    const user = userEvent.setup();
    render(<Toggle aria-label="Bold">B</Toggle>);
    const btn = screen.getByRole('button', { name: 'Bold' });
    btn.focus();
    await user.keyboard(' ');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{Enter}');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('disabled: click is a no-op', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <Toggle
        disabled
        onPressedChange={onPressedChange}
        aria-label="Bold"
      >
        B
      </Toggle>,
    );
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('size="sm" applies h-7 px-2 text-xs', () => {
    render(<Toggle size="sm" aria-label="Bold">B</Toggle>);
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.className).toContain('h-7');
    expect(btn.className).toContain('px-2');
    expect(btn.className).toContain('text-xs');
    expect(btn.getAttribute('data-size')).toBe('sm');
  });

  it('default size="md" applies h-9 px-3 text-sm', () => {
    render(<Toggle aria-label="Bold">B</Toggle>);
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.className).toContain('h-9');
    expect(btn.className).toContain('px-3');
    expect(btn.className).toContain('text-sm');
    expect(btn.getAttribute('data-size')).toBe('md');
  });

  it('size="lg" applies h-11 px-4 text-base', () => {
    render(<Toggle size="lg" aria-label="Bold">B</Toggle>);
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('px-4');
    expect(btn.className).toContain('text-base');
  });

  it('variant="default" pressed applies bg-accent text-accent-foreground', () => {
    render(
      <Toggle pressed onPressedChange={() => {}} aria-label="Bold">
        B
      </Toggle>,
    );
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.className).toContain('bg-accent');
    expect(btn.className).toContain('text-accent-foreground');
  });

  it('variant="outline" pressed adds border-accent + bg-accent/20', () => {
    render(
      <Toggle
        pressed
        onPressedChange={() => {}}
        variant="outline"
        aria-label="Bold"
      >
        B
      </Toggle>,
    );
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.className).toContain('border-accent');
    expect(btn.className).toContain('bg-accent/20');
    expect(btn.getAttribute('data-variant')).toBe('outline');
  });

  it('variant="outline" unpressed renders the bordered idle state', () => {
    render(
      <Toggle variant="outline" aria-label="Bold">
        B
      </Toggle>,
    );
    const btn = screen.getByRole('button', { name: 'Bold' });
    expect(btn.className).toContain('border-input');
  });

  it('icon prop renders inside data-section="toggle-icon"', () => {
    render(
      <Toggle icon={<span data-testid="icon">*</span>} aria-label="Bold">
        Bold
      </Toggle>,
    );
    const iconSlot = document.querySelector('[data-section="toggle-icon"]');
    expect(iconSlot).not.toBeNull();
    expect(iconSlot!.querySelector('[data-testid="icon"]')).not.toBeNull();
  });

  it('icon slot is hidden from assistive tech (aria-hidden="true")', () => {
    render(
      <Toggle icon={<span>*</span>} aria-label="Bold">
        Bold
      </Toggle>,
    );
    const iconSlot = document.querySelector(
      '[data-section="toggle-icon"]',
    ) as HTMLElement;
    expect(iconSlot.getAttribute('aria-hidden')).toBe('true');
  });

  it('label children render inside data-section="toggle-label"', () => {
    render(<Toggle aria-label="Bold">Bold text</Toggle>);
    const labelSlot = document.querySelector(
      '[data-section="toggle-label"]',
    );
    expect(labelSlot).not.toBeNull();
    expect(labelSlot).toHaveTextContent('Bold text');
  });

  it('omits the label slot when no children are passed', () => {
    render(<Toggle aria-label="Bold" icon={<span>*</span>} />);
    expect(
      document.querySelector('[data-section="toggle-label"]'),
    ).toBeNull();
  });

  it('omits the icon slot when no icon prop is passed', () => {
    render(<Toggle aria-label="Bold">B</Toggle>);
    expect(
      document.querySelector('[data-section="toggle-icon"]'),
    ).toBeNull();
  });

  it('forwards caller className', () => {
    render(
      <Toggle aria-label="Bold" className="my-toggle">
        B
      </Toggle>,
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveClass(
      'my-toggle',
    );
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<Toggle aria-label="Bold" data-testid="t">B</Toggle>);
    expect(screen.getByTestId('t')).toBeInTheDocument();
  });

  it('data-pressed attr mirrors the pressed state', () => {
    const { rerender } = render(
      <Toggle pressed={false} onPressedChange={() => {}} aria-label="Bold">
        B
      </Toggle>,
    );
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('data-pressed'),
    ).toBe('false');
    rerender(
      <Toggle pressed onPressedChange={() => {}} aria-label="Bold">
        B
      </Toggle>,
    );
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('data-pressed'),
    ).toBe('true');
  });

  it('type defaults to "button" (does not submit a surrounding form)', () => {
    let submits = 0;
    const onSubmit = (e: React.FormEvent) => {
      submits += 1;
      e.preventDefault();
    };
    render(
      <form onSubmit={onSubmit}>
        <Toggle aria-label="Bold">B</Toggle>
      </form>,
    );
    const user = userEvent.setup();
    return user.click(screen.getByRole('button', { name: 'Bold' })).then(() => {
      expect(submits).toBe(0);
    });
  });

  it('caller can override type to "submit" for explicit form submission', () => {
    render(
      <Toggle type="submit" aria-label="Bold">
        B
      </Toggle>,
    );
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('type'),
    ).toBe('submit');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Toggle.displayName).toBe('Toggle');
  });

  it('caller onClick handler is invoked after the toggle commit', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const onPressedChange = vi.fn(() => {
      order.push('press');
    });
    const onClick = vi.fn(() => {
      order.push('click');
    });
    render(
      <Toggle
        onPressedChange={onPressedChange}
        onClick={onClick}
        aria-label="Bold"
      >
        B
      </Toggle>,
    );
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(order).toEqual(['press', 'click']);
  });

  it('disabled + variant="outline": both opacity classes apply', () => {
    render(
      <Toggle disabled variant="outline" aria-label="Bold">
        B
      </Toggle>,
    );
    const btn = screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement;
    expect(btn.className).toContain('disabled:opacity-50');
    expect(btn.disabled).toBe(true);
  });
});
