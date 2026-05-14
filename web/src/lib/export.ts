// (11.190) Lightweight data export helpers. CSV + JSON serializers
// plus a browser-only downloadFile that builds an object URL and
// clicks a temporary anchor. SSR-safe: every browser-touching path
// short-circuits when `window` is undefined.

export interface ColumnDef<T> {
  // Property key on the row. Allowed as `keyof T` for type safety, or
  // a plain string for callers that work with `unknown[]`.
  key: keyof T | string;
  // Optional human-readable header. Defaults to String(key).
  header?: string;
  // Optional per-row formatter. Receives the raw cell value and the
  // entire row; should return the string that ends up in the CSV cell.
  format?: (val: unknown, row: T) => string;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV<T>(rows: T[], columns: ColumnDef<T>[]): string {
  const header = columns
    .map((c) => escapeCsvCell(c.header ?? String(c.key)))
    .join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = (row as Record<string, unknown>)[c.key as string];
        const cell = c.format ? c.format(raw, row) : raw;
        return escapeCsvCell(cell);
      })
      .join(','),
  );
  return [header, ...body].join('\n');
}

export function toJSON<T>(rows: T[]): string {
  return JSON.stringify(rows, null, 2);
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function ensureExtension(filename: string, ext: 'csv' | 'json'): string {
  const dotExt = `.${ext}`;
  if (filename.toLowerCase().endsWith(dotExt)) return filename;
  return `${filename}-${todayStamp()}${dotExt}`;
}

export interface ExportDataOptions<T> {
  rows: T[];
  columns?: ColumnDef<T>[] | undefined;
  format: 'csv' | 'json';
  filename: string;
}

export function exportData<T>(opts: ExportDataOptions<T>): void {
  const { rows, columns, format, filename } = opts;
  if (format === 'csv') {
    const cols: ColumnDef<T>[] =
      columns && columns.length > 0
        ? columns
        : inferColumns(rows);
    const content = toCSV(rows, cols);
    downloadFile(content, ensureExtension(filename, 'csv'), 'text/csv;charset=utf-8');
    return;
  }
  const content = toJSON(rows);
  downloadFile(content, ensureExtension(filename, 'json'), 'application/json');
}

function inferColumns<T>(rows: T[]): ColumnDef<T>[] {
  if (rows.length === 0) return [];
  const first = rows[0] as Record<string, unknown>;
  return Object.keys(first).map((k) => ({ key: k }));
}
