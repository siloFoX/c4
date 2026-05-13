import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useActionItemsExport } from './use-action-items-export';
import type { ActionItemsResponse } from '../components/MeetingsActionItemsPanel';
import type { ActionItemType } from '../components/MeetingsView';

// useActionItemsExport exposes two callbacks. handleDownloadJson
// emits the full payload through a synthetic <a download> click +
// URL.createObjectURL + URL.revokeObjectURL dance. handleCopyMd
// writes a grouped-by-type Markdown digest to navigator.clipboard.
// Both early-return when actions === null. Failures on the
// clipboard path are silently swallowed (no toast surface).

interface CreatedAnchor {
  href: string;
  download: string;
  clickCount: number;
  appended: boolean;
  ref: HTMLAnchorElement | null;
}

const created: CreatedAnchor[] = [];
const objectUrls: { url: string; revoked: boolean; blob: Blob }[] = [];
let nextObjectUrlId = 0;
let realCreateElement: typeof document.createElement;
let writeText: Mock<(text: string) => Promise<void>>;

function makeItem(type: ActionItemType, text: string) {
  return {
    type,
    text,
    owner: null,
    stage: 'plan',
    round: 1,
    specialistId: null,
    ts: null,
  };
}

function makeActions(
  items: { type: ActionItemType; text: string }[],
): ActionItemsResponse {
  const byType: Record<ActionItemType, number> = {
    decision: 0,
    action: 0,
    todo: 0,
    blocker: 0,
  };
  const full = items.map((i) => makeItem(i.type, i.text));
  full.forEach((i) => {
    byType[i.type] += 1;
  });
  return { count: full.length, byType, items: full };
}

beforeEach(() => {
  created.length = 0;
  objectUrls.length = 0;
  nextObjectUrlId = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob): string => {
        const url = `blob:test/${++nextObjectUrlId}`;
        objectUrls.push({ url, revoked: false, blob });
        return url;
      }),
      revokeObjectURL: vi.fn((url: string): void => {
        const found = objectUrls.find((o) => o.url === url);
        if (found) found.revoked = true;
      }),
    }),
  );
  realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions): HTMLElement => {
      const el = realCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        const anchor = el as HTMLAnchorElement;
        const entry: CreatedAnchor = {
          href: '',
          download: '',
          clickCount: 0,
          appended: false,
          ref: anchor,
        };
        created.push(entry);
        Object.defineProperty(anchor, 'href', {
          configurable: true,
          get: () => entry.href,
          set: (v: string) => {
            entry.href = v;
          },
        });
        Object.defineProperty(anchor, 'download', {
          configurable: true,
          get: () => entry.download,
          set: (v: string) => {
            entry.download = v;
          },
        });
        anchor.click = () => {
          entry.clickCount += 1;
          // The component appends the anchor before .click() and
          // removes it right after; mark observably at click time.
          entry.appended = document.body.contains(anchor);
        };
      }
      return el;
    },
  );
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

describe('useActionItemsExport', () => {
  it('starts idle: returns two callable handlers', () => {
    const { result } = renderHook(() =>
      useActionItemsExport({ actions: null, meetingId: 'm1' }),
    );
    expect(typeof result.current.handleDownloadJson).toBe('function');
    expect(typeof result.current.handleCopyMd).toBe('function');
  });

  it('handleDownloadJson is a no-op when actions is null (no anchor, no blob, no click)', () => {
    const { result } = renderHook(() =>
      useActionItemsExport({ actions: null, meetingId: 'm1' }),
    );
    act(() => result.current.handleDownloadJson());
    expect(created).toHaveLength(0);
    expect(objectUrls).toHaveLength(0);
  });

  it('handleCopyMd is a no-op when actions is null (clipboard never touched)', () => {
    const { result } = renderHook(() =>
      useActionItemsExport({ actions: null, meetingId: 'm1' }),
    );
    act(() => result.current.handleCopyMd());
    expect(writeText).not.toHaveBeenCalled();
  });

  it('handleDownloadJson clicks an anchor with action-items-<meetingId>.json and revokes the object URL', async () => {
    const actions = makeActions([{ type: 'decision', text: 'ship it' }]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'demo-7' }),
    );
    act(() => result.current.handleDownloadJson());
    expect(objectUrls).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(created[0]?.href).toBe(objectUrls[0]?.url);
    expect(created[0]?.download).toBe('action-items-demo-7.json');
    expect(created[0]?.clickCount).toBe(1);
    expect(created[0]?.appended).toBe(true);
    // After the handler returns, the anchor must have been
    // removed from the DOM (the hook calls removeChild before
    // revokeObjectURL).
    expect(document.body.contains(created[0]!.ref!)).toBe(false);
    expect(objectUrls[0]?.revoked).toBe(true);
  });

  it('the downloaded Blob is application/json and contains the pretty-printed payload', async () => {
    const actions = makeActions([
      { type: 'action', text: 'first' },
      { type: 'todo', text: 'second' },
    ]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    act(() => result.current.handleDownloadJson());
    expect(objectUrls[0]?.blob.type).toBe('application/json');
    const text = await objectUrls[0]!.blob.text();
    expect(text).toBe(JSON.stringify(actions, null, 2));
  });

  it('handleCopyMd groups items by KIND_ORDER (decision, action, todo, blocker) with "## TYPE (count)" headers', async () => {
    const actions = makeActions([
      { type: 'todo', text: 't1' },
      { type: 'decision', text: 'd1' },
      { type: 'action', text: 'a1' },
      { type: 'blocker', text: 'b1' },
      { type: 'decision', text: 'd2' },
    ]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    act(() => result.current.handleCopyMd());
    expect(writeText).toHaveBeenCalledTimes(1);
    const md = writeText.mock.calls[0]![0];
    expect(md).toBe(
      [
        '## DECISION (2)',
        '- d1',
        '- d2',
        '',
        '## ACTION (1)',
        '- a1',
        '',
        '## TODO (1)',
        '- t1',
        '',
        '## BLOCKER (1)',
        '- b1',
      ].join('\n'),
    );
  });

  it('skips empty groups in the Markdown output (no "## X (0)" lines for missing kinds)', () => {
    const actions = makeActions([
      { type: 'decision', text: 'only one' },
    ]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    act(() => result.current.handleCopyMd());
    const md = writeText.mock.calls[0]![0];
    expect(md).toBe('## DECISION (1)\n- only one');
    expect(md).not.toMatch(/ACTION/);
    expect(md).not.toMatch(/TODO/);
    expect(md).not.toMatch(/BLOCKER/);
  });

  it('silently swallows a clipboard rejection (no throw, no rethrow)', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    const actions = makeActions([{ type: 'action', text: 'x' }]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    expect(() => {
      act(() => result.current.handleCopyMd());
    }).not.toThrow();
    expect(writeText).toHaveBeenCalledTimes(1);
    // Let the rejection settle so vitest does not flag an
    // unhandled rejection at the end of the test.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('writes the trimmed Markdown body (no trailing blank line)', () => {
    const actions = makeActions([{ type: 'decision', text: 'one' }]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    act(() => result.current.handleCopyMd());
    const md = writeText.mock.calls[0]![0];
    expect(md.endsWith('\n')).toBe(false);
    expect(md.endsWith('\n\n')).toBe(false);
  });

  it('rerender with a new meetingId makes the next download use the new filename (cross-selection effect)', () => {
    const actions = makeActions([{ type: 'decision', text: 'one' }]);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useActionItemsExport({ actions, meetingId: id }),
      { initialProps: { id: 'first' } },
    );
    act(() => result.current.handleDownloadJson());
    expect(created[0]?.download).toBe('action-items-first.json');
    rerender({ id: 'second' });
    act(() => result.current.handleDownloadJson());
    expect(created[1]?.download).toBe('action-items-second.json');
  });

  it('rerender with new actions makes the next download payload reflect the new content', async () => {
    const first = makeActions([{ type: 'decision', text: 'old' }]);
    const second = makeActions([{ type: 'action', text: 'new' }]);
    const { result, rerender } = renderHook(
      ({ a }: { a: ActionItemsResponse }) =>
        useActionItemsExport({ actions: a, meetingId: 'm1' }),
      { initialProps: { a: first } },
    );
    act(() => result.current.handleDownloadJson());
    expect(await objectUrls[0]!.blob.text()).toBe(
      JSON.stringify(first, null, 2),
    );
    rerender({ a: second });
    act(() => result.current.handleDownloadJson());
    expect(await objectUrls[1]!.blob.text()).toBe(
      JSON.stringify(second, null, 2),
    );
  });

  it('rerender with new actions makes the next Markdown copy reflect the new grouping', () => {
    const first = makeActions([{ type: 'decision', text: 'd' }]);
    const second = makeActions([
      { type: 'action', text: 'a' },
      { type: 'todo', text: 't' },
    ]);
    const { result, rerender } = renderHook(
      ({ a }: { a: ActionItemsResponse }) =>
        useActionItemsExport({ actions: a, meetingId: 'm1' }),
      { initialProps: { a: first } },
    );
    act(() => result.current.handleCopyMd());
    expect(writeText.mock.calls[0]![0]).toBe('## DECISION (1)\n- d');
    rerender({ a: second });
    act(() => result.current.handleCopyMd());
    expect(writeText.mock.calls[1]![0]).toBe(
      '## ACTION (1)\n- a\n\n## TODO (1)\n- t',
    );
  });

  it('handleDownloadJson reference is stable across renders that do not change deps', () => {
    const actions = makeActions([{ type: 'decision', text: 'x' }]);
    const { result, rerender } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    const first = result.current.handleDownloadJson;
    rerender();
    expect(result.current.handleDownloadJson).toBe(first);
  });

  it('handleCopyMd reference changes when the actions prop changes (useCallback dep)', () => {
    const a1 = makeActions([{ type: 'decision', text: 'one' }]);
    const a2 = makeActions([{ type: 'decision', text: 'two' }]);
    const { result, rerender } = renderHook(
      ({ a }: { a: ActionItemsResponse }) =>
        useActionItemsExport({ actions: a, meetingId: 'm1' }),
      { initialProps: { a: a1 } },
    );
    const first = result.current.handleCopyMd;
    rerender({ a: a2 });
    expect(result.current.handleCopyMd).not.toBe(first);
  });

  it('a parallel call issued while the first clipboard write is gated still fires a second writeText (no internal guard)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    writeText.mockImplementationOnce(async (_text: string) => {
      await gate;
    });
    const actions = makeActions([{ type: 'decision', text: 'x' }]);
    const { result } = renderHook(() =>
      useActionItemsExport({ actions, meetingId: 'm1' }),
    );
    act(() => result.current.handleCopyMd());
    expect(writeText).toHaveBeenCalledTimes(1);
    act(() => result.current.handleCopyMd());
    expect(writeText).toHaveBeenCalledTimes(2);
    release();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
