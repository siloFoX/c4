import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t, tFormat } from '../lib/i18n';

// (v1.10.512) Top-level Error Boundary so a render error in any
// view doesn't blank-screen the whole dashboard. Renders a small
// fallback panel with the error message + a Reload button. The
// error itself is also logged to console for the operator to grab
// from devtools.

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console so operators can copy the stack from
    // devtools. We don't ship a remote error sink (yet) — c4 is
    // operator-facing and the daemon log captures backend issues
    // separately.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || String(this.state.error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-md border border-destructive/40 bg-destructive/10 p-6">
          <h1 className="mb-2 text-lg font-semibold text-destructive">
            {t('errorBoundary.title')}
          </h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {tFormat('errorBoundary.message', { error: message })}
          </p>
          <pre className="mb-4 max-h-48 overflow-auto rounded bg-background/50 p-2 font-mono text-[11px] text-muted-foreground">
            {this.state.error.stack || message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              {t('errorBoundary.tryAgain')}
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
