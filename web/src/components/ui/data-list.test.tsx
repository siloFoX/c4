import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataList, type DataListItem } from './data-list';

const baseItems: DataListItem[] = [
  { id: 'pid', label: 'PID', value: '12345' },
  { id: 'uptime', label: 'Uptime', value: '2h' },
  { id: 'branch', label: 'Branch', value: 'c4/main' },
];

describe('<DataList>', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders all label/value pairs', () => {
    render(<DataList items={baseItems} />);
    expect(screen.getByText('PID')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
    expect(screen.getByText('c4/main')).toBeInTheDocument();
  });

  it('defaults to horizontal orientation', () => {
    const { container } = render(<DataList items={baseItems} />);
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    expect(dl?.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('applies vertical orientation when requested', () => {
    const { container } = render(
      <DataList items={baseItems} orientation="vertical" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.getAttribute('data-orientation')).toBe('vertical');
  });

  it('renders a copy button when copyValue is provided', () => {
    render(
      <DataList
        items={[
          { id: 'sid', label: 'Session', value: 'abc-123', copyValue: 'abc-123' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Copy Session' })).toBeInTheDocument();
  });

  it('does NOT render a copy button when copyValue is absent', () => {
    render(
      <DataList
        items={[{ id: 'sid', label: 'Session', value: 'abc-123' }]}
      />,
    );
    expect(screen.queryByRole('button', { name: /Copy/ })).toBeNull();
  });

  it('invokes navigator.clipboard.writeText with the copyValue on click', async () => {
    render(
      <DataList
        items={[
          { id: 'sid', label: 'Session', value: 'abc-123', copyValue: 'abc-123' },
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Copy Session' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc-123');
  });

  it('shows a Check icon transiently after copy and reverts after the timer', async () => {
    vi.useFakeTimers();
    render(
      <DataList
        items={[
          { id: 'sid', label: 'Session', value: 'abc-123', copyValue: 'abc-123' },
        ]}
      />,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const btn = screen.getByRole('button', { name: 'Copy Session' });
    await user.click(btn);
    expect(btn.getAttribute('data-copied')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(btn.getAttribute('data-copied')).toBeNull();
  });

  it('adds truncate class and title attribute when truncate=true with string value', () => {
    const { container } = render(
      <DataList
        items={[
          { id: 'path', label: 'Path', value: '/some/very/long/path/to/file', truncate: true },
        ]}
      />,
    );
    const truncated = container.querySelector('.truncate');
    expect(truncated).not.toBeNull();
    expect(truncated?.getAttribute('title')).toBe('/some/very/long/path/to/file');
  });

  it('merges caller-provided className with the dl root', () => {
    const { container } = render(
      <DataList items={baseItems} className="custom-list" />,
    );
    const dl = container.querySelector('dl');
    expect(dl?.className).toContain('custom-list');
    expect(dl?.className).toContain('flex');
  });

  it('forwards refs to the dl element', () => {
    const ref = createRef<HTMLDListElement>();
    render(<DataList items={baseItems} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDListElement);
  });
});
