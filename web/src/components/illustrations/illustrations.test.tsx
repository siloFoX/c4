import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  AllDoneIllustration,
  EmptyQueueIllustration,
  NoWorkersIllustration,
  WelcomeOnboardingIllustration,
} from './index';

// (TODO 11.66, v1.11.84) Hero illustration suite. Mirrors the
// patterns from ui/badge.test.tsx (variant + className passthrough)
// and ui/empty-state.test.tsx (a11y semantics on the wrapper). Each
// illustration is a thin svg shell, so the contract worth pinning is
// the svg shape: viewBox, currentColor stroke, default size, a11y
// branching between decorative (`aria-hidden`) and labelled
// (`role="img"`) modes.

const ALL = [
  ['EmptyQueueIllustration', EmptyQueueIllustration],
  ['NoWorkersIllustration', NoWorkersIllustration],
  ['WelcomeOnboardingIllustration', WelcomeOnboardingIllustration],
  ['AllDoneIllustration', AllDoneIllustration],
] as const;

describe('illustrations', () => {
  it.each(ALL)('%s renders a top-level <svg> with the shared viewBox', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 240 180');
  });

  it.each(ALL)('%s renders with currentColor stroke for theming', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it.each(ALL)('%s defaults to decorative aria-hidden="true"', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it.each(ALL)(
    '%s flips to role="img" when aria-hidden is explicitly false',
    (_name, Comp) => {
      const { container } = render(<Comp aria-hidden={false} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('role')).toBe('img');
      expect(svg?.getAttribute('aria-hidden')).toBeNull();
      expect(svg?.getAttribute('aria-label')).toBeTruthy();
    },
  );

  it.each(ALL)('%s applies the default size of 160 when omitted', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('160');
    expect(svg?.getAttribute('height')).toBe('160');
  });

  it.each(ALL)('%s passes the size prop through to width/height', (_name, Comp) => {
    const { container } = render(<Comp size={96} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('96');
    expect(svg?.getAttribute('height')).toBe('96');
  });

  it.each(ALL)('%s forwards caller className to the root svg', (_name, Comp) => {
    const { container } = render(<Comp className="text-muted-foreground" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.classList.contains('text-muted-foreground')).toBe(true);
  });

  it('renders unique path content per illustration (set is not identical clones)', () => {
    const html = ALL.map(([, Comp]) => {
      const { container } = render(<Comp />);
      return container.innerHTML;
    });
    const unique = new Set(html);
    expect(unique.size).toBe(html.length);
  });

  it('every illustration ships within the 8-25 shape budget', () => {
    for (const [, Comp] of ALL) {
      const { container } = render(<Comp />);
      const shapes = container.querySelectorAll(
        'svg path, svg line, svg circle, svg rect, svg polygon',
      );
      expect(shapes.length).toBeGreaterThanOrEqual(8);
      expect(shapes.length).toBeLessThanOrEqual(25);
    }
  });

  it('every illustration sets fill="none" on the root so unintended fills do not leak in', () => {
    for (const [, Comp] of ALL) {
      const { container } = render(<Comp />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('fill')).toBe('none');
    }
  });

  it('every illustration uses a 1.5 to 2 stroke weight', () => {
    for (const [, Comp] of ALL) {
      const { container } = render(<Comp />);
      const svg = container.querySelector('svg');
      const sw = Number(svg?.getAttribute('stroke-width'));
      expect(sw).toBeGreaterThanOrEqual(1.5);
      expect(sw).toBeLessThanOrEqual(2);
    }
  });

  it('AllDoneIllustration renders a checkmark stroke and a circle', () => {
    const { container } = render(<AllDoneIllustration />);
    expect(container.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(1);
  });

  it('EmptyQueueIllustration ships dashed placeholder lines for empty rows', () => {
    const { container } = render(<EmptyQueueIllustration />);
    const dashed = Array.from(container.querySelectorAll('svg line')).filter((el) =>
      el.getAttribute('stroke-dasharray'),
    );
    expect(dashed.length).toBeGreaterThanOrEqual(2);
  });

  it('WelcomeOnboardingIllustration renders sparkle marks plus the door silhouette', () => {
    const { container } = render(<WelcomeOnboardingIllustration />);
    expect(container.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(2);
  });

  it('NoWorkersIllustration renders the desk plus the rising zzz hint', () => {
    const { container } = render(<NoWorkersIllustration />);
    expect(container.querySelectorAll('svg text').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(1);
  });
});
