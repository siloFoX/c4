import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { HeroCard } from './hero-card';

describe('<HeroCard>', () => {
  it('renders the title text', () => {
    render(<HeroCard title="Welcome back" />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <HeroCard
        title="Welcome"
        description="Multi-repo workspace overview."
      />,
    );
    expect(
      screen.getByText('Multi-repo workspace overview.'),
    ).toBeInTheDocument();
  });

  it('omits the description element when absent', () => {
    const { container } = render(<HeroCard title="Welcome" />);
    expect(
      container.querySelector('[data-hero-card-description]'),
    ).toBeNull();
  });

  it('renders the icon prop inside the icon container', () => {
    const { container } = render(
      <HeroCard
        title="Workspaces"
        icon={<svg data-testid="hero-icon" />}
      />,
    );
    const slot = container.querySelector('[data-hero-card-icon]');
    expect(slot).not.toBeNull();
    expect(slot?.querySelector('[data-testid="hero-icon"]')).not.toBeNull();
  });

  it('renders the cta prop', () => {
    render(
      <HeroCard
        title="Profiles"
        cta={<button type="button">Get started</button>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Get started' }),
    ).toBeInTheDocument();
  });

  it('renders the secondaryCta prop alongside cta', () => {
    render(
      <HeroCard
        title="Profiles"
        cta={<button type="button">Primary</button>}
        secondaryCta={<button type="button">Secondary</button>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Primary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Secondary' }),
    ).toBeInTheDocument();
  });

  it("applies tone='success' classes (data-tone)", () => {
    const { container } = render(
      <HeroCard title="Done" tone="success" />,
    );
    const root = container.querySelector('[data-hero-card]');
    expect(root).toHaveAttribute('data-tone', 'success');
    const gradient = container.querySelector('[data-hero-card-gradient]');
    expect(gradient?.className).toMatch(/from-success/);
  });

  it("defaults tone to 'primary'", () => {
    const { container } = render(<HeroCard title="Default" />);
    const root = container.querySelector('[data-hero-card]');
    expect(root).toHaveAttribute('data-tone', 'primary');
  });

  it('applies size-specific padding classes for sm / md / lg', () => {
    const { container: sm } = render(<HeroCard title="A" size="sm" />);
    expect(sm.querySelector('[data-hero-card]')?.className).toMatch(/p-4/);
    const { container: md } = render(<HeroCard title="B" size="md" />);
    expect(md.querySelector('[data-hero-card]')?.className).toMatch(/p-6/);
    const { container: lg } = render(<HeroCard title="C" size="lg" />);
    expect(lg.querySelector('[data-hero-card]')?.className).toMatch(/p-8/);
  });

  it('merges the caller className onto the root element', () => {
    const { container } = render(
      <HeroCard title="Merged" className="custom-extra-class" />,
    );
    const root = container.querySelector('[data-hero-card]');
    expect(root?.className).toMatch(/custom-extra-class/);
  });

  it('forwards the ref to the underlying <section> element', () => {
    const ref = createRef<HTMLElement>();
    render(<HeroCard ref={ref} title="Ref" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('SECTION');
  });

  it("muted tone applies muted gradient classes", () => {
    const { container } = render(<HeroCard title="M" tone="muted" />);
    const gradient = container.querySelector('[data-hero-card-gradient]');
    expect(gradient?.className).toMatch(/from-muted/);
  });
});
