import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tooltip } from './tooltip';

// Storyshot-style baseline: Tooltip wraps a single trigger element and
// renders a sibling `role="tooltip"` carrying the label. The controlled
// `open` prop is how we keep the visible-state snapshot deterministic in
// jsdom (no hover / focus timer needed). Each documented placement gets
// its own baseline so a class-name swap in the placement map is flagged.

describe('<Tooltip> snapshot baselines', () => {
  it('hidden by default (uncontrolled, opacity-0)', () => {
    const { container } = render(
      <Tooltip label="Save changes">
        <button type="button">Save</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="relative inline-flex"
        data-tooltip-root="true"
      >
        <button
          type="button"
        >
          Save
        </button>
        <span
          class="pointer-events-none absolute z-50 max-w-[260px] whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0"
          data-visible="false"
          id=":r0:"
          role="tooltip"
        >
          Save changes
        </span>
      </span>
    `);
  });

  it('visible via controlled open prop (placement="top")', () => {
    const { container } = render(
      <Tooltip label="Save changes" open>
        <button type="button">Save</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="relative inline-flex"
        data-tooltip-root="true"
      >
        <button
          aria-describedby=":r1:"
          type="button"
        >
          Save
        </button>
        <span
          class="pointer-events-none absolute z-50 max-w-[260px] whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-100"
          data-visible="true"
          id=":r1:"
          role="tooltip"
        >
          Save changes
        </span>
      </span>
    `);
  });

  it('placement="bottom" (visible)', () => {
    const { container } = render(
      <Tooltip label="Below" placement="bottom" open>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="relative inline-flex"
        data-tooltip-root="true"
      >
        <button
          aria-describedby=":r2:"
          type="button"
        >
          Trigger
        </button>
        <span
          class="pointer-events-none absolute z-50 max-w-[260px] whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity top-full left-1/2 -translate-x-1/2 mt-1.5 opacity-100"
          data-visible="true"
          id=":r2:"
          role="tooltip"
        >
          Below
        </span>
      </span>
    `);
  });

  it('placement="left" (visible)', () => {
    const { container } = render(
      <Tooltip label="Leftward" placement="left" open>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="relative inline-flex"
        data-tooltip-root="true"
      >
        <button
          aria-describedby=":r3:"
          type="button"
        >
          Trigger
        </button>
        <span
          class="pointer-events-none absolute z-50 max-w-[260px] whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity right-full top-1/2 -translate-y-1/2 mr-1.5 opacity-100"
          data-visible="true"
          id=":r3:"
          role="tooltip"
        >
          Leftward
        </span>
      </span>
    `);
  });

  it('placement="right" (visible)', () => {
    const { container } = render(
      <Tooltip label="Rightward" placement="right" open>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="relative inline-flex"
        data-tooltip-root="true"
      >
        <button
          aria-describedby=":r4:"
          type="button"
        >
          Trigger
        </button>
        <span
          class="pointer-events-none absolute z-50 max-w-[260px] whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity left-full top-1/2 -translate-y-1/2 ml-1.5 opacity-100"
          data-visible="true"
          id=":r4:"
          role="tooltip"
        >
          Rightward
        </span>
      </span>
    `);
  });
});
