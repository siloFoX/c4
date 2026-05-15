import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsPanel, type TabsItem } from './tabs';

const ITEMS: TabsItem[] = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
  { value: 'three', label: 'Three' },
];

describe('<Tabs>', () => {
  it('renders a tablist with one tab per item and the default aria-label', () => {
    render(<Tabs value="one" onChange={() => {}} items={ITEMS} />);
    const list = screen.getByRole('tablist', { name: 'Tabs' });
    expect(within(list).getAllByRole('tab')).toHaveLength(3);
  });

  it('uses ariaLabel prop on the tablist when provided', () => {
    render(
      <Tabs value="one" onChange={() => {}} items={ITEMS} ariaLabel="Sections" />,
    );
    expect(
      screen.getByRole('tablist', { name: 'Sections' }),
    ).toBeInTheDocument();
  });

  it('marks the tab matching value as aria-selected, others false', () => {
    render(<Tabs value="two" onChange={() => {}} items={ITEMS} />);
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('fires onChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="one" onChange={onChange} items={ITEMS} />);
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    expect(onChange).toHaveBeenCalledWith('two');
  });

  it('applies roving tabindex: active=0, inactive=-1', () => {
    render(<Tabs value="two" onChange={() => {}} items={ITEMS} />);
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('ArrowRight moves selection + focus to the next tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="one" onChange={onChange} items={ITEMS} />);
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('two');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'Two' }),
    );
  });

  it('ArrowLeft moves selection + focus to the previous tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="two" onChange={onChange} items={ITEMS} />);
    screen.getByRole('tab', { name: 'Two' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('one');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'One' }),
    );
  });

  it('ArrowRight on the last tab wraps to the first', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="three" onChange={onChange} items={ITEMS} />);
    screen.getByRole('tab', { name: 'Three' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('one');
  });

  it('ArrowLeft on the first tab wraps to the last', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="one" onChange={onChange} items={ITEMS} />);
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('three');
  });

  it('Home jumps to the first tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="three" onChange={onChange} items={ITEMS} />);
    screen.getByRole('tab', { name: 'Three' }).focus();
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('one');
  });

  it('End jumps to the last tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="one" onChange={onChange} items={ITEMS} />);
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('three');
  });

  it('skips disabled items during arrow navigation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items: TabsItem[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two', disabled: true },
      { value: 'three', label: 'Three' },
    ];
    render(<Tabs value="one" onChange={onChange} items={items} />);
    screen.getByRole('tab', { name: 'One' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('three');
  });

  it('does not fire onChange when a disabled tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items: TabsItem[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two', disabled: true },
    ];
    render(<Tabs value="one" onChange={onChange} items={items} />);
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the supplied icon node alongside the label', () => {
    const items: TabsItem[] = [
      {
        value: 'one',
        label: 'One',
        icon: <svg data-testid="icon-one" aria-hidden="true" />,
      },
      { value: 'two', label: 'Two' },
    ];
    render(<Tabs value="one" onChange={() => {}} items={items} />);
    const tabOne = screen.getByRole('tab', { name: 'One' });
    expect(within(tabOne).getByTestId('icon-one')).toBeInTheDocument();
  });

  it('wires aria-controls + aria-labelledby between tabs and TabsPanel', () => {
    render(
      <Tabs value="one" onChange={() => {}} items={ITEMS}>
        <TabsPanel value="one">panel one</TabsPanel>
        <TabsPanel value="two">panel two</TabsPanel>
      </Tabs>,
    );

    const tabOne = screen.getByRole('tab', { name: 'One' });
    const controls = tabOne.getAttribute('aria-controls');
    const tabId = tabOne.getAttribute('id');
    expect(controls).toBeTruthy();
    expect(tabId).toBeTruthy();

    const panel = document.getElementById(controls!);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('aria-labelledby', tabId);
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel).toHaveTextContent('panel one');
  });

  it('hides inactive TabsPanel and renders only the active one', () => {
    const { rerender } = render(
      <Tabs value="one" onChange={() => {}} items={ITEMS}>
        <TabsPanel value="one">panel one</TabsPanel>
        <TabsPanel value="two">panel two</TabsPanel>
      </Tabs>,
    );

    expect(screen.getByText('panel one')).toBeInTheDocument();
    expect(screen.queryByText('panel two')).not.toBeInTheDocument();

    rerender(
      <Tabs value="two" onChange={() => {}} items={ITEMS}>
        <TabsPanel value="one">panel one</TabsPanel>
        <TabsPanel value="two">panel two</TabsPanel>
      </Tabs>,
    );
    expect(screen.queryByText('panel one')).not.toBeInTheDocument();
    expect(screen.getByText('panel two')).toBeInTheDocument();
  });

  it('applies focus-visible ring classes to every tab', () => {
    render(<Tabs value="one" onChange={() => {}} items={ITEMS} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toMatch(/focus-visible:ring-2/);
      expect(tab.className).toMatch(/focus-visible:ring-primary/);
    }
  });

  it('applies active vs inactive class sets per the value prop', () => {
    render(<Tabs value="two" onChange={() => {}} items={ITEMS} />);
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveClass('bg-primary/30');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('plumbs ariaLabel + title onto a tab when supplied by the item', () => {
    const items: TabsItem[] = [
      { value: 'one', label: 'One', ariaLabel: 'First tab', title: 'First tab' },
      { value: 'two', label: 'Two' },
    ];
    render(<Tabs value="one" onChange={() => {}} items={items} />);
    const tab = screen.getByRole('tab', { name: 'First tab' });
    expect(tab).toHaveAttribute('aria-label', 'First tab');
    expect(tab).toHaveAttribute('title', 'First tab');
  });

  it('forwards a custom className onto the tablist container', () => {
    render(
      <Tabs
        value="one"
        onChange={() => {}}
        items={ITEMS}
        className="custom-strip"
      />,
    );
    expect(screen.getByRole('tablist')).toHaveClass('custom-strip');
  });

  it('arrow keys are a no-op when focus is outside the tab strip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="one" onChange={onChange} items={ITEMS} />);
    document.body.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  // -- v1.11.246 onPrefetch wiring (TODO 11.228) -------------------

  it('fires onPrefetch with the tab value on mouseenter for an inactive tab', async () => {
    const user = userEvent.setup();
    const onPrefetch = vi.fn();
    render(
      <Tabs value="one" onChange={() => {}} items={ITEMS} onPrefetch={onPrefetch} />,
    );
    await user.hover(screen.getByRole('tab', { name: 'Two' }));
    expect(onPrefetch).toHaveBeenCalledWith('two');
  });

  it('fires onPrefetch on focus for an inactive tab', () => {
    const onPrefetch = vi.fn();
    render(
      <Tabs value="one" onChange={() => {}} items={ITEMS} onPrefetch={onPrefetch} />,
    );
    const target = screen.getByRole('tab', { name: 'Two' });
    target.focus();
    expect(onPrefetch).toHaveBeenCalledWith('two');
  });

  it('does NOT fire onPrefetch for the already-active tab', async () => {
    const user = userEvent.setup();
    const onPrefetch = vi.fn();
    render(
      <Tabs value="one" onChange={() => {}} items={ITEMS} onPrefetch={onPrefetch} />,
    );
    await user.hover(screen.getByRole('tab', { name: 'One' }));
    expect(onPrefetch).not.toHaveBeenCalled();
  });

  it('does NOT fire onPrefetch for a disabled tab', async () => {
    const user = userEvent.setup();
    const onPrefetch = vi.fn();
    const items: TabsItem[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two', disabled: true },
    ];
    render(
      <Tabs value="one" onChange={() => {}} items={items} onPrefetch={onPrefetch} />,
    );
    await user.hover(screen.getByRole('tab', { name: 'Two' }));
    expect(onPrefetch).not.toHaveBeenCalled();
  });
});
