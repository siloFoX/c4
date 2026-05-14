import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

// Storyshot-style baseline: bare Card + each composed shape we ship. The
// composition matrix matters because consumers wire these together rather
// than passing a single prop, so a rename to e.g. CardHeader's padding
// would silently shift downstream surfaces without a snapshot in place.

describe('<Card> snapshot baselines', () => {
  it('bare card with body text only (no header / content / footer)', () => {
    const { container } = render(<Card>body</Card>);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-xl border border-border bg-card text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        body
      </div>
    `);
  });

  it('header + content composition', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>desc</CardDescription>
        </CardHeader>
        <CardContent>body</CardContent>
      </Card>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-xl border border-border bg-card text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="flex flex-col gap-1.5 p-6"
        >
          <div
            class="text-lg font-semibold leading-none tracking-tight"
          >
            Title
          </div>
          <div
            class="text-sm text-muted-foreground"
          >
            desc
          </div>
        </div>
        <div
          class="p-6 pt-0"
        >
          body
        </div>
      </div>
    `);
  });

  it('header + content + footer composition', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>desc</CardDescription>
        </CardHeader>
        <CardContent>body</CardContent>
        <CardFooter>foot</CardFooter>
      </Card>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-xl border border-border bg-card text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="flex flex-col gap-1.5 p-6"
        >
          <div
            class="text-lg font-semibold leading-none tracking-tight"
          >
            Title
          </div>
          <div
            class="text-sm text-muted-foreground"
          >
            desc
          </div>
        </div>
        <div
          class="p-6 pt-0"
        >
          body
        </div>
        <div
          class="flex items-center p-6 pt-0"
        >
          foot
        </div>
      </div>
    `);
  });

  it('content + footer without a header', () => {
    const { container } = render(
      <Card>
        <CardContent>body</CardContent>
        <CardFooter>foot</CardFooter>
      </Card>,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="rounded-xl border border-border bg-card text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div
          class="p-6 pt-0"
        >
          body
        </div>
        <div
          class="flex items-center p-6 pt-0"
        >
          foot
        </div>
      </div>
    `);
  });
});
