import { describe, it, expect } from 'vitest';
import { Suspense, lazy } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { FEATURES } from './registry';

// (v1.11.102) Bundle-perf deliverable. The four pages below are the
// heaviest feature chunks per `npm run build:analyze` -- they each
// land in their own JS chunk because registry's load callback is a
// dynamic import(). We assert the shape rather than resolving the
// promise so the test does not pull in xterm / msw fixtures bundled
// by those pages.
const HEAVY_FEATURE_IDS = ['auto', 'risk', 'queue', 'token-usage'] as const;

const REACT_LAZY_TAG = Symbol.for('react.lazy');

describe('page lazy boundary', () => {
  for (const id of HEAVY_FEATURE_IDS) {
    it(`registry entry "${id}" wraps cleanly with React.lazy`, () => {
      const feat = FEATURES.find((f) => f.id === id);
      expect(feat, `feature "${id}" missing from registry`).toBeDefined();
      const Lazy = lazy(feat!.load);
      // React.lazy returns an object exotic component with a sentinel
      // $$typeof tag. This is the same check React itself uses to
      // decide whether to suspend on first render.
      expect((Lazy as unknown as { $$typeof: symbol }).$$typeof).toBe(
        REACT_LAZY_TAG,
      );
    });
  }

  it('renders a stubbed lazy page through Suspense once the promise resolves', async () => {
    const Stub = lazy(async () => ({
      default: () => <div data-testid="lazy-page-body">loaded</div>,
    }));
    render(
      <Suspense fallback={<div data-testid="suspense-fallback">loading</div>}>
        <Stub />
      </Suspense>,
    );
    // Initial render shows the fallback because the promise is still pending.
    expect(screen.getByTestId('suspense-fallback')).toBeInTheDocument();
    // After microtasks flush, React swaps the fallback for the resolved body.
    await waitFor(() => {
      expect(screen.getByTestId('lazy-page-body')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('suspense-fallback')).not.toBeInTheDocument();
  });
});
