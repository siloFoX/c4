import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Terminal,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.450, TODO 11.432) ApiResponseViewer primitive.
//
// Renders an HTTP response card with a status badge, the
// request method + URL, optional headers panels, and a
// formatted JSON body tree with collapsible nodes + per-type
// syntax highlighting. A "Copy as curl" affordance writes a
// shell-ready `curl` command to the clipboard so adopters can
// reproduce the request locally.
//
// Reference: /root/c4/arps-design-system-v1/.

export type StatusCodeKind =
  | 'info'
  | 'success'
  | 'redirect'
  | 'client-error'
  | 'server-error'
  | 'unknown';

export interface ApiResponseViewerProps {
  status?: number;
  statusText?: string;
  url?: string;
  method?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  requestBody?: unknown;
  copyAsCurl?: boolean;
  copyBody?: boolean;
  defaultCollapsed?: boolean;
  maxInitialDepth?: number;
  className?: string;
  ariaLabel?: string;
  onCopy?: (text: string) => void;
  emptyBody?: ReactNode;
  durationMs?: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_API_VIEWER_MAX_INITIAL_DEPTH = 2;

export function getStatusCodeKind(status?: number): StatusCodeKind {
  if (status === undefined || !Number.isFinite(status))
    return 'unknown';
  if (status >= 100 && status < 200) return 'info';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500 && status < 600) return 'server-error';
  return 'unknown';
}

export function getStatusCodeBadgeClass(kind: StatusCodeKind): string {
  switch (kind) {
    case 'success':
      return 'bg-success/15 text-success border-success/40';
    case 'redirect':
      return 'bg-warning/15 text-warning border-warning/40';
    case 'client-error':
      return 'bg-destructive/15 text-destructive border-destructive/40';
    case 'server-error':
      return 'bg-destructive/15 text-destructive border-destructive/40';
    case 'info':
      return 'bg-primary/15 text-primary border-primary/40';
    case 'unknown':
    default:
      return 'bg-muted text-foreground border-border';
  }
}

export type JsonNodeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'undefined';

export function getJsonNodeType(value: unknown): JsonNodeType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value === undefined) return 'undefined';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'string';
}

export function formatJson(value: unknown, indent: number = 2): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

// Build a shell-ready `curl` command. Quotes header / body
// values with double quotes and escapes embedded quotes +
// backslashes so the output is paste-safe.
function escapeShellDouble(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildCurlCommand(
  method: string = 'GET',
  url: string = '',
  headers: Record<string, string> = {},
  body: unknown | undefined = undefined,
): string {
  const parts: string[] = ['curl'];
  const m = method.toUpperCase();
  if (m && m !== 'GET') {
    parts.push(`-X ${m}`);
  }
  for (const [name, value] of Object.entries(headers)) {
    parts.push(`-H "${escapeShellDouble(name)}: ${escapeShellDouble(value)}"`);
  }
  if (body !== undefined && body !== null && m !== 'GET') {
    const payload =
      typeof body === 'string' ? body : formatJson(body, 0);
    parts.push(`-d "${escapeShellDouble(payload)}"`);
  }
  parts.push(`"${escapeShellDouble(url)}"`);
  return parts.join(' ');
}

export async function copyToClipboard(
  text: string,
): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const clip =
    (navigator as Navigator & {
      clipboard?: { writeText: (t: string) => Promise<void> };
    }).clipboard;
  if (clip && typeof clip.writeText === 'function') {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------
// Internal: JsonNode renderer (recursive)
// ---------------------------------------------------------------

interface JsonNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  maxInitialDepth: number;
}

function JsonNode({
  name,
  value,
  depth,
  maxInitialDepth,
}: JsonNodeProps) {
  const type = getJsonNodeType(value);
  const isContainer = type === 'object' || type === 'array';
  const [open, setOpen] = useState<boolean>(
    () => depth < maxInitialDepth,
  );

  const renderKey = name !== undefined ? (
    <span
      data-section="api-response-viewer-node-key"
      className="text-primary"
    >
      &quot;{name}&quot;
    </span>
  ) : null;

  if (!isContainer) {
    return (
      <span
        data-section="api-response-viewer-node"
        data-node-type={type}
        className="font-mono text-xs"
      >
        {renderKey}
        {renderKey ? <span className="text-muted-foreground">: </span> : null}
        <JsonScalar value={value} type={type} />
      </span>
    );
  }

  const entries =
    type === 'array'
      ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(value as Record<string, unknown>);
  const isEmpty = entries.length === 0;
  const openBracket = type === 'array' ? '[' : '{';
  const closeBracket = type === 'array' ? ']' : '}';

  return (
    <span
      data-section="api-response-viewer-node"
      data-node-type={type}
      data-expanded={open ? 'true' : 'false'}
      className="block font-mono text-xs"
    >
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Collapse node' : 'Expand node'}
          data-section="api-response-viewer-node-toggle"
          onClick={() => setOpen((p) => !p)}
          className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        {renderKey}
        {renderKey ? <span className="text-muted-foreground">: </span> : null}
        <span className="text-muted-foreground">{openBracket}</span>
        {!open || isEmpty ? (
          <>
            <span
              data-section="api-response-viewer-node-summary"
              className="text-muted-foreground"
            >
              {isEmpty
                ? ''
                : `${entries.length} ${type === 'array' ? 'items' : 'keys'}`}
            </span>
            <span className="text-muted-foreground">{closeBracket}</span>
          </>
        ) : null}
      </span>
      {open && !isEmpty ? (
        <ul
          data-section="api-response-viewer-node-children"
          className="ml-4 list-none border-l border-border pl-2"
        >
          {entries.map(([k, v]) => (
            <li
              key={String(k)}
              data-section="api-response-viewer-node-child"
              data-key={String(k)}
            >
              <JsonNode
                {...(type === 'object' ? { name: String(k) } : {})}
                value={v}
                depth={depth + 1}
                maxInitialDepth={maxInitialDepth}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {open && !isEmpty ? (
        <span className="text-muted-foreground">{closeBracket}</span>
      ) : null}
    </span>
  );
}

function JsonScalar({
  value,
  type,
}: {
  value: unknown;
  type: JsonNodeType;
}) {
  if (type === 'string') {
    return (
      <span
        data-section="api-response-viewer-scalar"
        data-scalar-type="string"
        className="text-success"
      >
        &quot;{String(value)}&quot;
      </span>
    );
  }
  if (type === 'number') {
    return (
      <span
        data-section="api-response-viewer-scalar"
        data-scalar-type="number"
        className="text-warning"
      >
        {String(value)}
      </span>
    );
  }
  if (type === 'boolean') {
    return (
      <span
        data-section="api-response-viewer-scalar"
        data-scalar-type="boolean"
        className="text-primary"
      >
        {String(value)}
      </span>
    );
  }
  if (type === 'null') {
    return (
      <span
        data-section="api-response-viewer-scalar"
        data-scalar-type="null"
        className="italic text-muted-foreground"
      >
        null
      </span>
    );
  }
  if (type === 'undefined') {
    return (
      <span
        data-section="api-response-viewer-scalar"
        data-scalar-type="undefined"
        className="italic text-muted-foreground"
      >
        undefined
      </span>
    );
  }
  return (
    <span
      data-section="api-response-viewer-scalar"
      data-scalar-type={type}
      className="text-foreground"
    >
      {String(value)}
    </span>
  );
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ApiResponseViewer = forwardRef(function ApiResponseViewer(
  {
    status,
    statusText,
    url,
    method = 'GET',
    requestHeaders,
    responseHeaders,
    body,
    rawBody,
    requestBody,
    copyAsCurl = true,
    copyBody = true,
    defaultCollapsed = false,
    maxInitialDepth = DEFAULT_API_VIEWER_MAX_INITIAL_DEPTH,
    className,
    ariaLabel = 'API response',
    onCopy,
    emptyBody = 'No response body',
    durationMs,
  }: ApiResponseViewerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const statusKind = useMemo(() => getStatusCodeKind(status), [status]);

  const handleCopy = useCallback(
    async (text: string) => {
      onCopy?.(text);
      await copyToClipboard(text);
    },
    [onCopy],
  );

  const curlCommand = useMemo(() => {
    if (!url) return '';
    return buildCurlCommand(
      method,
      url,
      requestHeaders ?? {},
      requestBody,
    );
  }, [method, requestBody, requestHeaders, url]);

  const formattedBody = useMemo(() => {
    if (rawBody !== undefined) return rawBody;
    if (body === undefined) return undefined;
    return formatJson(body, 2);
  }, [body, rawBody]);

  const hasJsonBody = body !== undefined && rawBody === undefined;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="api-response-viewer"
      data-status={status ?? ''}
      data-status-kind={statusKind}
      data-method={method}
      data-has-body={
        body !== undefined || rawBody !== undefined
          ? 'true'
          : 'false'
      }
      className={cn(
        'flex w-full flex-col gap-3 rounded-md border border-border bg-card p-3',
        className,
      )}
    >
      <header
        data-section="api-response-viewer-header"
        className="flex items-center gap-3"
      >
        {status !== undefined ? (
          <span
            data-section="api-response-viewer-status"
            data-status-kind={statusKind}
            className={cn(
              'inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-semibold',
              getStatusCodeBadgeClass(statusKind),
            )}
          >
            {status}
            {statusText ? ` ${statusText}` : ''}
          </span>
        ) : null}
        <span
          data-section="api-response-viewer-method"
          className="font-mono text-xs font-semibold uppercase text-foreground"
        >
          {method}
        </span>
        {url ? (
          <span
            data-section="api-response-viewer-url"
            className="truncate font-mono text-xs text-muted-foreground"
            title={url}
          >
            {url}
          </span>
        ) : null}
        {durationMs !== undefined ? (
          <span
            data-section="api-response-viewer-duration"
            className="font-mono text-xs text-muted-foreground"
          >
            {Math.round(durationMs)}ms
          </span>
        ) : null}
        <div
          data-section="api-response-viewer-actions"
          className="ml-auto flex items-center gap-1"
        >
          {copyAsCurl && url ? (
            <button
              type="button"
              data-section="api-response-viewer-copy-curl"
              aria-label="Copy as curl"
              onClick={() => void handleCopy(curlCommand)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Terminal aria-hidden="true" className="h-3 w-3" />
              curl
            </button>
          ) : null}
          {copyBody && formattedBody !== undefined ? (
            <button
              type="button"
              data-section="api-response-viewer-copy-body"
              aria-label="Copy response body"
              onClick={() => void handleCopy(formattedBody)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy aria-hidden="true" className="h-3 w-3" />
              Copy
            </button>
          ) : null}
        </div>
      </header>

      {responseHeaders && Object.keys(responseHeaders).length > 0 ? (
        <section
          data-section="api-response-viewer-headers"
          className="flex flex-col gap-1"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Response headers
          </h3>
          <dl className="flex flex-col gap-0.5">
            {Object.entries(responseHeaders).map(([k, v]) => (
              <div
                key={k}
                data-section="api-response-viewer-header-row"
                data-header-name={k}
                className="flex gap-2 font-mono text-xs"
              >
                <dt className="text-muted-foreground">{k}:</dt>
                <dd className="text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section
        data-section="api-response-viewer-body"
        className="flex flex-col gap-1"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Body
        </h3>
        {hasJsonBody ? (
          <div
            data-section="api-response-viewer-tree"
            data-default-collapsed={defaultCollapsed ? 'true' : 'false'}
            className="overflow-auto rounded bg-muted/30 p-2"
          >
            <JsonNode
              value={body}
              depth={0}
              maxInitialDepth={
                defaultCollapsed ? 0 : maxInitialDepth
              }
            />
          </div>
        ) : rawBody !== undefined ? (
          <pre
            data-section="api-response-viewer-raw"
            className="overflow-auto rounded bg-muted/30 p-2 font-mono text-xs text-foreground"
          >
            {rawBody}
          </pre>
        ) : (
          <p
            data-section="api-response-viewer-body-empty"
            className="text-xs text-muted-foreground"
          >
            {emptyBody}
          </p>
        )}
      </section>
    </div>
  );
});

ApiResponseViewer.displayName = 'ApiResponseViewer';
