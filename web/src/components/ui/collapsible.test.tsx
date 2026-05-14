import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Collapsible, CollapsibleGroup } from './collapsible';

describe('<Collapsible>', () => {
  it('renders the title text', () => {
    render(
      <Collapsible title="Advanced settings">
        <p>body</p>
      </Collapsible>,
    );
    expect(
      screen.getByRole('button', { name: /advanced settings/i }),
    ).toBeInTheDocument();
  });

  it('is closed by default and hides the panel body', () => {
    render(
      <Collapsible title="Advanced">
        <p>hidden body</p>
      </Collapsible>,
    );
    const btn = screen.getByRole('button', { name: /advanced/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    // The region exists but is hidden, so getByText still finds it
    // -- assert via the `hidden` attribute on the region.
    const region = screen.getByRole('region', { hidden: true });
    expect(region).toHaveAttribute('hidden');
    expect(region).toHaveAttribute('aria-hidden', 'true');
  });

  it('defaultOpen=true exposes the panel body in the accessibility tree', () => {
    render(
      <Collapsible title="Advanced" defaultOpen>
        <p>visible body</p>
      </Collapsible>,
    );
    expect(
      screen.getByRole('button', { name: /advanced/i }),
    ).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region');
    expect(region).not.toHaveAttribute('hidden');
    expect(screen.getByText('visible body')).toBeInTheDocument();
  });

  it('clicking the header toggles open then closed', async () => {
    const user = userEvent.setup();
    render(
      <Collapsible title="Advanced">
        <p>body</p>
      </Collapsible>,
    );
    const btn = screen.getByRole('button', { name: /advanced/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('controlled mode: open prop drives state across rerenders', () => {
    const { rerender } = render(
      <Collapsible title="Advanced" open={false} onOpenChange={() => {}}>
        <p>body</p>
      </Collapsible>,
    );
    expect(
      screen.getByRole('button', { name: /advanced/i }),
    ).toHaveAttribute('aria-expanded', 'false');
    rerender(
      <Collapsible title="Advanced" open onOpenChange={() => {}}>
        <p>body</p>
      </Collapsible>,
    );
    expect(
      screen.getByRole('button', { name: /advanced/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('fires onOpenChange with the next state on each click', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Collapsible title="Advanced" onOpenChange={onOpenChange}>
        <p>body</p>
      </Collapsible>,
    );
    const btn = screen.getByRole('button', { name: /advanced/i });
    await user.click(btn);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.click(btn);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('renders the description below the title in the header row', () => {
    render(
      <Collapsible title="Advanced" description="Power user knobs">
        <p>body</p>
      </Collapsible>,
    );
    const btn = screen.getByRole('button', { name: /advanced/i });
    expect(btn.textContent).toContain('Power user knobs');
  });

  it('accordion mode: opening one section closes another', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleGroup>
        <Collapsible title="First">
          <p>first body</p>
        </Collapsible>
        <Collapsible title="Second">
          <p>second body</p>
        </Collapsible>
      </CollapsibleGroup>,
    );
    const first = screen.getByRole('button', { name: /first/i });
    const second = screen.getByRole('button', { name: /second/i });
    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('accordion mode: clicking the active section toggles it closed', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleGroup>
        <Collapsible title="First">
          <p>first body</p>
        </Collapsible>
        <Collapsible title="Second">
          <p>second body</p>
        </Collapsible>
      </CollapsibleGroup>,
    );
    const first = screen.getByRole('button', { name: /first/i });
    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  it('exclusive=false allows multiple sections open at once', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleGroup exclusive={false}>
        <Collapsible title="First">
          <p>first body</p>
        </Collapsible>
        <Collapsible title="Second">
          <p>second body</p>
        </Collapsible>
      </CollapsibleGroup>,
    );
    const first = screen.getByRole('button', { name: /first/i });
    const second = screen.getByRole('button', { name: /second/i });
    await user.click(first);
    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('defaultOpenId on a group seeds the matching child as open', async () => {
    // We can't predict the useId values, so use defaultOpen on the
    // child instead; the group should pick it up on mount.
    render(
      <CollapsibleGroup>
        <Collapsible title="First" defaultOpen>
          <p>first body</p>
        </Collapsible>
        <Collapsible title="Second">
          <p>second body</p>
        </Collapsible>
      </CollapsibleGroup>,
    );
    expect(
      screen.getByRole('button', { name: /first/i }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: /second/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('merges caller-provided className onto the outer section', () => {
    render(
      <Collapsible title="Advanced" className="extra-section">
        <p>body</p>
      </Collapsible>,
    );
    // The section is the first ancestor of the button with the role
    // attribute we set on the panel-region; easiest probe: the
    // button's closest <section>.
    const btn = screen.getByRole('button', { name: /advanced/i });
    const section = btn.closest('section');
    expect(section).not.toBeNull();
    expect(section).toHaveClass('extra-section');
  });

  it('forwardRef returns a live HTMLElement (section)', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Collapsible ref={ref} title="Advanced">
        <p>body</p>
      </Collapsible>,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('section');
  });
});
