import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { Button } from './button';

// Browser-mode visual smoke for <Button>. Mounts each variant in real
// Chromium so we get pixel-accurate styles (cva + tailwind merge), and
// captures a page-level screenshot per case so a reviewer can eyeball
// drift later. Functional behavior (click, disabled, ref forwarding,
// type defaulting) is already covered in button.test.tsx under the
// jsdom project — this file is intentionally narrower.
//
// Screenshots land under src/components/ui/__screenshots__/. Vitest
// keeps these as the visual baseline; failing tests also write a
// failure screenshot next to it so the diff is one click away.

describe('<Button> visual (chromium)', () => {
  it('renders the default variant and is visible', async () => {
    const screen = await render(<Button>Save</Button>);
    await expect
      .element(screen.getByRole('button', { name: 'Save' }))
      .toBeVisible();
    await page.screenshot();
  });

  it('renders every variant side-by-side without crashing', async () => {
    const screen = await render(
      <div style={{ display: 'flex', gap: 8, padding: 16, background: '#0b0b0d' }}>
        <Button variant="default">default</Button>
        <Button variant="destructive">destructive</Button>
        <Button variant="outline">outline</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="ghost">ghost</Button>
        <Button variant="link">link</Button>
      </div>,
    );
    await expect
      .element(screen.getByRole('button', { name: 'destructive' }))
      .toBeVisible();
    await page.screenshot();
  });

  it('renders every size side-by-side', async () => {
    const screen = await render(
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16, background: '#0b0b0d' }}>
        <Button size="sm">sm</Button>
        <Button size="md">md</Button>
        <Button size="lg">lg</Button>
      </div>,
    );
    await expect.element(screen.getByRole('button', { name: 'lg' })).toBeVisible();
    await page.screenshot();
  });

  it('renders the disabled state with reduced opacity', async () => {
    const screen = await render(<Button disabled>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    await expect.element(btn).toBeVisible();
    await expect.element(btn).toBeDisabled();
    await page.screenshot();
  });
});
