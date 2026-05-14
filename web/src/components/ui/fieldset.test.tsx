import { describe, it, expect, vi } from 'vitest';
import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fieldset } from './fieldset';

describe('<Fieldset>', () => {
  it('renders legend text', () => {
    render(
      <Fieldset legend="Routing">
        <input aria-label="model" />
      </Fieldset>,
    );
    expect(screen.getByText('Routing')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <Fieldset legend="Routing" description="Pick a model">
        <span>child</span>
      </Fieldset>,
    );
    expect(screen.getByText('Pick a model')).toBeInTheDocument();
  });

  it('omits description element when not provided', () => {
    const { container } = render(
      <Fieldset legend="Routing">
        <span>child</span>
      </Fieldset>,
    );
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders children', () => {
    render(
      <Fieldset legend="Routing">
        <span data-testid="kid">hello</span>
      </Fieldset>,
    );
    expect(screen.getByTestId('kid')).toBeInTheDocument();
  });

  it('disabled forwards to fieldset element', () => {
    const { container } = render(
      <Fieldset legend="Routing" disabled>
        <input aria-label="x" />
      </Fieldset>,
    );
    const fs = container.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fs).toBeDisabled();
  });

  it('collapsible legend button toggles aria-expanded on click', async () => {
    const user = userEvent.setup();
    render(
      <Fieldset legend="Routing" collapsible>
        <span>child</span>
      </Fieldset>,
    );
    const btn = screen.getByRole('button', { name: /Routing/ });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('collapsible default open shows children', () => {
    render(
      <Fieldset legend="Routing" collapsible>
        <span data-testid="kid">child</span>
      </Fieldset>,
    );
    const kid = screen.getByTestId('kid');
    expect(kid).toBeInTheDocument();
    // Parent wrapper is not hidden.
    expect(kid.parentElement).not.toHaveAttribute('hidden');
  });

  it('collapsible defaultOpen=false hides children via hidden attribute', () => {
    render(
      <Fieldset legend="Routing" collapsible defaultOpen={false}>
        <span data-testid="kid">child</span>
      </Fieldset>,
    );
    const kid = screen.getByTestId('kid');
    expect(kid.parentElement).toHaveAttribute('hidden');
  });

  it('controlled open prop drives aria-expanded', () => {
    const Wrapper = () => {
      const [o, setO] = useState(false);
      return (
        <>
          <button onClick={() => setO(true)}>open</button>
          <Fieldset legend="Routing" collapsible open={o} onOpenChange={() => {}}>
            <span>child</span>
          </Fieldset>
        </>
      );
    };
    render(<Wrapper />);
    const legendBtn = screen.getByRole('button', { name: /Routing/ });
    expect(legendBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('onOpenChange fires when user toggles', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Fieldset legend="Routing" collapsible onOpenChange={onOpenChange}>
        <span>child</span>
      </Fieldset>,
    );
    await user.click(screen.getByRole('button', { name: /Routing/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('non-collapsible: no button, legend is plain text', () => {
    render(
      <Fieldset legend="Routing">
        <span>child</span>
      </Fieldset>,
    );
    expect(screen.queryByRole('button', { name: /Routing/ })).toBeNull();
    expect(screen.getByText('Routing').tagName).toBe('LEGEND');
  });

  it('className merges onto fieldset element', () => {
    const { container } = render(
      <Fieldset legend="Routing" className="custom-class">
        <span>child</span>
      </Fieldset>,
    );
    const fs = container.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fs.className).toContain('custom-class');
  });

  it('forwardRef exposes the fieldset element', () => {
    const ref = createRef<HTMLFieldSetElement>();
    render(
      <Fieldset legend="Routing" ref={ref}>
        <span>child</span>
      </Fieldset>,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('FIELDSET');
  });
});
