import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionDivider } from './section-divider';

describe('<SectionDivider>', () => {
  it('renders a div with role=separator + aria-orientation=horizontal', () => {
    const { container } = render(<SectionDivider />);
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe('DIV');
    expect(root.getAttribute('role')).toBe('separator');
    expect(root.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('tags the root with data-section="section-divider"', () => {
    render(<SectionDivider />);
    expect(
      document.querySelector('[data-section="section-divider"]'),
    ).not.toBeNull();
  });

  it('defaults to variant="line" when no label / icon / variant is passed', () => {
    const { container } = render(<SectionDivider />);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-variant')).toBe('line');
  });

  it('renders only the rule when variant="line" (no content span)', () => {
    render(<SectionDivider />);
    expect(
      document.querySelector('[data-section-divider-content]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="leading"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="trailing"]'),
    ).not.toBeNull();
  });

  it('auto-promotes to variant="label-center" when a label is passed', () => {
    const { container } = render(<SectionDivider label="Recent" />);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-variant')).toBe('label-center');
    expect(
      document.querySelector('[data-section-divider-label]')!.textContent,
    ).toBe('Recent');
  });

  it('renders the label between two rule segments in label-center mode', () => {
    render(<SectionDivider label="Recent" variant="label-center" />);
    expect(
      document.querySelector('[data-section-divider-line="leading"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="trailing"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-divider-label]')!.textContent,
    ).toBe('Recent');
  });

  it('drops the leading rule in label-left mode', () => {
    render(<SectionDivider label="Recent" variant="label-left" />);
    expect(
      document.querySelector('[data-section-divider-line="leading"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="trailing"]'),
    ).not.toBeNull();
  });

  it('drops the trailing rule in label-right mode', () => {
    render(<SectionDivider label="Recent" variant="label-right" />);
    expect(
      document.querySelector('[data-section-divider-line="leading"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="trailing"]'),
    ).toBeNull();
  });

  it('renders an icon when provided', () => {
    render(
      <SectionDivider
        label="Tools"
        icon={<svg data-testid="div-icon" />}
      />,
    );
    expect(screen.getByTestId('div-icon')).toBeInTheDocument();
    expect(
      document.querySelector('[data-section-divider-icon]'),
    ).not.toBeNull();
  });

  it('renders an icon without a label when only icon is passed', () => {
    render(<SectionDivider icon={<svg data-testid="div-icon" />} />);
    expect(screen.getByTestId('div-icon')).toBeInTheDocument();
    expect(
      document.querySelector('[data-section-divider-label]'),
    ).toBeNull();
  });

  it('default spacing maps to my-3 (md)', () => {
    const { container } = render(<SectionDivider />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-3');
  });

  it('spacing="sm" maps to my-1 for tight separator groups', () => {
    const { container } = render(<SectionDivider spacing="sm" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-1');
  });

  it('spacing="lg" maps to my-6 for top-level section breaks', () => {
    const { container } = render(<SectionDivider spacing="lg" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-6');
  });

  it('merges caller className with the variant classes', () => {
    const { container } = render(
      <SectionDivider className="custom-divider" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('custom-divider');
    // Built-in flex class still applied alongside the override.
    expect(root.className).toContain('flex');
  });

  it('forwards arbitrary HTML attributes (data-testid, aria-label)', () => {
    render(
      <SectionDivider
        label="Recent"
        data-testid="my-divider"
        aria-label="Recent section break"
      />,
    );
    const root = screen.getByTestId('my-divider');
    expect(root.getAttribute('aria-label')).toBe('Recent section break');
  });

  it('label can be a ReactNode (not just a string)', () => {
    render(
      <SectionDivider
        label={<strong data-testid="bold-label">strong label</strong>}
      />,
    );
    expect(screen.getByTestId('bold-label')).toBeInTheDocument();
  });

  it('respects an explicit variant="line" even with a label passed', () => {
    // Explicit `line` always wins so a caller can drop a content
    // slot and revert to the hairline appearance without renaming
    // props.
    render(<SectionDivider label="ignored" variant="line" />);
    expect(
      document.querySelector('[data-section-divider-content]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="leading"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section-divider-line="trailing"]'),
    ).not.toBeNull();
  });
});
