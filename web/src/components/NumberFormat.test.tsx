import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NumberFormat, formatNumber } from './NumberFormat';

describe('NumberFormat (component)', () => {
  it('renders default decimal format with grouping', () => {
    const { container } = render(<NumberFormat value={1234567} />);
    expect(container.textContent).toBe('1,234,567');
    expect(container.firstChild?.nodeName).toBe('SPAN');
  });

  it('renders currency style with USD by default', () => {
    const { container } = render(<NumberFormat value={42} style="currency" />);
    expect(container.textContent).toContain('$');
    expect(container.textContent).toContain('42');
  });

  it('renders percent style multiplied by 100', () => {
    const { container } = render(
      <NumberFormat value={0.5} style="percent" maximumFractionDigits={0} />,
    );
    expect(container.textContent).toBe('50%');
  });

  it('renders compact notation: 1500 -> 1.5K', () => {
    const { container } = render(<NumberFormat value={1500} compact />);
    expect(container.textContent).toBe('1.5K');
  });

  it('renders compact notation: 1500000 -> 1.5M', () => {
    const { container } = render(<NumberFormat value={1500000} compact />);
    expect(container.textContent).toBe('1.5M');
  });

  it('respects minimumFractionDigits and maximumFractionDigits', () => {
    const { container } = render(
      <NumberFormat
        value={3.1}
        minimumFractionDigits={2}
        maximumFractionDigits={2}
      />,
    );
    expect(container.textContent).toBe('3.10');
  });

  it('renders NaN as em-dash', () => {
    const { container } = render(<NumberFormat value={Number.NaN} />);
    expect(container.textContent).toBe('—');
  });

  it('renders Infinity as em-dash', () => {
    const { container } = render(<NumberFormat value={Number.POSITIVE_INFINITY} />);
    expect(container.textContent).toBe('—');
  });

  it('renders negative Infinity as em-dash', () => {
    const { container } = render(<NumberFormat value={Number.NEGATIVE_INFINITY} />);
    expect(container.textContent).toBe('—');
  });

  it('honors a custom locale (de-DE uses period for thousand separator)', () => {
    const { container } = render(<NumberFormat value={1234567} locale="de-DE" />);
    // de-DE renders 1234567 as "1.234.567" (period grouping, comma decimal)
    expect(container.textContent).toBe('1.234.567');
  });

  it('forwards className to the rendered span', () => {
    const { container } = render(
      <NumberFormat value={1} className="text-xs" />,
    );
    expect((container.firstChild as HTMLElement | null)?.className).toBe('text-xs');
  });
});

describe('formatNumber (helper)', () => {
  it('returns formatted string for default decimals', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('returns em-dash for NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  it('returns em-dash for Infinity', () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('honors compact notation', () => {
    expect(formatNumber(2500000, { compact: true })).toBe('2.5M');
  });

  it('honors percent style', () => {
    expect(formatNumber(0.25, { style: 'percent', maximumFractionDigits: 0 })).toBe('25%');
  });

  it('honors custom locale override', () => {
    expect(formatNumber(1234, { locale: 'de-DE' })).toBe('1.234');
  });

  it('honors currency style with EUR', () => {
    const out = formatNumber(10, { style: 'currency', currency: 'EUR', locale: 'en-US' });
    expect(out).toContain('10');
    // en-US renders EUR as "€10.00"
    expect(out).toMatch(/[€]/);
  });
});
