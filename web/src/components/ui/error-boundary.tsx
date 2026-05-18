import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorState } from './error-state';

// (v1.11.352, TODO 11.334) Route-level error boundary
// primitive.
//
// Pairs with the existing top-level
// `components/ErrorBoundary` (which renders the full
// stack-trace + copy + GitHub-issue surface): this
// primitive is the lighter form meant to wrap individual
// page routes, components, or feature subtrees so a
// crash in one branch does not propagate up to the
// global boundary.
//
// Public surface:
//
//   <UIErrorBoundary
//     fallback="My page crashed"
//     onError={(err, info) => reporter(err)}
//     resetKeys={[topView]}
//   >
//     <MyPage />
//   </UIErrorBoundary>
//
// - `fallback`: ReactNode (rendered as-is) OR
//   `(error, retry) => ReactNode` (factory). Default
//   renders the canonical `ErrorState` primitive with a
//   retry button wired to the boundary's reset.
// - `onError`: telemetry hook. Always invoked on a
//   caught error. The boundary additionally logs to
//   `console.error` so dev-time stack traces show up
//   without a wired reporter. Errors thrown FROM
//   `onError` are swallowed so the reporter cannot
//   crash the boundary itself.
// - `resetKeys`: when the array's identity changes,
//   the boundary clears its error state and re-renders
//   the children. Use for route key changes
//   (`[topView]`) so navigating away from a crashed
//   page recovers automatically.

export type UIErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, retry: () => void) => ReactNode);

export interface UIErrorBoundaryProps {
  children: ReactNode;
  fallback?: UIErrorBoundaryFallback;
  onError?: (error: Error, info: ErrorInfo) => void;
  resetKeys?: ReadonlyArray<unknown>;
  // (v1.11.352, TODO 11.334) Operator-facing label that
  // appears in the default ErrorState title. Defaults to
  // `"Something went wrong"`; per-route adopters can
  // override (`"Could not load the Chat view"`).
  title?: string;
  // Optional description that overrides the default
  // "Retry to re-mount" copy on the ErrorState card.
  description?: string;
  // Optional className forwarded to the default
  // ErrorState wrapper.
  className?: string;
}

interface UIErrorBoundaryState {
  error: Error | null;
}

// (v1.11.352, TODO 11.334) Shallow array compare so the
// resetKeys identity flips trigger a state reset. Avoids
// the full structural-equality / lodash hops.
function shallowArrayEqual(
  a: ReadonlyArray<unknown> | undefined,
  b: ReadonlyArray<unknown> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class UIErrorBoundary extends Component<
  UIErrorBoundaryProps,
  UIErrorBoundaryState
> {
  override state: UIErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): UIErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // (v1.11.352, TODO 11.334) Always surface to the
    // console so dev-time stack traces are visible in
    // the devtools console without a wired reporter.
    // Production builds keep this since the operator
    // facing surface is the only error sink today.
    console.error('[UIErrorBoundary]', error, info.componentStack);
    if (this.props.onError) {
      try {
        this.props.onError(error, info);
      } catch {
        // The reporter must never re-throw into the
        // render path. Swallow + continue.
      }
    }
  }

  override componentDidUpdate(prevProps: UIErrorBoundaryProps): void {
    if (!this.state.error) return;
    if (
      !shallowArrayEqual(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback, title, description, className } = this.props;
    if (typeof fallback === 'function') {
      return fallback(error, this.reset);
    }
    if (fallback !== undefined) {
      return fallback;
    }
    return (
      <ErrorState
        title={title ?? 'Something went wrong'}
        description={
          description ?? 'This view failed to render. Retry to re-mount.'
        }
        error={error}
        onRetry={this.reset}
        retryLabel="Retry"
        data-testid="ui-error-boundary-fallback"
        {...(className !== undefined ? { className } : {})}
      />
    );
  }
}

(UIErrorBoundary as { displayName?: string }).displayName = 'UIErrorBoundary';
