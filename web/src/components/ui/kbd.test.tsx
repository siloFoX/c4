import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kbd } from './kbd';

describe('<Kbd>', () => {
  it('renders a single <kbd> element when given children', () => {
    const { container } = render(<Kbd>Esc</Kbd>);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBe(1);
    expect(kbds[0]).toHaveTextContent('Esc');
  });

  it('places data-kbd on the outermost wrapper in single-key mode', () => {
    const { container } = render(<Kbd>Esc</Kbd>);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root!.tagName).toBe('KBD');
    expect(root!.getAttribute('data-kbd')).not.toBeNull();
  });

  it('renders N <kbd> elements when keys is an N-length array', () => {
    const { container } = render(<Kbd keys={['Ctrl', 'K']} />);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBe(2);
    expect(kbds[0]).toHaveTextContent('Ctrl');
    expect(kbds[1]).toHaveTextContent('K');
  });

  it('renders (N-1) separators between N keys', () => {
    const { container } = render(<Kbd keys={['Ctrl', 'Shift', 'P']} />);
    const seps = container.querySelectorAll('[data-kbd-separator]');
    expect(seps.length).toBe(2);
  });

  it('uses the default separator " + " between keys', () => {
    const { container } = render(<Kbd keys={['Ctrl', 'K']} />);
    const sep = container.querySelector('[data-kbd-separator]');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toBe(' + ');
  });

  it('honors a custom separator', () => {
    const { container } = render(
      <Kbd keys={['Ctrl', 'K']} separator=" / " />,
    );
    const sep = container.querySelector('[data-kbd-separator]');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toBe(' / ');
  });

  it('places data-kbd on the outermost wrapper in join mode', () => {
    const { container } = render(<Kbd keys={['Ctrl', 'K']} />);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root!.tagName).toBe('SPAN');
    expect(root!.getAttribute('data-kbd')).not.toBeNull();
  });

  it('applies border, bg-muted, and font-mono classes to each <kbd>', () => {
    const { container } = render(<Kbd keys={['Ctrl', 'K']} />);
    const kbds = container.querySelectorAll('kbd');
    kbds.forEach((node) => {
      expect(node.className).toContain('border');
      expect(node.className).toContain('bg-muted');
      expect(node.className).toContain('font-mono');
    });
  });

  it('applies border, bg-muted, and font-mono classes in single-key mode', () => {
    render(<Kbd>Esc</Kbd>);
    const node = screen.getByText('Esc');
    expect(node.className).toContain('border');
    expect(node.className).toContain('bg-muted');
    expect(node.className).toContain('font-mono');
  });

  it('merges caller className with the variant classes', () => {
    render(<Kbd className="my-kbd">Esc</Kbd>);
    const node = screen.getByText('Esc');
    expect(node).toHaveClass('my-kbd');
    expect(node.className).toContain('font-mono');
  });

  it('forwards aria-keyshortcuts and other HTML attributes', () => {
    const { container } = render(
      <Kbd aria-keyshortcuts="Control+K" data-testid="kbd-1">
        Ctrl+K
      </Kbd>,
    );
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root!.getAttribute('aria-keyshortcuts')).toBe('Control+K');
    expect(root!.getAttribute('data-testid')).toBe('kbd-1');
  });

  it('falls back to single-key mode when keys is an empty array', () => {
    const { container } = render(<Kbd keys={[]}>Esc</Kbd>);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBe(1);
    expect(kbds[0]).toHaveTextContent('Esc');
  });
});
