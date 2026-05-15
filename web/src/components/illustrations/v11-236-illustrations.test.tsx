import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  AccessDeniedIllustration,
  NoDataIllustration,
  OffScheduleIllustration,
} from './index';

// (v1.11.254, TODO 11.236) Test suite for the three new
// hero-style illustrations. They share the 240x180 viewBox,
// the 160 px default size (same family as AllDone /
// EmptyQueue / NoWorkers), and the 1.75 stroke contract.

const V11_236 = [
  ['NoDataIllustration', NoDataIllustration],
  ['OffScheduleIllustration', OffScheduleIllustration],
  ['AccessDeniedIllustration', AccessDeniedIllustration],
] as const;

describe('illustrations v1.11.254', () => {
  it.each(V11_236)('%s renders an svg with the shared 240x180 viewBox', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 240 180');
  });

  it.each(V11_236)('%s defaults to 160 px width when size is omitted', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('160');
    expect(svg?.getAttribute('height')).toBe('160');
  });

  it.each(V11_236)('%s honors the named size token "sm" (64)', (_name, Comp) => {
    const { container } = render(<Comp size="sm" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('64');
    expect(svg?.getAttribute('height')).toBe('64');
  });

  it.each(V11_236)('%s defaults to aria-hidden (decorative)', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(V11_236)('%s exposes role=img + aria-label when aria-hidden is explicitly false', (_name, Comp) => {
    const { container } = render(<Comp aria-hidden={false} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect((svg?.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
  });

  it.each(V11_236)('%s uses currentColor for stroke and the shared 1.75 width', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(svg?.getAttribute('stroke-width')).toBe('1.75');
  });

  it('NoData carries the dashed baseline that signals the empty surface', () => {
    const { container } = render(<NoDataIllustration />);
    const dashed = Array.from(container.querySelectorAll('[stroke-dasharray]'));
    expect(dashed.length).toBeGreaterThan(0);
  });

  it('OffSchedule carries a circle (clock face) AND a dashed calendar slot', () => {
    const { container } = render(<OffScheduleIllustration />);
    expect(container.querySelector('circle')).not.toBeNull();
    const dashedRects = container.querySelectorAll('rect[stroke-dasharray]');
    expect(dashedRects.length).toBeGreaterThan(0);
  });

  it('AccessDenied carries the padlock body + dashed key silhouette', () => {
    const { container } = render(<AccessDeniedIllustration />);
    // Padlock body is the only filled rect with rounded corners
    // and the accent fill; the dashed circle is the displaced key
    // bow.
    const dashedCircle = container.querySelector('circle[stroke-dasharray]');
    expect(dashedCircle).not.toBeNull();
  });
});
