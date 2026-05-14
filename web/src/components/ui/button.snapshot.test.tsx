import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from './button';

// Storyshot-style baseline: render each documented variant + size so a
// rogue class-name change is flagged in review. Pure markup diff -- no
// behaviour assertions live here (those stay in button.test.tsx).

describe('<Button> snapshot baselines', () => {
  describe('variant', () => {
    it('default', () => {
      const { container } = render(<Button>Save</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Save
        </button>
      `);
    });

    it('destructive', () => {
      const { container } = render(<Button variant="destructive">Delete</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Delete
        </button>
      `);
    });

    it('outline', () => {
      const { container } = render(<Button variant="outline">Outline</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Outline
        </button>
      `);
    });

    it('secondary', () => {
      const { container } = render(<Button variant="secondary">Secondary</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Secondary
        </button>
      `);
    });

    it('ghost', () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 hover:bg-accent hover:text-accent-foreground h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Ghost
        </button>
      `);
    });

    it('link', () => {
      const { container } = render(<Button variant="link">Link</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 text-primary underline-offset-4 hover:underline h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Link
        </button>
      `);
    });
  });

  describe('size', () => {
    it('default (md)', () => {
      const { container } = render(<Button>Default size</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Default size
        </button>
      `);
    });

    it('sm', () => {
      const { container } = render(<Button size="sm">Small</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-sm min-h-[44px] sm:min-h-0"
          type="button"
        >
          Small
        </button>
      `);
    });

    it('lg', () => {
      const { container } = render(<Button size="lg">Large</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 text-base"
          type="button"
        >
          Large
        </button>
      `);
    });

    it('icon', () => {
      const { container } = render(<Button size="icon" aria-label="settings">i</Button>);
      expect(container.firstChild).toMatchInlineSnapshot(`
        <button
          aria-label="settings"
          class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          type="button"
        >
          i
        </button>
      `);
    });
  });
});
