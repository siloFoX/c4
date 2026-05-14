import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DesignSystem from './DesignSystem';
import { FEATURES } from './registry';

describe('DesignSystem page', () => {
  it('renders the page title', () => {
    render(<DesignSystem />);
    expect(screen.getAllByText('Design System').length).toBeGreaterThan(0);
  });

  it('renders at least 5 primitive demo sections', () => {
    const { container } = render(<DesignSystem />);
    const h3s = container.querySelectorAll('h3');
    expect(h3s.length).toBeGreaterThanOrEqual(5);
  });

  it('renders a Button demo with the Button primitive', () => {
    const { container } = render(<DesignSystem />);
    const h3s = Array.from(container.querySelectorAll('h3')).map(
      (n) => n.textContent,
    );
    expect(h3s).toContain('Button');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('renders an Alert demo with the Alert primitive', () => {
    const { container } = render(<DesignSystem />);
    const h3s = Array.from(container.querySelectorAll('h3')).map(
      (n) => n.textContent,
    );
    expect(h3s).toContain('Alert');
  });

  it('renders at least one CodeBlock', () => {
    const { container } = render(<DesignSystem />);
    const codeBlocks = container.querySelectorAll('[data-code-block-code]');
    expect(codeBlocks.length).toBeGreaterThan(0);
  });

  it('registers a "design-system" feature so the Features sidebar shows it', () => {
    const entry = FEATURES.find((f) => f.id === 'design-system');
    expect(entry).toBeTruthy();
    expect(entry?.labelKey).toBeTruthy();
  });
});
