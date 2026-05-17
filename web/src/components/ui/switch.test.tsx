import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('<Switch>', () => {
  it('renders role=switch and reflects the checked prop via aria-checked', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => {}} aria-label="s" />,
    );
    const node = screen.getByRole('switch');
    expect(node).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked onChange={() => {}} aria-label="s" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders as type=button so it never submits a parent form', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    expect(screen.getByRole('switch')).toHaveAttribute('type', 'button');
  });

  it('click toggles via onChange with the next boolean value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange} aria-label="s" />,
    );
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Space and Enter both toggle the switch', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(false);
      return <Switch checked={v} onChange={setV} aria-label="s" />;
    };
    render(<Wrapper />);
    const node = screen.getByRole('switch');
    node.focus();
    await user.keyboard(' ');
    expect(node).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Enter}');
    expect(node).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking the label toggles the switch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange} label="Notify me" />,
    );
    await user.click(screen.getByText('Notify me'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('label htmlFor wires to the button id via useId', () => {
    render(
      <Switch checked={false} onChange={() => {}} label="Notify" />,
    );
    const node = screen.getByRole('switch');
    const id = node.getAttribute('id');
    expect(id).toBeTruthy();
    const label = screen.getByText('Notify').closest('label');
    expect(label).toHaveAttribute('for', id!);
  });

  it('respects an explicit id prop over the generated one', () => {
    render(
      <Switch
        id="my-switch"
        checked={false}
        onChange={() => {}}
        label="L"
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('id', 'my-switch');
  });

  it('disabled gates click and key events and renders opacity-50 + cursor-not-allowed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onChange={onChange}
        disabled
        aria-label="s"
      />,
    );
    const node = screen.getByRole('switch');
    expect(node).toBeDisabled();
    expect(node.className).toContain('disabled:opacity-50');
    expect(node.className).toContain('disabled:cursor-not-allowed');
    await user.click(node);
    node.focus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled label click does not fire onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onChange={onChange}
        disabled
        label="L"
      />,
    );
    await user.click(screen.getByText('L'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the focus-visible ring class chain matching other primitives', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    const node = screen.getByRole('switch');
    expect(node.className).toContain('focus-visible:ring-2');
    expect(node.className).toContain('focus-visible:ring-primary');
    expect(node.className).toContain('focus-visible:ring-offset-2');
  });

  it('background is bg-primary when checked and bg-muted when unchecked', () => {
    const { rerender } = render(
      <Switch checked onChange={() => {}} aria-label="s" />,
    );
    expect(screen.getByRole('switch').className).toContain('bg-primary');
    rerender(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    expect(screen.getByRole('switch').className).toContain('bg-muted');
  });

  it('thumb translates X via transition-transform when checked', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => {}} aria-label="s" />,
    );
    const thumbOff = screen.getByRole('switch').querySelector('span');
    expect(thumbOff?.className).toContain('transition-transform');
    expect(thumbOff?.className).toContain('translate-x-0.5');
    rerender(<Switch checked onChange={() => {}} aria-label="s" />);
    const thumbOn = screen.getByRole('switch').querySelector('span');
    expect(thumbOn?.className).toContain('translate-x-4');
  });

  it('renders aria-label when no label slot is supplied', () => {
    render(
      <Switch checked={false} onChange={() => {}} aria-label="autopilot" />,
    );
    expect(screen.getByRole('switch', { name: 'autopilot' })).toBeInTheDocument();
  });

  it('label association lets getByLabelText find the switch', () => {
    render(
      <Switch checked={false} onChange={() => {}} label="Autopilot" />,
    );
    expect(screen.getByLabelText('Autopilot')).toBe(
      screen.getByRole('switch'),
    );
  });

  it('exposes a stable displayName', () => {
    expect(Switch.displayName).toBe('Switch');
  });

  // (v1.11.305, TODO 11.287) New sm size + motion-safe thumb +
  // data-section selectors.

  it('default size="md" applies the h-5 w-9 track dimensions', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveClass('h-5');
    expect(sw).toHaveClass('w-9');
    expect(sw.getAttribute('data-size')).toBe('md');
  });

  it('size="sm" applies the h-4 w-7 track + h-3 w-3 thumb dimensions', () => {
    render(
      <Switch
        checked={false}
        onChange={() => {}}
        aria-label="s"
        size="sm"
      />,
    );
    const sw = screen.getByRole('switch');
    expect(sw).toHaveClass('h-4');
    expect(sw).toHaveClass('w-7');
    expect(sw.getAttribute('data-size')).toBe('sm');
    const thumb = sw.querySelector('span');
    expect(thumb).toHaveClass('h-3');
    expect(thumb).toHaveClass('w-3');
  });

  it('size="sm" thumb uses translate-x-3 when checked', () => {
    render(
      <Switch checked onChange={() => {}} aria-label="s" size="sm" />,
    );
    const thumb = screen.getByRole('switch').querySelector('span');
    expect(thumb?.className).toContain('translate-x-3');
  });

  it('exposes data-section="switch" on the button + data-section="switch-thumb" on the thumb', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('data-section')).toBe('switch');
    expect(
      sw.querySelector('[data-section="switch-thumb"]'),
    ).not.toBeNull();
  });

  it('exposes data-checked="true|false" tracking the prop', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => {}} aria-label="s" />,
    );
    expect(
      screen.getByRole('switch').getAttribute('data-checked'),
    ).toBe('false');
    rerender(<Switch checked onChange={() => {}} aria-label="s" />);
    expect(
      screen.getByRole('switch').getAttribute('data-checked'),
    ).toBe('true');
  });

  it('label slot mounts inside a data-section="switch-row" wrapper', () => {
    const { container } = render(
      <Switch checked={false} onChange={() => {}} label="Pilot" />,
    );
    const row = container.querySelector('[data-section="switch-row"]');
    expect(row).not.toBeNull();
    expect(
      row!.querySelector('[data-section="switch-label"]'),
    ).not.toBeNull();
  });

  it('data-reduced-motion is "false" when prefers-reduced-motion is allowed', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    expect(
      screen.getByRole('switch').getAttribute('data-reduced-motion'),
    ).toBe('false');
  });

  it('drops the thumb transition class under reduced motion', () => {
    const origMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: true,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    });
    try {
      render(
        <Switch checked={false} onChange={() => {}} aria-label="s" />,
      );
      const sw = screen.getByRole('switch');
      const thumb = sw.querySelector('span');
      expect(sw.getAttribute('data-reduced-motion')).toBe('true');
      expect(thumb).not.toHaveClass('transition-transform');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: origMatchMedia,
      });
    }
  });
});
