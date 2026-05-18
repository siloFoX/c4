import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('<Input>', () => {
  it('renders an <input> element', () => {
    render(<Input placeholder="email" />);
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email').tagName).toBe('INPUT');
  });

  it('applies the surface classes (rounded + border + h-10 + bg-background)', () => {
    render(<Input data-testid="i" />);
    const node = screen.getByTestId('i');
    expect(node).toHaveClass('rounded-md');
    expect(node).toHaveClass('border');
    expect(node).toHaveClass('h-10');
    expect(node).toHaveClass('bg-background');
  });

  it('honors the type prop', () => {
    render(<Input data-testid="i" type="password" />);
    expect(screen.getByTestId('i')).toHaveAttribute('type', 'password');
  });

  it('accepts user typing and forwards onChange events', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="search" onChange={onChange} />);
    await user.type(screen.getByPlaceholderText('search'), 'hello');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('search')).toHaveValue('hello');
  });

  it('renders the disabled state and ignores typing when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="x" disabled onChange={onChange} />);
    const input = screen.getByPlaceholderText('x') as HTMLInputElement;
    expect(input).toBeDisabled();
    await user.type(input, 'nope');
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('merges caller-provided className with the surface classes', () => {
    render(<Input data-testid="i" className="extra-tag" />);
    expect(screen.getByTestId('i')).toHaveClass('extra-tag');
  });

  it('forwards a ref to the underlying <input> element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('exposes a stable displayName', () => {
    expect(Input.displayName).toBe('Input');
  });

  // ----- v1.11.142 optional label / hint / error slots -----

  describe('label slot', () => {
    it('renders a <Label> above the input with the given text', () => {
      render(<Input label="Email" id="email" />);
      const labelEl = screen.getByText('Email');
      expect(labelEl.tagName).toBe('LABEL');
    });

    it('wires htmlFor to an explicitly provided input id', () => {
      render(<Input label="Email" id="email" />);
      const labelEl = screen.getByText('Email');
      expect(labelEl).toHaveAttribute('for', 'email');
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveAttribute('id', 'email');
    });

    it('uses a generated id when label is set but no id is provided', () => {
      render(<Input label="Email" />);
      const labelEl = screen.getByText('Email');
      const forValue = labelEl.getAttribute('for');
      expect(forValue).toBeTruthy();
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveAttribute('id', forValue!);
    });
  });

  describe('hint slot', () => {
    it('renders the hint text below the input', () => {
      render(<Input label="Email" id="email" hint="We never share this" />);
      expect(screen.getByText('We never share this')).toBeInTheDocument();
    });

    it('wires aria-describedby to the hint element id', () => {
      render(<Input label="Email" id="email" hint="We never share this" />);
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const hintEl = screen.getByText('We never share this');
      expect(hintEl.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(hintEl.id);
    });

    it('does not set aria-invalid when only a hint is present', () => {
      render(<Input label="Email" id="email" hint="hint only" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('error slot', () => {
    it('renders the error in a role=alert region and sets aria-invalid=true', () => {
      render(<Input label="Email" id="email" error="Required" />);
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toHaveTextContent('Required');
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveAttribute('aria-invalid', 'true');
    });

    it('wires aria-describedby to the error element id', () => {
      render(<Input label="Email" id="email" error="Required" />);
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const errorEl = screen.getByRole('alert');
      expect(errorEl.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(errorEl.id);
    });

    it('adds the destructive border tone when error is set', () => {
      render(<Input label="Email" id="email" error="Required" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveClass('border-destructive');
    });
  });

  describe('hint and error coexist', () => {
    it('aria-describedby contains both the hint id and the error id', () => {
      render(
        <Input
          label="Email"
          id="email"
          hint="Format hint"
          error="Required"
        />,
      );
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const hintEl = screen.getByText('Format hint');
      const errorEl = screen.getByRole('alert');
      const ids = describedBy.split(/\s+/);
      expect(ids).toContain(hintEl.id);
      expect(ids).toContain(errorEl.id);
      expect(inputEl).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('bare input (no slots)', () => {
    it('renders just the <input> with no wrapper when label / hint / error are all unset', () => {
      const { container } = render(<Input placeholder="bare" />);
      expect(container.firstElementChild?.tagName).toBe('INPUT');
      expect(container.firstElementChild).toBe(
        screen.getByPlaceholderText('bare'),
      );
    });

    it('does not set aria-invalid on a bare input', () => {
      const { container } = render(<Input placeholder="bare" />);
      expect(container.firstElementChild).not.toHaveAttribute('aria-invalid');
    });
  });

  // ----- (v1.11.327, TODO 11.309) Leading / trailing icons -----

  describe('icon slots', () => {
    it('renders a leadingIcon with absolute positioning and pl-9 on the input', () => {
      render(
        <Input
          leadingIcon={<span data-testid="lead">L</span>}
          placeholder="search"
        />,
      );
      expect(screen.getByTestId('lead')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('search')).toHaveClass('pl-9');
    });

    it('renders a trailingIcon with absolute positioning and pr-9 on the input', () => {
      render(
        <Input
          trailingIcon={<span data-testid="trail">T</span>}
          placeholder="search"
        />,
      );
      expect(screen.getByTestId('trail')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('search')).toHaveClass('pr-9');
    });

    it('icon slots are aria-hidden so AT does not announce them as content', () => {
      render(
        <Input
          leadingIcon={<span>L</span>}
          trailingIcon={<span>T</span>}
          placeholder="search"
        />,
      );
      const leading = document.querySelector('[data-section="input-leading"]');
      const trailing = document.querySelector('[data-section="input-trailing"]');
      expect(leading?.getAttribute('aria-hidden')).toBe('true');
      expect(trailing?.getAttribute('aria-hidden')).toBe('true');
    });

    it('icon-decorated input is wrapped in [data-section="input-wrap"]', () => {
      render(
        <Input
          leadingIcon={<span>L</span>}
          placeholder="search"
        />,
      );
      expect(document.querySelector('[data-section="input-wrap"]')).not.toBeNull();
    });
  });

  // ----- (v1.11.327, TODO 11.309) Clear button -----

  describe('clear button', () => {
    it('does not render the clear button when onClear is omitted', () => {
      render(<Input value="abc" onChange={() => {}} />);
      expect(
        document.querySelector('[data-section="input-clear"]'),
      ).toBeNull();
    });

    it('does not render the clear button when value is empty', () => {
      render(<Input value="" onClear={() => {}} onChange={() => {}} />);
      expect(
        document.querySelector('[data-section="input-clear"]'),
      ).toBeNull();
    });

    it('renders the clear button when onClear is set AND value is non-empty', () => {
      render(<Input value="abc" onClear={() => {}} onChange={() => {}} />);
      const clearBtn = document.querySelector(
        '[data-section="input-clear"]',
      );
      expect(clearBtn).not.toBeNull();
      expect(clearBtn?.getAttribute('aria-label')).toBe('Clear');
    });

    it('clear button uses caller-supplied clearLabel', () => {
      render(
        <Input
          value="abc"
          onClear={() => {}}
          onChange={() => {}}
          clearLabel="Reset filter"
        />,
      );
      expect(
        document
          .querySelector('[data-section="input-clear"]')
          ?.getAttribute('aria-label'),
      ).toBe('Reset filter');
    });

    it('clicking the clear button fires onClear', async () => {
      const user = userEvent.setup();
      const onClear = vi.fn();
      render(
        <Input value="abc" onClear={onClear} onChange={() => {}} />,
      );
      const clearBtn = document.querySelector(
        '[data-section="input-clear"]',
      ) as HTMLButtonElement;
      await user.click(clearBtn);
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('clear button adds pr-9 to the input', () => {
      render(
        <Input
          value="abc"
          onClear={() => {}}
          onChange={() => {}}
          placeholder="x"
        />,
      );
      expect(screen.getByPlaceholderText('x')).toHaveClass('pr-9');
    });

    it('trailingIcon takes precedence over clear button', () => {
      render(
        <Input
          value="abc"
          onClear={() => {}}
          onChange={() => {}}
          trailingIcon={<span data-testid="trailing">T</span>}
        />,
      );
      expect(screen.getByTestId('trailing')).toBeInTheDocument();
      expect(
        document.querySelector('[data-section="input-clear"]'),
      ).toBeNull();
    });

    it('clear button works on uncontrolled inputs with defaultValue', () => {
      render(<Input defaultValue="hello" onClear={() => {}} />);
      expect(
        document.querySelector('[data-section="input-clear"]'),
      ).not.toBeNull();
    });
  });

  // ----- (v1.11.327, TODO 11.309) Warning / success states -----

  describe('warning slot', () => {
    it('renders the warning message and tone class', () => {
      render(<Input label="Email" id="email" warning="Will be public" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveClass('border-warning');
      expect(screen.getByText('Will be public')).toBeInTheDocument();
    });

    it('wires aria-describedby to the warning element id', () => {
      render(<Input label="Email" id="email" warning="Watch out" />);
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const warningEl = document.querySelector(
        '[data-section="input-warning"]',
      );
      expect(warningEl?.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(warningEl?.id ?? '');
    });

    it('warning does NOT set aria-invalid', () => {
      render(<Input label="Email" id="email" warning="Watch out" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('success slot', () => {
    it('renders the success message and tone class', () => {
      render(<Input label="Email" id="email" success="Looks good" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveClass('border-success');
      expect(screen.getByText('Looks good')).toBeInTheDocument();
    });

    it('success does NOT set aria-invalid', () => {
      render(<Input label="Email" id="email" success="Looks good" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('state precedence (error > warning > success > default)', () => {
    it('error wins over warning and success', () => {
      render(
        <Input
          label="Email"
          id="email"
          error="Bad"
          warning="Warn"
          success="Good"
        />,
      );
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveClass('border-destructive');
      expect(inputEl).toHaveAttribute('aria-invalid', 'true');
      expect(inputEl.getAttribute('data-state')).toBe('error');
    });

    it('warning wins over success', () => {
      render(
        <Input
          label="Email"
          id="email"
          warning="Warn"
          success="Good"
        />,
      );
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveClass('border-warning');
      expect(inputEl.getAttribute('data-state')).toBe('warning');
    });

    it('default state when no slot is set', () => {
      render(<Input data-testid="i" />);
      expect(screen.getByTestId('i').getAttribute('data-state')).toBe(
        'default',
      );
    });
  });

  // ----- (v1.11.327, TODO 11.309) Data-attribute selectors -----

  describe('data attributes', () => {
    it('input control carries data-section="input-control" + data-state', () => {
      render(<Input data-testid="i" error="bad" />);
      const node = screen.getByTestId('i');
      expect(node.getAttribute('data-section')).toBe('input-control');
      expect(node.getAttribute('data-state')).toBe('error');
    });

    it('slotted input wrapper carries data-section="input-field" + data-state', () => {
      render(<Input label="L" warning="W" />);
      const field = document.querySelector('[data-section="input-field"]');
      expect(field).not.toBeNull();
      expect(field?.getAttribute('data-state')).toBe('warning');
    });
  });
});
