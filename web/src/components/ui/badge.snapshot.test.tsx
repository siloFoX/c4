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
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-primary text-primary-foreground"
      >
        idle
      </span>
    `);
  });

  it('secondary', () => {
    const { container } = render(<Badge variant="secondary">draft</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-secondary text-secondary-foreground"
      >
        draft
      </span>
    `);
  });

  it('destructive', () => {
    const { container } = render(<Badge variant="destructive">err</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-destructive text-destructive-foreground"
      >
        err
      </span>
    `);
  });

  it('outline', () => {
    const { container } = render(<Badge variant="outline">outline</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors text-foreground"
      >
        outline
      </span>
    `);
  });

  it('success', () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-success/15 text-success"
      >
        ok
      </span>
    `);
  });

  it('warning', () => {
    const { container } = render(<Badge variant="warning">busy</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-warning/15 text-warning"
      >
        busy
      </span>
    `);
  });

  it('info', () => {
    const { container } = render(<Badge variant="info">info</Badge>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-info/15 text-info"
      >
        info
      </span>
    `);
  });
});
