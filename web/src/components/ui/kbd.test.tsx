import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kbd, mapKey, parseCombo, detectPlatform } from './kbd';

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

  // -- v1.11.268 platform-aware mod mapping (TODO 11.250) ----------

  it('combo prop parses "Cmd+K" on mac into glyph + literal key', () => {
    const { container } = render(<Kbd combo="Cmd+K" platform="mac" />);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBe(2);
    expect(kbds[0]!.textContent).toBe('⌘'); // ⌘
    expect(kbds[1]!.textContent).toBe('K');
  });

  it('combo prop parses "Mod+K" platform="mac" -> ⌘ + K', () => {
    const { container } = render(<Kbd combo="Mod+K" platform="mac" />);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds[0]!.textContent).toBe('⌘');
    expect(kbds[1]!.textContent).toBe('K');
  });

  it('combo prop parses "Mod+K" platform="other" -> Ctrl + K', () => {
    const { container } = render(<Kbd combo="Mod+K" platform="other" />);
    const kbds = container.querySelectorAll('kbd');
    expect(kbds[0]!.textContent).toBe('Ctrl');
    expect(kbds[1]!.textContent).toBe('K');
  });

  it('combo prop parses "Ctrl+Shift+P" on mac with three glyphs', () => {
    const { container } = render(
      <Kbd combo="Ctrl+Shift+P" platform="mac" />,
    );
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBe(3);
    expect(kbds[0]!.textContent).toBe('⌃'); // ⌃
    expect(kbds[1]!.textContent).toBe('⇧'); // ⇧
    expect(kbds[2]!.textContent).toBe('P');
  });

  it('combo prop parses "Ctrl+Shift+P" on other platforms verbatim', () => {
    const { container } = render(
      <Kbd combo="Ctrl+Shift+P" platform="other" />,
    );
    const kbds = container.querySelectorAll('kbd');
    expect(kbds[0]!.textContent).toBe('Ctrl');
    expect(kbds[1]!.textContent).toBe('Shift');
    expect(kbds[2]!.textContent).toBe('P');
  });

  it('mac default separator drops to "" (tight glyph layout)', () => {
    const { container } = render(<Kbd combo="Cmd+K" platform="mac" />);
    const seps = container.querySelectorAll('[data-kbd-separator]');
    expect(seps.length).toBe(0);
  });

  it('non-mac default separator stays " + "', () => {
    const { container } = render(<Kbd combo="Ctrl+K" platform="other" />);
    const sep = container.querySelector('[data-kbd-separator]');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toBe(' + ');
  });

  it('explicit separator overrides the platform default', () => {
    const { container } = render(
      <Kbd combo="Cmd+K" platform="mac" separator=" / " />,
    );
    const sep = container.querySelector('[data-kbd-separator]');
    expect(sep).not.toBeNull();
    expect(sep!.textContent).toBe(' / ');
  });

  it('maps Alt / Option to ⌥ on mac, Alt verbatim on other', () => {
    expect(mapKey('Alt', 'mac')).toBe('⌥');
    expect(mapKey('Option', 'mac')).toBe('⌥');
    expect(mapKey('Alt', 'other')).toBe('Alt');
  });

  it('maps Enter / Backspace / Esc / Tab / Space on mac', () => {
    expect(mapKey('Enter', 'mac')).toBe('↵');
    expect(mapKey('Backspace', 'mac')).toBe('⌫');
    expect(mapKey('Esc', 'mac')).toBe('⎋');
    expect(mapKey('Escape', 'mac')).toBe('⎋');
    expect(mapKey('Tab', 'mac')).toBe('⇥');
    expect(mapKey('Space', 'mac')).toBe('␣');
  });

  it('keeps non-modifier keys verbatim regardless of platform', () => {
    expect(mapKey('K', 'mac')).toBe('K');
    expect(mapKey('K', 'other')).toBe('K');
    expect(mapKey('?', 'mac')).toBe('?');
    expect(mapKey('/', 'other')).toBe('/');
  });

  it('parseCombo splits + and trims whitespace', () => {
    expect(parseCombo('  Cmd + K  ', 'other')).toEqual(['Ctrl', 'K']);
    expect(parseCombo('Cmd+K', 'mac')).toEqual(['⌘', 'K']);
  });

  it('exposes data-platform on the outer wrapper for e2e selectors', () => {
    const { container } = render(<Kbd combo="Cmd+K" platform="mac" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-platform')).toBe('mac');
  });

  it('detectPlatform returns a defined token (smoke check)', () => {
    const p = detectPlatform();
    expect(['mac', 'other']).toContain(p);
  });

  it('combo wins over keys when both are passed', () => {
    const { container } = render(
      <Kbd combo="Cmd+P" keys={['Ctrl', 'X']} platform="mac" />,
    );
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBe(2);
    expect(kbds[0]!.textContent).toBe('⌘');
    expect(kbds[1]!.textContent).toBe('P');
  });
});
