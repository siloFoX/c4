import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { FieldGroup } from './field-group';
import { FormField } from './form-field';

describe('<FieldGroup>', () => {
  it('renders its children', () => {
    render(
      <FieldGroup>
        <span>row-1</span>
        <span>row-2</span>
      </FieldGroup>,
    );
    expect(screen.getByText('row-1')).toBeInTheDocument();
    expect(screen.getByText('row-2')).toBeInTheDocument();
  });

  it('renders a fieldset wrapper at the root', () => {
    const { container } = render(<FieldGroup>x</FieldGroup>);
    const fs = container.querySelector('fieldset');
    expect(fs).not.toBeNull();
  });

  it('tags the root with data-section + data-layout', () => {
    const { container } = render(<FieldGroup>x</FieldGroup>);
    const fs = container.querySelector('[data-section="field-group"]');
    expect(fs).not.toBeNull();
    expect(fs!.getAttribute('data-layout')).toBe('stack');
  });

  it('renders the title as a legend when provided', () => {
    const { container } = render(
      <FieldGroup title="Connection">x</FieldGroup>,
    );
    const legend = container.querySelector('legend');
    expect(legend).not.toBeNull();
    expect(legend!.textContent).toBe('Connection');
  });

  it('omits the legend when no title is set', () => {
    const { container } = render(<FieldGroup>x</FieldGroup>);
    expect(container.querySelector('legend')).toBeNull();
  });

  it('renders the description below the title', () => {
    render(
      <FieldGroup title="Cn" description="One per row">
        x
      </FieldGroup>,
    );
    expect(screen.getByText('One per row')).toBeInTheDocument();
  });

  it('renders the description even without a title (no header collapse)', () => {
    render(<FieldGroup description="Standalone helper">x</FieldGroup>);
    expect(screen.getByText('Standalone helper')).toBeInTheDocument();
  });

  it('renders headingActions on the right when both title and actions are set', () => {
    render(
      <FieldGroup title="Cn" headingActions={<button>Add</button>}>
        x
      </FieldGroup>,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('does NOT render headingActions when title is absent (orphan button hidden)', () => {
    render(
      <FieldGroup headingActions={<button>Add</button>}>x</FieldGroup>,
    );
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('stack layout uses flex-col gap-3 on the body container', () => {
    const { container } = render(<FieldGroup>x</FieldGroup>);
    const body = container.querySelector(
      '[data-section="field-group-body"]',
    );
    expect(body!.className).toContain('flex');
    expect(body!.className).toContain('flex-col');
    expect(body!.className).toContain('gap-3');
  });

  it('grid layout switches the body container to grid-cols-N', () => {
    const { container } = render(
      <FieldGroup layout="grid" columns={2}>
        x
      </FieldGroup>,
    );
    const body = container.querySelector(
      '[data-section="field-group-body"]',
    );
    expect(body!.className).toContain('grid');
    expect(body!.className).toContain('md:grid-cols-2');
  });

  it('grid columns=3 applies the lg:grid-cols-3 breakpoint', () => {
    const { container } = render(
      <FieldGroup layout="grid" columns={3}>
        x
      </FieldGroup>,
    );
    const body = container.querySelector(
      '[data-section="field-group-body"]',
    );
    expect(body!.className).toContain('lg:grid-cols-3');
  });

  it('grid columns=1 maps to a single column', () => {
    const { container } = render(
      <FieldGroup layout="grid" columns={1}>
        x
      </FieldGroup>,
    );
    const body = container.querySelector(
      '[data-section="field-group-body"]',
    );
    expect(body!.className).toContain('grid-cols-1');
  });

  it('grid layout exposes the columns count on data-columns', () => {
    const { container } = render(
      <FieldGroup layout="grid" columns={3}>
        x
      </FieldGroup>,
    );
    const fs = container.querySelector('[data-section="field-group"]');
    expect(fs!.getAttribute('data-columns')).toBe('3');
  });

  it('stack layout does NOT expose data-columns', () => {
    const { container } = render(<FieldGroup>x</FieldGroup>);
    const fs = container.querySelector('[data-section="field-group"]');
    expect(fs!.hasAttribute('data-columns')).toBe(false);
  });

  it('disabled propagates to the native fieldset', () => {
    const { container } = render(
      <FieldGroup disabled>
        <input type="text" />
      </FieldGroup>,
    );
    const fs = container.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fs.disabled).toBe(true);
  });

  it('disabled adds the dimmed opacity class', () => {
    const { container } = render(<FieldGroup disabled>x</FieldGroup>);
    const fs = container.querySelector('fieldset');
    expect(fs!.className).toContain('opacity-60');
  });

  it('non-disabled by default leaves inner controls enabled', () => {
    render(
      <FieldGroup>
        <input type="text" data-testid="inner-input" />
      </FieldGroup>,
    );
    const input = screen.getByTestId('inner-input') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it('disabled adds an `inert`-style descendant block by carrying the disabled attr on the fieldset itself', () => {
    // The native `<fieldset disabled>` -> descendant control
    // disable cascade lives at the browser layer; jsdom does NOT
    // implement it, so we verify the source attribute is on the
    // fieldset and trust the browser to enforce it at runtime.
    const { container } = render(
      <FieldGroup disabled>
        <input type="text" data-testid="inner-input" />
      </FieldGroup>,
    );
    const fs = container.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fs.disabled).toBe(true);
  });

  it('composes with FormField rows inside (smoke test)', () => {
    render(
      <FieldGroup title="Compose">
        <FormField label="Host">
          <input type="text" data-testid="host-input" />
        </FormField>
        <FormField label="Port">
          <input type="number" data-testid="port-input" />
        </FormField>
      </FieldGroup>,
    );
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getByText('Port')).toBeInTheDocument();
    expect(screen.getByTestId('host-input')).toBeInTheDocument();
    expect(screen.getByTestId('port-input')).toBeInTheDocument();
  });

  it('merges caller className on the root fieldset', () => {
    const { container } = render(
      <FieldGroup className="custom-group">x</FieldGroup>,
    );
    const fs = container.querySelector('fieldset');
    expect(fs!.className).toContain('custom-group');
    expect(fs!.className).toContain('rounded-lg');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<FieldGroup data-testid="my-group">x</FieldGroup>);
    expect(screen.getByTestId('my-group')).toBeInTheDocument();
  });

  it('forwards a ref to the fieldset element', () => {
    const ref = createRef<HTMLFieldSetElement>();
    render(<FieldGroup ref={ref}>x</FieldGroup>);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLFieldSetElement);
  });

  it('hides the header block entirely when title + description + actions are all absent', () => {
    const { container } = render(<FieldGroup>x</FieldGroup>);
    expect(
      container.querySelector('[data-section="field-group-header"]'),
    ).toBeNull();
  });

  it('header block renders when only description is set', () => {
    const { container } = render(<FieldGroup description="only">x</FieldGroup>);
    expect(
      container.querySelector('[data-section="field-group-header"]'),
    ).not.toBeNull();
  });
});
