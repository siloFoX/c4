import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl, type SegmentedControlOption } from './segmented-control';

type Range = '24h' | '7d' | '30d';
const RANGES: SegmentedControlOption<Range>[] = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

describe('<SegmentedControl>', () => {
  it('renders one tab per option', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
  });

  it('marks the selected value with aria-selected=true', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="7d"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('false');
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('false');
  });

  it('exposes role=tablist + aria-label on the root', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
        ariaLabel="Range filter"
      />,
    );
    const root = screen.getByRole('tablist');
    expect(root.getAttribute('aria-label')).toBe('Range filter');
  });

  it('tags the root with data-section + data-size attrs', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
        size="sm"
      />,
    );
    const root = document.querySelector('[data-section="segmented-control"]')!;
    expect(root.getAttribute('data-size')).toBe('sm');
  });

  it('clicking a non-active tab calls onChange with that value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Last 7 days' }));
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('roving tabindex: only the selected segment has tabindex=0', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="7d"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.getAttribute('tabindex')).toBe('-1');
    expect(tabs[1]!.getAttribute('tabindex')).toBe('0');
    expect(tabs[2]!.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight moves keyboard focus to the next tab without selecting it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tabs[1]);
    // Manual selection mode: arrow nav does NOT fire onChange.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ArrowLeft moves focus backwards and wraps at the first segment', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowLeft}');
    // Wraps to the last segment.
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('Home jumps focus to the first segment', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="30d"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[2]!.focus();
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('End jumps focus to the last segment', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('Enter selects the focused segment (manual mode)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('Space selects the focused segment (manual mode)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('selectOnFocus=true auto-fires onChange when arrow nav moves focus', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={onChange}
        selectOnFocus
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('skips disabled segments during ArrowRight navigation', async () => {
    const opts: SegmentedControlOption<Range>[] = [
      { value: '24h', label: '24h' },
      { value: '7d', label: '7d', disabled: true },
      { value: '30d', label: '30d' },
    ];
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={opts}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('disabled segments do not respond to click', async () => {
    const opts: SegmentedControlOption<Range>[] = [
      { value: '24h', label: '24h' },
      { value: '7d', label: '7d', disabled: true },
      { value: '30d', label: '30d' },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl<Range>
        options={opts}
        value="24h"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('tab', { name: '7d' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders icon-only segments with the optional ariaLabel as the accessible name', () => {
    const opts: SegmentedControlOption<'compact' | 'full'>[] = [
      { value: 'compact', icon: <svg data-testid="ic-compact" />, ariaLabel: 'Compact view' },
      { value: 'full', icon: <svg data-testid="ic-full" />, ariaLabel: 'Full view' },
    ];
    render(
      <SegmentedControl
        options={opts}
        value="compact"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Compact view' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Full view' })).toBeInTheDocument();
  });

  it('icon+label segments render both the glyph and the text', () => {
    const opts: SegmentedControlOption<Range>[] = [
      { value: '24h', label: '24h', icon: <svg data-testid="ic" /> },
    ];
    render(
      <SegmentedControl<Range>
        options={opts}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ic')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
  });

  it('size="sm" maps to the smaller height/padding tokens', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
        size="sm"
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.className).toContain('h-6');
  });

  it('size default ("md") maps to the larger height/padding tokens', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.className).toContain('h-8');
  });

  it('data-segmented-value + data-segmented-active expose the option / state for e2e selectors', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="7d"
        onChange={vi.fn()}
      />,
    );
    const seg7d = document.querySelector('[data-segmented-value="7d"]');
    expect(seg7d).not.toBeNull();
    expect(seg7d!.getAttribute('data-segmented-active')).toBe('true');
    const seg30d = document.querySelector('[data-segmented-value="30d"]');
    expect(seg30d!.getAttribute('data-segmented-active')).toBe('false');
  });

  it('out-of-band value change re-syncs the roving tabindex onto the new active segment', () => {
    const { rerender } = render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    let tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.getAttribute('tabindex')).toBe('0');
    rerender(
      <SegmentedControl<Range>
        options={RANGES}
        value="30d"
        onChange={vi.fn()}
      />,
    );
    tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.getAttribute('tabindex')).toBe('-1');
    expect(tabs[2]!.getAttribute('tabindex')).toBe('0');
  });

  it('disables the native button via the `disabled` HTML attribute', () => {
    const opts: SegmentedControlOption<Range>[] = [
      { value: '24h', label: '24h' },
      { value: '7d', label: '7d', disabled: true },
      { value: '30d', label: '30d' },
    ];
    render(
      <SegmentedControl<Range>
        options={opts}
        value="24h"
        onChange={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole('tab', { name: '7d' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('merges caller className with built-in pill classes', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
        className="custom-segment"
      />,
    );
    const root = screen.getByRole('tablist');
    expect(root.className).toContain('custom-segment');
    expect(root.className).toContain('rounded-full');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(
      <SegmentedControl<Range>
        options={RANGES}
        value="24h"
        onChange={vi.fn()}
        data-testid="my-seg"
      />,
    );
    expect(screen.getByTestId('my-seg')).toBeInTheDocument();
  });
});
