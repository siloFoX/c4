import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from './badge';

// Storyshot-style baseline: every documented Badge variant. Tone variants
// (success / warning / info) are public and consumed across the dashboard,
// so they live in the baseline alongside the core four.

describe('<Badge> snapshot baselines', () => {
  it('default', () => {
    const { container } = render(<Badge>idle</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors border-transparent bg-primary text-primary-foreground px-2.5 py-0.5 text-xs"
        data-size="md"
      >
        idle
      </span>
    `);
  });

  it('secondary', () => {
    const { container } = render(<Badge variant="secondary">draft</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs"
        data-size="md"
      >
        draft
      </span>
    `);
  });

  it('destructive', () => {
    const { container } = render(<Badge variant="destructive">err</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors border-transparent bg-destructive text-destructive-foreground px-2.5 py-0.5 text-xs gap-1"
        data-size="md"
      >
        <svg
          aria-hidden="true"
          class="lucide lucide-circle-x h-3 w-3"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <path
            d="m15 9-6 6"
          />
          <path
            d="m9 9 6 6"
          />
        </svg>
        err
      </span>
    `);
  });

  it('outline', () => {
    const { container } = render(<Badge variant="outline">outline</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors text-foreground px-2.5 py-0.5 text-xs"
        data-size="md"
      >
        outline
      </span>
    `);
  });

  it('success', () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors border-transparent bg-success/15 text-success px-2.5 py-0.5 text-xs gap-1"
        data-size="md"
      >
        <svg
          aria-hidden="true"
          class="lucide lucide-circle-check h-3 w-3"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <path
            d="m9 12 2 2 4-4"
          />
        </svg>
        ok
      </span>
    `);
  });

  it('warning', () => {
    const { container } = render(<Badge variant="warning">busy</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors border-transparent bg-warning/15 text-warning px-2.5 py-0.5 text-xs gap-1"
        data-size="md"
      >
        <svg
          aria-hidden="true"
          class="lucide lucide-triangle-alert h-3 w-3"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
          />
          <path
            d="M12 9v4"
          />
          <path
            d="M12 17h.01"
          />
        </svg>
        busy
      </span>
    `);
  });

  it('info', () => {
    const { container } = render(<Badge variant="info">info</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border font-semibold transition-colors border-transparent bg-info/15 text-info px-2.5 py-0.5 text-xs gap-1"
        data-size="md"
      >
        <svg
          aria-hidden="true"
          class="lucide lucide-info h-3 w-3"
          fill="none"
          height="24"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <path
            d="M12 16v-4"
          />
          <path
            d="M12 8h.01"
          />
        </svg>
        info
      </span>
    `);
  });
});
