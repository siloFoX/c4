import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusDot } from './status-dot';

describe('<StatusDot>', () => {
  it('renders a status wrapper with role=status by default', () => {
    render(<StatusDot data-testid="dot" />);
    const node = screen.getByTestId('dot');
    expect(node).toBeInTheDocument();
    expect(node).toHaveAttribute('role', 'status');
  });

  it("variant='online' applies the canonical success-token dot class (v1.11.242)", () => {
    const { container } = render(<StatusDot variant="online" />);
    const dot = container.querySelector('.rounded-full');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-success');
  });

  it("variant='busy' applies the canonical warning-token dot class (v1.11.242)", () => {
    const { container } = render(<StatusDot variant="busy" />);
    const dot = container.querySelector('.rounded-full');
    expect(dot?.className).toContain('bg-warning');
  });

  it("variant='away' applies the chart-3 token dot class (v1.11.242)", () => {
    const { container } = render(<StatusDot variant="away" />);
    const dot = container.querySelector('.rounded-full');
    expect(dot?.className).toContain('bg-chart-3');
  });

  it("variant='offline' applies muted-foreground class", () => {
    const { container } = render(<StatusDot variant="offline" />);
    const dot = container.querySelector('.rounded-full');
    expect(dot?.className).toContain('bg-muted-foreground');
  });

  it("variant='unknown' (default) applies bg-muted", () => {
    const { container } = render(<StatusDot />);
    const dot = container.querySelector('.rounded-full');
    expect(dot?.className).toContain('bg-muted');
    expect(dot?.className).not.toContain('bg-muted-foreground');
  });

  it("applies size sm/md/lg classes to the dot element", () => {
    const { container: sm } = render(<StatusDot size="sm" />);
    expect(sm.querySelector('.rounded-full')?.className).toContain('h-1.5');
    const { container: md } = render(<StatusDot size="md" />);
    expect(md.querySelector('.rounded-full')?.className).toContain('h-2');
    const { container: lg } = render(<StatusDot size="lg" />);
    expect(lg.querySelector('.rounded-full')?.className).toContain('h-2.5');
  });

  it('pulse=true renders an animate-ping span', () => {
    const { container } = render(<StatusDot variant="online" pulse />);
    const ping = container.querySelector('.animate-ping');
    expect(ping).not.toBeNull();
    expect(ping?.className).toContain('bg-success');
  });

  it('pulse=false omits the animate-ping span', () => {
    const { container } = render(<StatusDot variant="online" />);
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('renders the label when provided', () => {
    render(<StatusDot variant="online" label="Online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('falls back to aria-label when no label is provided', () => {
    render(<StatusDot variant="busy" data-testid="dot" />);
    const node = screen.getByTestId('dot');
    expect(node).toHaveAttribute('aria-label', 'Status: busy');
  });

  it('omits the auto aria-label when an explicit label is provided', () => {
    render(<StatusDot variant="online" label="Online" data-testid="dot" />);
    const node = screen.getByTestId('dot');
    expect(node).not.toHaveAttribute('aria-label');
  });

  it('merges caller-provided className onto the wrapper', () => {
    render(<StatusDot className="my-extra" data-testid="dot" />);
    const node = screen.getByTestId('dot');
    expect(node.className).toContain('my-extra');
    expect(node.className).toContain('inline-flex');
  });
});
