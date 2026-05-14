import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Panel } from './panel';

// Storyshot-style baseline: Panel renders its header band only when at
// least one of icon / title / action is provided. Capture the bare body
// shape + every header-prop combination so the conditional render branch
// is fenced in by a markup snapshot.

describe('<Panel> snapshot baselines', () => {
  it('body only (no icon / title / action -> no header band)', () => {
    const { container } = render(<Panel>body</Panel>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        body
      </div>
    `);
  });

  it('title only', () => {
    const { container } = render(<Panel title="My Panel">body</Panel>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="mb-3 flex items-center justify-between gap-2"
        >
          <div
            class="flex min-w-0 items-center gap-2"
          >
            <h3
              class="truncate text-sm font-semibold text-foreground"
            >
              My Panel
            </h3>
          </div>
        </div>
        body
      </div>
    `);
  });

  it('icon + title', () => {
    const { container } = render(
      <Panel icon={<svg data-testid="i" aria-hidden="true" />} title="With Icon">
        body
      </Panel>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="mb-3 flex items-center justify-between gap-2"
        >
          <div
            class="flex min-w-0 items-center gap-2"
          >
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
            >
              <svg
                aria-hidden="true"
                data-testid="i"
              />
            </span>
            <h3
              class="truncate text-sm font-semibold text-foreground"
            >
              With Icon
            </h3>
          </div>
        </div>
        body
      </div>
    `);
  });

  it('title + action (footer-style trailing slot)', () => {
    const { container } = render(
      <Panel title="With Action" action={<button type="button">Refresh</button>}>
        body
      </Panel>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="mb-3 flex items-center justify-between gap-2"
        >
          <div
            class="flex min-w-0 items-center gap-2"
          >
            <h3
              class="truncate text-sm font-semibold text-foreground"
            >
              With Action
            </h3>
          </div>
          <div
            class="shrink-0"
          >
            <button
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        body
      </div>
    `);
  });

  it('action only (header band still renders without a title)', () => {
    const { container } = render(
      <Panel action={<button type="button">Only</button>}>body</Panel>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="mb-3 flex items-center justify-between gap-2"
        >
          <div
            class="flex min-w-0 items-center gap-2"
          />
          <div
            class="shrink-0"
          >
            <button
              type="button"
            >
              Only
            </button>
          </div>
        </div>
        body
      </div>
    `);
  });
});
