import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './form-field';

describe('<FormField>', () => {
  it('renders label connected to control via htmlFor / id', () => {
    render(
      <FormField id="email" label="Email">
        <input data-testid="ctl" type="email" />
      </FormField>,
    );
    const label = screen.getByText('Email');
    const control = screen.getByTestId('ctl');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'email');
    expect(control).toHaveAttribute('id', 'email');
  });

  it('auto-generates a unique id when none is provided', () => {
    render(
      <div>
        <FormField label="First">
          <input data-testid="a" />
        </FormField>
        <FormField label="Second">
          <input data-testid="b" />
        </FormField>
      </div>,
    );
    const a = screen.getByTestId('a');
    const b = screen.getByTestId('b');
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toEqual(b.id);
    // Each label should point at the matching control
    const labelA = a.parentElement?.parentElement?.querySelector('label');
    const labelB = b.parentElement?.parentElement?.querySelector('label');
    expect(labelA).toHaveAttribute('for', a.id);
    expect(labelB).toHaveAttribute('for', b.id);
  });

  it('accepts an externally provided id (no auto-id collision)', () => {
    render(
      <FormField id="custom-id" label="Name">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(screen.getByTestId('ctl')).toHaveAttribute('id', 'custom-id');
    expect(screen.getByText('Name')).toHaveAttribute('for', 'custom-id');
  });

  it('renders the required indicator when required=true', () => {
    render(
      <FormField id="x" label="Name" required>
        <input />
      </FormField>,
    );
    const star = screen.getByTestId('form-field-required');
    expect(star).toBeInTheDocument();
    expect(star).toHaveClass('text-destructive');
  });

  it('omits the required indicator by default', () => {
    render(
      <FormField id="x" label="Name">
        <input />
      </FormField>,
    );
    expect(screen.queryByTestId('form-field-required')).toBeNull();
  });

  it('renders helperText in the muted-foreground tone and links it via aria-describedby', () => {
    render(
      <FormField id="x" label="Name" helperText="At least 3 chars">
        <input data-testid="ctl" />
      </FormField>,
    );
    const helper = screen.getByText('At least 3 chars');
    expect(helper).toHaveClass('text-muted-foreground');
    expect(helper).toHaveAttribute('id', 'x-helper');
    expect(screen.getByTestId('ctl')).toHaveAttribute(
      'aria-describedby',
      'x-helper',
    );
  });

  it('renders the error message in destructive tone and sets aria-invalid + aria-describedby on the control', () => {
    render(
      <FormField id="x" label="Name" error="Required">
        <input data-testid="ctl" />
      </FormField>,
    );
    const err = screen.getByText('Required');
    expect(err).toHaveClass('text-destructive');
    expect(err).toHaveAttribute('role', 'alert');
    expect(err).toHaveAttribute('id', 'x-error');
    const ctl = screen.getByTestId('ctl');
    expect(ctl).toHaveAttribute('aria-invalid', 'true');
    expect(ctl).toHaveAttribute('aria-describedby', 'x-error');
  });

  it('shows error in place of helperText when both are provided', () => {
    render(
      <FormField
        id="x"
        label="Name"
        helperText="Helper copy"
        error="Bad value"
      >
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(screen.queryByText('Helper copy')).toBeNull();
    expect(screen.getByText('Bad value')).toBeInTheDocument();
    expect(screen.getByTestId('ctl')).toHaveAttribute(
      'aria-describedby',
      'x-error',
    );
  });

  it('layout="horizontal" places the label to the left of the control', () => {
    render(
      <FormField id="x" label="Name" layout="horizontal">
        <input data-testid="ctl" />
      </FormField>,
    );
    const ctl = screen.getByTestId('ctl');
    const wrapper = ctl.closest('[data-layout]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('data-layout', 'horizontal');
    expect(wrapper).toHaveClass('flex-row');
    const label = screen.getByText('Name');
    expect(label).toHaveClass('w-[30%]');
  });

  it('defaults to vertical layout', () => {
    render(
      <FormField id="x" label="Name">
        <input data-testid="ctl" />
      </FormField>,
    );
    const wrapper = screen.getByTestId('ctl').closest('[data-layout]');
    expect(wrapper).toHaveAttribute('data-layout', 'vertical');
    expect(wrapper).toHaveClass('flex-col');
  });

  it('keeps the child-provided id when both child and FormField specify one', () => {
    render(
      <FormField id="outer" label="Name">
        <input data-testid="ctl" id="inner" />
      </FormField>,
    );
    const ctl = screen.getByTestId('ctl');
    // The child's own id wins -- label points at the same id so the
    // association is still valid.
    expect(ctl).toHaveAttribute('id', 'inner');
    expect(screen.getByText('Name')).toHaveAttribute('for', 'inner');
  });

  it('merges caller className onto the wrapper', () => {
    render(
      <FormField id="x" label="Name" className="my-row">
        <input data-testid="ctl" />
      </FormField>,
    );
    const wrapper = screen.getByTestId('ctl').closest('[data-layout]');
    expect(wrapper).toHaveClass('my-row');
  });

  // (v1.11.303, TODO 11.285) New warning state + data-section
  // selectors.

  it('renders the warning message in warning palette with role=status', () => {
    render(
      <FormField id="x" label="Name" warning="Heads up.">
        <input data-testid="ctl" />
      </FormField>,
    );
    const msg = screen.getByRole('status');
    expect(msg).toHaveTextContent('Heads up.');
    expect(msg).toHaveClass('text-warning');
  });

  it('warning state does NOT flip aria-invalid on the control', () => {
    render(
      <FormField id="x" label="Name" warning="Heads up.">
        <input data-testid="ctl" />
      </FormField>,
    );
    const ctl = screen.getByTestId('ctl');
    expect(ctl).not.toHaveAttribute('aria-invalid');
  });

  it('error wins over warning when both are set', () => {
    render(
      <FormField
        id="x"
        label="Name"
        warning="Heads up."
        error="Required."
      >
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('ctl')).toHaveAttribute('aria-invalid', 'true');
  });

  it('warning suppresses the helperText slot', () => {
    render(
      <FormField
        id="x"
        label="Name"
        helperText="Plain hint."
        warning="Heads up."
      >
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(screen.queryByText('Plain hint.')).toBeNull();
    expect(screen.getByText('Heads up.')).toBeInTheDocument();
  });

  it('warning plumbs aria-describedby with the warning id', () => {
    render(
      <FormField id="my-input" label="Name" warning="Heads up.">
        <input data-testid="ctl" />
      </FormField>,
    );
    const ctl = screen.getByTestId('ctl');
    const describedBy = ctl.getAttribute('aria-describedby');
    expect(describedBy).toBe('my-input-warning');
  });

  it('data-state="ok" by default, "error" on error, "warning" on warning', () => {
    const { rerender } = render(
      <FormField id="x" label="Name">
        <input data-testid="ctl" />
      </FormField>,
    );
    const wrapper = () =>
      screen.getByTestId('ctl').closest(
        '[data-section="form-field"]',
      ) as HTMLElement;
    expect(wrapper().getAttribute('data-state')).toBe('ok');
    rerender(
      <FormField id="x" label="Name" warning="warn">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(wrapper().getAttribute('data-state')).toBe('warning');
    rerender(
      <FormField id="x" label="Name" error="err">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(wrapper().getAttribute('data-state')).toBe('error');
  });

  it('exposes data-section selectors on wrapper / label / required', () => {
    render(
      <FormField id="x" label="Name" required>
        <input data-testid="ctl" />
      </FormField>,
    );
    const wrapper = screen.getByTestId('ctl').closest(
      '[data-section="form-field"]',
    );
    expect(wrapper).not.toBeNull();
    expect(
      wrapper!.querySelector('[data-section="form-field-label"]'),
    ).not.toBeNull();
    expect(
      wrapper!.querySelector('[data-section="form-field-required"]'),
    ).not.toBeNull();
  });

  it('exposes data-section="form-field-error" + "form-field-warning" + "form-field-helper" per state', () => {
    const { rerender } = render(
      <FormField id="x" label="Name" helperText="hint">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(
      document.querySelector('[data-section="form-field-helper"]'),
    ).not.toBeNull();
    rerender(
      <FormField id="x" label="Name" warning="warn">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(
      document.querySelector('[data-section="form-field-warning"]'),
    ).not.toBeNull();
    rerender(
      <FormField id="x" label="Name" error="err">
        <input data-testid="ctl" />
      </FormField>,
    );
    expect(
      document.querySelector('[data-section="form-field-error"]'),
    ).not.toBeNull();
  });
});
