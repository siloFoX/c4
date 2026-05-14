import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea';

describe('<Textarea>', () => {
  it('renders a <textarea> element', () => {
    render(<Textarea placeholder="notes" />);
    expect(screen.getByPlaceholderText('notes')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('notes').tagName).toBe('TEXTAREA');
  });

  it('applies the surface classes (rounded + border + bg-background)', () => {
    render(<Textarea data-testid="t" />);
    const node = screen.getByTestId('t');
    expect(node).toHaveClass('rounded-md');
    expect(node).toHaveClass('border');
    expect(node).toHaveClass('bg-background');
  });

  it('accepts user typing and forwards onChange events', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea placeholder="msg" onChange={onChange} />);
    await user.type(screen.getByPlaceholderText('msg'), 'hi');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('msg')).toHaveValue('hi');
  });

  it('renders the disabled state and ignores typing when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea placeholder="x" disabled onChange={onChange} />);
    const ta = screen.getByPlaceholderText('x') as HTMLTextAreaElement;
    expect(ta).toBeDisabled();
    await user.type(ta, 'nope');
    expect(ta.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('merges caller-provided className with the surface classes', () => {
    render(<Textarea data-testid="t" className="extra-tag" />);
    expect(screen.getByTestId('t')).toHaveClass('extra-tag');
  });

  it('forwards a ref to the underlying <textarea> element', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('exposes a stable displayName', () => {
    expect(Textarea.displayName).toBe('Textarea');
  });

  describe('label slot', () => {
    it('renders a <Label> above the textarea with the given text', () => {
      render(<Textarea label="Notes" id="notes" />);
      const labelEl = screen.getByText('Notes');
      expect(labelEl.tagName).toBe('LABEL');
    });

    it('wires htmlFor to an explicitly provided id', () => {
      render(<Textarea label="Notes" id="notes" />);
      const labelEl = screen.getByText('Notes');
      expect(labelEl).toHaveAttribute('for', 'notes');
      expect(screen.getByLabelText('Notes')).toHaveAttribute('id', 'notes');
    });

    it('uses a generated id when label is set but no id is provided', () => {
      render(<Textarea label="Notes" />);
      const labelEl = screen.getByText('Notes');
      const forValue = labelEl.getAttribute('for');
      expect(forValue).toBeTruthy();
      expect(screen.getByLabelText('Notes')).toHaveAttribute('id', forValue!);
    });
  });

  describe('hint slot', () => {
    it('renders the hint text', () => {
      render(<Textarea label="Notes" id="notes" hint="Markdown supported" />);
      expect(screen.getByText('Markdown supported')).toBeInTheDocument();
    });

    it('wires aria-describedby to the hint id', () => {
      render(<Textarea label="Notes" id="notes" hint="Markdown supported" />);
      const ta = screen.getByLabelText('Notes');
      const describedBy = ta.getAttribute('aria-describedby') ?? '';
      const hintEl = screen.getByText('Markdown supported');
      expect(hintEl.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(hintEl.id);
    });

    it('does not set aria-invalid when only a hint is present', () => {
      render(<Textarea label="Notes" id="notes" hint="hint only" />);
      expect(screen.getByLabelText('Notes')).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('error slot', () => {
    it('renders the error in role=alert and sets aria-invalid=true', () => {
      render(<Textarea label="Notes" id="notes" error="Required" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Required');
      expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
    });

    it('wires aria-describedby to the error id', () => {
      render(<Textarea label="Notes" id="notes" error="Required" />);
      const ta = screen.getByLabelText('Notes');
      const describedBy = ta.getAttribute('aria-describedby') ?? '';
      const errorEl = screen.getByRole('alert');
      expect(errorEl.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(errorEl.id);
    });

    it('adds the destructive border tone when error is set', () => {
      render(<Textarea label="Notes" id="notes" error="Required" />);
      expect(screen.getByLabelText('Notes')).toHaveClass('border-destructive');
    });
  });

  describe('hint and error coexist', () => {
    it('aria-describedby contains both ids', () => {
      render(
        <Textarea label="Notes" id="notes" hint="Format hint" error="Required" />,
      );
      const ta = screen.getByLabelText('Notes');
      const describedBy = ta.getAttribute('aria-describedby') ?? '';
      const hintEl = screen.getByText('Format hint');
      const errorEl = screen.getByRole('alert');
      const ids = describedBy.split(/\s+/);
      expect(ids).toContain(hintEl.id);
      expect(ids).toContain(errorEl.id);
      expect(ta).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('bare textarea (no slots)', () => {
    it('renders just the <textarea> with no wrapper', () => {
      const { container } = render(<Textarea placeholder="bare" />);
      expect(container.firstElementChild?.tagName).toBe('TEXTAREA');
      expect(container.firstElementChild).toBe(screen.getByPlaceholderText('bare'));
    });

    it('does not set aria-invalid on a bare textarea', () => {
      const { container } = render(<Textarea placeholder="bare" />);
      expect(container.firstElementChild).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('auto-resize', () => {
    it('grows height to scrollHeight when no rows is set', () => {
      Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
        configurable: true,
        get() { return 240; },
      });
      const ref = createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} value="line1\nline2\nline3\nline4" onChange={() => {}} />);
      expect(ref.current!.style.height).toBe('240px');
    });

    it('updates height when value changes', () => {
      let current = 80;
      Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
        configurable: true,
        get() { return current; },
      });
      const ref = createRef<HTMLTextAreaElement>();
      const { rerender } = render(
        <Textarea ref={ref} value="a" onChange={() => {}} />,
      );
      expect(ref.current!.style.height).toBe('80px');
      current = 200;
      rerender(<Textarea ref={ref} value="much longer content" onChange={() => {}} />);
      expect(ref.current!.style.height).toBe('200px');
    });

    it('applies max-height cap and overflow-y when auto-resizing', () => {
      render(<Textarea data-testid="t" />);
      const node = screen.getByTestId('t') as HTMLTextAreaElement;
      expect(node.style.maxHeight).toBe('60vh');
      expect(node.style.overflowY).toBe('auto');
    });

    it('skips auto-resize when explicit rows is provided', () => {
      Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
        configurable: true,
        get() { return 999; },
      });
      const ref = createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} rows={4} value="x" onChange={() => {}} />);
      expect(ref.current!.style.height).toBe('');
      expect(ref.current!.style.maxHeight).toBe('');
      expect(ref.current!.getAttribute('rows')).toBe('4');
    });
  });
});
