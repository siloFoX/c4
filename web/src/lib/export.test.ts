import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toCSV,
  toJSON,
  downloadFile,
  exportData,
  type ColumnDef,
} from './export';

interface Row {
  name: string;
  count: number;
  note?: string;
}

describe('toCSV', () => {
  it('quotes cells containing commas, quotes, and newlines, doubling inner quotes', () => {
    const rows: Row[] = [
      { name: 'a,b', count: 1, note: 'has "quote"' },
      { name: 'line1\nline2', count: 2 },
    ];
    const columns: ColumnDef<Row>[] = [
      { key: 'name' },
      { key: 'count' },
      { key: 'note' },
    ];
    const out = toCSV(rows, columns);
    expect(out).toBe(
      'name,count,note\n"a,b",1,"has ""quote"""\n"line1\nline2",2,',
    );
  });

  it('uses the column header override when provided', () => {
    const rows: Row[] = [{ name: 'x', count: 5 }];
    const out = toCSV(rows, [
      { key: 'name', header: 'Worker' },
      { key: 'count', header: 'Total' },
    ]);
    expect(out.split('\n')[0]).toBe('Worker,Total');
  });

  it('applies the per-column format() override', () => {
    const rows: Row[] = [{ name: 'a', count: 3 }];
    const out = toCSV(rows, [
      { key: 'name' },
      { key: 'count', format: (v) => `${Number(v) * 2}` },
    ]);
    expect(out.split('\n')[1]).toBe('a,6');
  });
});

describe('toJSON', () => {
  it('pretty-prints with 2-space indent', () => {
    const out = toJSON([{ a: 1 }]);
    expect(out).toBe('[\n  {\n    "a": 1\n  }\n]');
  });
});

describe('downloadFile', () => {
  it('is SSR-safe and early-returns when window is undefined', () => {
    const origWindow = globalThis.window;
    // Simulate SSR by deleting window.
    // @ts-expect-error - intentional removal
    delete globalThis.window;
    expect(() =>
      downloadFile('hello', 'a.csv', 'text/csv'),
    ).not.toThrow();
    globalThis.window = origWindow;
  });
});

describe('exportData', () => {
  let createURL: ReturnType<typeof vi.fn>;
  let revokeURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.fn>;
  let origCreate: typeof URL.createObjectURL;
  let origRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    createURL = vi.fn(() => 'blob:mock');
    revokeURL = vi.fn();
    click = vi.fn();
    origCreate = URL.createObjectURL;
    origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeURL as unknown as typeof URL.revokeObjectURL;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = click as unknown as () => void;
      }
      return el;
    });
  });

  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    vi.restoreAllMocks();
  });

  it('composes toCSV + downloadFile for csv format', () => {
    exportData<Row>({
      rows: [{ name: 'a', count: 1 }],
      columns: [{ key: 'name' }, { key: 'count' }],
      format: 'csv',
      filename: 'workers.csv',
    });
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeURL).toHaveBeenCalledWith('blob:mock');
  });

  it('composes toJSON + downloadFile for json format', () => {
    exportData<Row>({
      rows: [{ name: 'a', count: 1 }],
      format: 'json',
      filename: 'workers.json',
    });
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('appends date stamp when filename omits the extension', () => {
    let anchorFilename = '';
    const origCreateElement = document.createElement.bind(document);
    vi.restoreAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = (() => {
          anchorFilename = (el as HTMLAnchorElement).download;
        }) as unknown as () => void;
      }
      return el;
    });
    exportData<Row>({
      rows: [{ name: 'a', count: 1 }],
      columns: [{ key: 'name' }, { key: 'count' }],
      format: 'csv',
      filename: 'workers',
    });
    expect(anchorFilename).toMatch(/^workers-\d{8}\.csv$/);
  });
});
