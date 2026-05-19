import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import type { ReactNode } from 'react';
import {
  DetailList,
  getDetailListCopyText,
  isDetailListItemCopyable,
} from './detail-list';
import type { DetailListItem } from './detail-list';

afterEach(() => {
  cleanup();
});

function makeItems(): DetailListItem[] {
  return [
    { id: 'name', label: 'Name', value: 'arps-1' },
    { id: 'count', label: 'Count', value: 42 },
    { id: 'created', label: 'Created', value: '2026-05-18' },
  ];
}

describe('getDetailListCopyText', () => {
  it('returns copyValue when supplied', () => {
    expect(
      getDetailListCopyText({
        id: 'x',
        label: 'X',
        value: <span />,
        copyValue: 'custom',
      }),
    ).toBe('custom');
  });

  it('returns string values verbatim', () => {
    expect(
      getDetailListCopyText({ id: 'x', label: 'X', value: 'hello' }),
    ).toBe('hello');
  });

  it('coerces number values', () => {
    expect(
      getDetailListCopyText({ id: 'x', label: 'X', value: 42 }),
    ).toBe('42');
  });

  it('coerces bigint values', () => {
    expect(
      getDetailListCopyText({
        id: 'x',
        label: 'X',
        value: 10n as unknown as ReactNode,
      }),
    ).toBe('10');
  });

  it('returns null for non-string-coercible values', () => {
    expect(
      getDetailListCopyText({
        id: 'x',
        label: 'X',
        value: <span>boom</span>,
      }),
    ).toBeNull();
  });
});

describe('isDetailListItemCopyable', () => {
  it('returns true when copyable=true overrides', () => {
    expect(
      isDetailListItemCopyable({
        id: 'x',
        label: 'X',
        value: <span />,
        copyable: true,
      }),
    ).toBe(true);
  });

  it('returns false when copyable=false overrides', () => {
    expect(
      isDetailListItemCopyable({
        id: 'x',
        label: 'X',
        value: 'hello',
        copyable: false,
      }),
    ).toBe(false);
  });

  it('falls back to text presence', () => {
    expect(
      isDetailListItemCopyable({
        id: 'x',
        label: 'X',
        value: 'hello',
      }),
    ).toBe(true);
    expect(
      isDetailListItemCopyable({
        id: 'x',
        label: 'X',
        value: <span />,
      }),
    ).toBe(false);
  });
});

describe('DetailList component', () => {
  it('renders role=list with default aria-label', () => {
    render(<DetailList items={makeItems()} />);
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-label',
      'Details',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<DetailList items={makeItems()} ariaLabel="Asset info" />);
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-label',
      'Asset info',
    );
  });

  it('renders as a native dl', () => {
    const { container } = render(<DetailList items={makeItems()} />);
    expect(container.querySelector('dl')).toBeInTheDocument();
  });

  it('renders dt + dd per item', () => {
    const { container } = render(<DetailList items={makeItems()} />);
    expect(container.querySelectorAll('dt')).toHaveLength(3);
    expect(container.querySelectorAll('dd')).toHaveLength(3);
  });

  it('renders the value content', () => {
    render(<DetailList items={makeItems()} />);
    expect(screen.getByText('arps-1')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('2026-05-18')).toBeInTheDocument();
  });

  it('exposes data-orientation + data-size + data-item-count on root', () => {
    render(
      <DetailList
        items={makeItems()}
        orientation="horizontal"
        size="lg"
      />,
    );
    const dl = screen.getByRole('list');
    expect(dl).toHaveAttribute('data-orientation', 'horizontal');
    expect(dl).toHaveAttribute('data-size', 'lg');
    expect(dl).toHaveAttribute('data-item-count', '3');
  });

  it('horizontal orientation applies md:flex-row to rows', () => {
    const { container } = render(
      <DetailList items={makeItems()} orientation="horizontal" />,
    );
    const row = container.querySelector(
      '[data-section="detail-list-row"]',
    ) as HTMLElement;
    expect(row.className).toContain('md:flex-row');
  });

  it('vertical orientation rows are flex-col', () => {
    const { container } = render(
      <DetailList items={makeItems()} orientation="vertical" />,
    );
    const row = container.querySelector(
      '[data-section="detail-list-row"]',
    ) as HTMLElement;
    expect(row.className).toContain('flex-col');
    expect(row.className).not.toContain('md:flex-row');
  });

  it('renders copy button for string-coercible values', () => {
    render(<DetailList items={makeItems()} />);
    expect(
      screen.getByRole('button', { name: 'Copy Name' }),
    ).toBeInTheDocument();
  });

  it('omits copy button for non-string ReactNode values', () => {
    const items: DetailListItem[] = [
      { id: 'a', label: 'A', value: <span>X</span> },
    ];
    render(<DetailList items={items} />);
    expect(
      screen.queryByRole('button', { name: /Copy/ }),
    ).toBeNull();
  });

  it('copyValue prop enables copy on ReactNode values', () => {
    const items: DetailListItem[] = [
      {
        id: 'a',
        label: 'A',
        value: <span>complex</span>,
        copyValue: 'plaintext',
      },
    ];
    render(<DetailList items={items} />);
    expect(
      screen.getByRole('button', { name: 'Copy A' }),
    ).toBeInTheDocument();
  });

  it('copyable=false suppresses the copy button', () => {
    const items: DetailListItem[] = [
      {
        id: 'a',
        label: 'A',
        value: 'hello',
        copyable: false,
      },
    ];
    render(<DetailList items={items} />);
    expect(
      screen.queryByRole('button', { name: /Copy/ }),
    ).toBeNull();
  });

  it('showCopyOnHover=false hides every copy button', () => {
    render(
      <DetailList items={makeItems()} showCopyOnHover={false} />,
    );
    expect(
      screen.queryByRole('button', { name: /Copy/ }),
    ).toBeNull();
  });

  it('copy click writes the value via clipboard API + fires onCopy', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const onCopy = vi.fn();
    render(<DetailList items={makeItems()} onCopy={onCopy} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy Name' }),
      );
    });
    expect(writeText).toHaveBeenCalledWith('arps-1');
    expect(onCopy).toHaveBeenCalledTimes(1);
    const [item, text] = onCopy.mock.calls[0] ?? [];
    expect(item?.id).toBe('name');
    expect(text).toBe('arps-1');
  });

  it('copy click uses copyValue when supplied', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    const items: DetailListItem[] = [
      {
        id: 'token',
        label: 'Token',
        value: <span>masked</span>,
        copyValue: 'real-token-value',
      },
    ];
    render(<DetailList items={items} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy Token' }),
      );
    });
    expect(writeText).toHaveBeenCalledWith('real-token-value');
  });

  it('copy success flips the icon + data-copied="true"', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
    const { container } = render(<DetailList items={makeItems()} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy Name' }),
      );
    });
    expect(
      container.querySelector(
        '[data-section="detail-list-row"][data-detail-id="name"]',
      ),
    ).toHaveAttribute('data-copied', 'true');
    expect(
      container.querySelector(
        '[data-section="detail-list-copy-check"]',
      ),
    ).toBeInTheDocument();
  });

  it('copied state clears after copyFeedbackMs', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
    const { container } = render(
      <DetailList items={makeItems()} copyFeedbackMs={200} />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy Name' }),
      );
    });
    expect(
      container.querySelector(
        '[data-section="detail-list-row"][data-detail-id="name"]',
      ),
    ).toHaveAttribute('data-copied', 'true');
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(
      container.querySelector(
        '[data-section="detail-list-row"][data-detail-id="name"]',
      ),
    ).toHaveAttribute('data-copied', 'false');
    vi.useRealTimers();
  });

  it('copy still fires onCopy when clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const onCopy = vi.fn();
    render(<DetailList items={makeItems()} onCopy={onCopy} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Copy Name' }),
      );
    });
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('custom copyLabel overrides the button aria-label', () => {
    render(
      <DetailList
        items={[{ id: 'a', label: 'A', value: 'x' }]}
        copyLabel={(item) => `Grab ${item.id}`}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Grab a' }),
    ).toBeInTheDocument();
  });

  it('renders emptyLabel when items is []', () => {
    render(<DetailList items={[]} emptyLabel="No metadata" />);
    expect(screen.getByText('No metadata')).toBeInTheDocument();
  });

  it('empty default label "(no details)"', () => {
    render(<DetailList items={[]} />);
    expect(screen.getByText('(no details)')).toBeInTheDocument();
  });

  it('empty list root carries data-empty="true"', () => {
    render(<DetailList items={[]} />);
    expect(screen.getByRole('list')).toHaveAttribute(
      'data-empty',
      'true',
    );
  });

  it('per-row data-detail-id matches item id', () => {
    const { container } = render(<DetailList items={makeItems()} />);
    const rows = Array.from(
      container.querySelectorAll('[data-section="detail-list-row"]'),
    );
    expect(rows.map((r) => r.getAttribute('data-detail-id'))).toEqual(
      ['name', 'count', 'created'],
    );
  });

  it('per-row data-copyable mirrors copyable status', () => {
    const items: DetailListItem[] = [
      { id: 'a', label: 'A', value: 'x' }, // copyable
      { id: 'b', label: 'B', value: <span /> }, // not copyable
    ];
    const { container } = render(<DetailList items={items} />);
    const rows = container.querySelectorAll(
      '[data-section="detail-list-row"]',
    );
    expect(rows[0]).toHaveAttribute('data-copyable', 'true');
    expect(rows[1]).toHaveAttribute('data-copyable', 'false');
  });

  it('size variants apply different classes', () => {
    const { container, rerender } = render(
      <DetailList items={makeItems()} size="sm" />,
    );
    const rowSm = container.querySelector(
      '[data-section="detail-list-row"]',
    ) as HTMLElement;
    expect(rowSm.className).toContain('py-1');

    rerender(<DetailList items={makeItems()} size="lg" />);
    const rowLg = container.querySelector(
      '[data-section="detail-list-row"]',
    ) as HTMLElement;
    expect(rowLg.className).toContain('py-2');
  });

  it('ariaLabel on item overrides the copy button label fallback', () => {
    const items: DetailListItem[] = [
      {
        id: 'x',
        label: <span>X</span>,
        value: 'hello',
        ariaLabel: 'Identifier',
      },
    ];
    render(<DetailList items={items} />);
    expect(
      screen.getByRole('button', { name: 'Copy Identifier' }),
    ).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(DetailList.displayName).toBe('DetailList');
  });

  it('forwards refs to the dl root', () => {
    const ref = createRef<HTMLDListElement>();
    render(<DetailList ref={ref} items={makeItems()} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('DL');
  });
});
