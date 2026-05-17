import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Accordion, type AccordionItem } from './accordion';

function makeItems(): AccordionItem[] {
  return [
    { id: 'a', title: 'Alpha', content: <span>alpha body</span> },
    { id: 'b', title: 'Beta', content: <span>beta body</span> },
    { id: 'c', title: 'Gamma', content: <span>gamma body</span> },
  ];
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('<Accordion>', () => {
  it('renders one section per item', () => {
    const { container } = render(<Accordion items={makeItems()} />);
    expect(container.querySelectorAll('[data-accordion-item]')).toHaveLength(3);
  });

  it('renders the role=region wrapper with the default ariaLabel', () => {
    render(<Accordion items={makeItems()} />);
    expect(
      screen.getByRole('region', { name: 'Accordion' }),
    ).toBeInTheDocument();
  });

  it('accepts a custom ariaLabel override', () => {
    render(<Accordion items={makeItems()} ariaLabel="Setup" />);
    expect(
      screen.getByRole('region', { name: 'Setup' }),
    ).toBeInTheDocument();
  });

  it('exposes data-section + data-mode on the root', () => {
    const { container } = render(
      <Accordion items={makeItems()} mode="multi" />,
    );
    const root = container.querySelector('[data-section="accordion"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-mode')).toBe('multi');
  });

  it('all items start closed by default', () => {
    render(<Accordion items={makeItems()} />);
    expect(
      screen
        .getByRole('button', { name: 'Alpha' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('item with defaultOpen=true starts open', () => {
    const items = makeItems();
    items[1]!.defaultOpen = true;
    render(<Accordion items={items} />);
    expect(
      screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('defaultOpenIds prop seeds the initial open set', () => {
    render(
      <Accordion items={makeItems()} mode="multi" defaultOpenIds={['a', 'c']} />,
    );
    expect(
      screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Gamma' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('single mode keeps at most one item open from multi-seed defaultOpenIds', () => {
    render(
      <Accordion items={makeItems()} mode="single" defaultOpenIds={['a', 'c']} />,
    );
    // Only the first one survives the single-mode clamp.
    expect(
      screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Gamma' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('clicking a trigger opens the panel (single mode)', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(
      screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('clicking a second trigger closes the first one (single mode)', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(
      screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('clicking the same trigger twice closes the panel (single mode)', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    const beta = screen.getByRole('button', { name: 'Beta' });
    await user.click(beta);
    await user.click(beta);
    expect(beta.getAttribute('aria-expanded')).toBe('false');
  });

  it('multi mode keeps both panels open after clicking each trigger', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} mode="multi" />);
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));
    expect(
      screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('roving tabindex: first enabled trigger is tabindex=0, rest are tabindex=-1', () => {
    render(<Accordion items={makeItems()} />);
    expect(
      screen.getByRole('button', { name: 'Alpha' }).getAttribute('tabindex'),
    ).toBe('0');
    expect(
      screen.getByRole('button', { name: 'Beta' }).getAttribute('tabindex'),
    ).toBe('-1');
  });

  it('ArrowDown moves focus to the next trigger and flips tabindex', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    alpha.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Beta');
  });

  it('ArrowDown wraps from the last trigger back to the first', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    const gamma = screen.getByRole('button', { name: 'Gamma' });
    gamma.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Alpha');
  });

  it('ArrowUp wraps from the first trigger to the last', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    alpha.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toContain('Gamma');
  });

  it('Home jumps focus to the first trigger', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    const gamma = screen.getByRole('button', { name: 'Gamma' });
    gamma.focus();
    await user.keyboard('{Home}');
    expect(document.activeElement?.textContent).toContain('Alpha');
  });

  it('End jumps focus to the last trigger', async () => {
    const user = userEvent.setup();
    render(<Accordion items={makeItems()} />);
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    alpha.focus();
    await user.keyboard('{End}');
    expect(document.activeElement?.textContent).toContain('Gamma');
  });

  it('disabled item is skipped during keyboard nav', async () => {
    const items = makeItems();
    items[1]!.disabled = true; // Beta disabled
    const user = userEvent.setup();
    render(<Accordion items={items} />);
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    alpha.focus();
    await user.keyboard('{ArrowDown}');
    // Should skip Beta and land on Gamma.
    expect(document.activeElement?.textContent).toContain('Gamma');
  });

  it('disabled item does not respond to click', async () => {
    const items = makeItems();
    items[1]!.disabled = true;
    const user = userEvent.setup();
    render(<Accordion items={items} />);
    const beta = screen.getByRole('button', { name: 'Beta' });
    await user.click(beta);
    expect(beta.getAttribute('aria-expanded')).toBe('false');
  });

  it('disabled item carries data-accordion-item-disabled=true', () => {
    const items = makeItems();
    items[1]!.disabled = true;
    const { container } = render(<Accordion items={items} />);
    expect(
      container
        .querySelector('[data-accordion-item="b"]')
        ?.getAttribute('data-accordion-item-disabled'),
    ).toBe('true');
  });

  it('panel renders with role=region + aria-labelledby + aria-hidden when closed', () => {
    const { container } = render(<Accordion items={makeItems()} />);
    const panel = container.querySelector('[data-accordion-panel="a"]');
    expect(panel!.getAttribute('aria-hidden')).toBe('true');
    expect(panel!.hasAttribute('aria-labelledby')).toBe(true);
  });

  it('open panel flips aria-hidden to false', async () => {
    const user = userEvent.setup();
    const { container } = render(<Accordion items={makeItems()} />);
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    const panel = container.querySelector('[data-accordion-panel="a"]');
    expect(panel!.getAttribute('aria-hidden')).toBe('false');
  });

  function ControlledHarness({
    initial,
    items,
  }: {
    initial: string[];
    items: AccordionItem[];
  }) {
    const [ids, setIds] = useState<string[]>(initial);
    return (
      <Accordion
        items={items}
        mode="multi"
        openIds={ids}
        onOpenIdsChange={setIds}
      />
    );
  }

  it('controlled mode: openIds prop is the source of truth', () => {
    render(<ControlledHarness initial={['b']} items={makeItems()} />);
    expect(
      screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('controlled mode: clicking a trigger fires onOpenIdsChange with the new set', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Accordion
        items={makeItems()}
        mode="multi"
        openIds={[]}
        onOpenIdsChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('exposes data-accordion-item-open=true after open', async () => {
    const user = userEvent.setup();
    const { container } = render(<Accordion items={makeItems()} />);
    await user.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(
      container
        .querySelector('[data-accordion-item="a"]')
        ?.getAttribute('data-accordion-item-open'),
    ).toBe('true');
  });

  it('exposes data-accordion-trigger=<id> on every trigger', () => {
    const { container } = render(<Accordion items={makeItems()} />);
    expect(container.querySelector('[data-accordion-trigger="a"]')).not.toBeNull();
    expect(container.querySelector('[data-accordion-trigger="b"]')).not.toBeNull();
    expect(container.querySelector('[data-accordion-trigger="c"]')).not.toBeNull();
  });

  it('renders an item description below the title when provided', () => {
    const items = makeItems();
    items[0]!.description = 'the first letter';
    render(<Accordion items={items} />);
    expect(screen.getByText('the first letter')).toBeInTheDocument();
  });

  it('merges caller className with the root', () => {
    const { container } = render(
      <Accordion items={makeItems()} className="custom-accordion" />,
    );
    const root = container.querySelector('[data-section="accordion"]');
    expect(root!.className).toContain('custom-accordion');
    expect(root!.className).toContain('flex-col');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<Accordion items={makeItems()} data-testid="my-acc" />);
    expect(screen.getByTestId('my-acc')).toBeInTheDocument();
  });

  it('suppresses chevron transition class when reduced-motion is set', () => {
    // Re-stub matchMedia for this test.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: q === '(prefers-reduced-motion: reduce)',
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const { container } = render(<Accordion items={makeItems()} />);
    const chevron = container.querySelector('svg');
    expect(chevron?.getAttribute('class') ?? '').not.toContain(
      'transition-transform',
    );
  });
});
