import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge, Button, Collapsible } from './ui';
import { t, tFormat } from '../lib/i18n';
import { report as reportError } from '../lib/error-reporter';
import { copyTextToClipboard } from '../hooks/use-copy';

// (v1.11.136) Friendlier top-level Error Boundary fallback. The stack
// trace now lives inside a collapsed <details> so it does not dominate
// the panel, and three primary recovery affordances surface inline:
// Reload (full page), Copy stack trace (clipboard for paste into a
// ticket), and Open GitHub issue (deep link to a prefilled new-issue
// form). The legacy Try Again button is preserved as a secondary
// action so a transient render error can still be cleared without a
// page reload.

const GITHUB_NEW_ISSUE = 'https://github.com/siloFoX/c4/issues/new';
const TITLE_MAX = 60;
const COPIED_RESET_MS = 2000;

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, copied: false };

  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console so operators can copy the stack from
    // devtools. We don't ship a remote error sink (yet) - c4 is
    // operator-facing and the daemon log captures backend issues
    // separately.
    console.error('[ErrorBoundary]', error, info.componentStack);
    try {
      reportError({
        source: 'react',
        message: error.message || String(error),
        stack: error.stack,
        componentStack: info.componentStack ?? undefined,
      });
    } catch {
      /* sink must never re-throw into the render path */
    }
  }

  override componentWillUnmount(): void {
    if (this.copiedTimer !== null) {
      clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
  }

  private getStack(): string {
    const err = this.state.error;
    if (!err) return '';
    return err.stack || err.message || String(err);
  }

  private getIssueHref(): string {
    const err = this.state.error;
    if (!err) return GITHUB_NEW_ISSUE;
    const rawMessage = err.message || String(err);
    const truncated =
      rawMessage.length > TITLE_MAX
        ? `${rawMessage.slice(0, TITLE_MAX)}...`
        : rawMessage;
    const title = `Bug report: ${truncated}`;
    const stack = this.getStack();
    const body = [
      '## What happened',
      '',
      '(please describe what you were doing)',
      '',
      '## Stack trace',
      '',
      '```',
      stack,
      '```',
      '',
    ].join('\n');
    const params = new URLSearchParams({ title, body });
    return `${GITHUB_NEW_ISSUE}?${params.toString()}`;
  }

  reset = (): void => {
    if (this.copiedTimer !== null) {
      clearTimeout(this.copiedTimer);
      this.copiedTimer = null;
    }
    this.setState({ error: null, copied: false });
  };

  reload = (): void => {
    window.location.reload();
  };

  // (v1.11.251, TODO 11.233) Inline navigator.clipboard.writeText
  // path now delegates to the shared `copyTextToClipboard()`
  // imperative helper from `hooks/use-copy`. The helper covers
  // the Clipboard API + textarea fallback in one place, so a
  // sandboxed-iframe / non-secure-context environment still
  // succeeds via execCommand('copy'). ErrorBoundary cannot use
  // the React hook directly (it is a class component); the
  // imperative entry point keeps the contract.
  copyStack = (): void => {
    const stack = this.getStack();
    void copyTextToClipboard(stack).then((ok) => {
      if (!ok) return;
      this.setState({ copied: true });
      if (this.copiedTimer !== null) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copiedTimer = null;
        this.setState({ copied: false });
      }, COPIED_RESET_MS);
    });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || String(this.state.error);
    const stack = this.getStack();
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-md border border-destructive/40 bg-destructive/10 p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <AlertTriangle aria-hidden="true" className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-semibold text-destructive">
              {t('errorBoundary.title')}
            </h1>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {tFormat('errorBoundary.message', { error: message })}
          </p>
          <Collapsible title="Stack trace" className="mb-4 bg-background/50">
            <pre
              tabIndex={0}
              className="max-h-48 overflow-auto font-mono text-[11px] text-muted-foreground"
            >
              {stack}
            </pre>
          </Collapsible>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={this.reload}>
              {t('errorBoundary.reload')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={this.copyStack}
            >
              Copy stack trace
            </Button>
            <a
              href={this.getIssueHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 min-h-[44px] items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-0"
            >
              Open GitHub issue
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={this.reset}
            >
              {t('errorBoundary.tryAgain')}
            </Button>
            {this.state.copied ? (
              <Badge
                variant="success"
                role="status"
                aria-live="polite"
                className="px-2 py-0.5 text-[11px] font-medium"
              >
                Copied
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
