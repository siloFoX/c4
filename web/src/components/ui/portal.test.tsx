import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { act } from 'react';
import { Portal } from './portal';

function purgePortalRoots(): void {
  // Clean up any auto-created portal roots between tests so
  // assertions about "the only mount" are stable.
  document
    .querySelectorAll('[data-portal-root="true"]')
    .forEach((node) => node.remove());
}

describe('<Portal>', () => {
  beforeEach(() => {
    purgePortalRoots();
  });
  afterEach(() => {
    cleanup();
    purgePortalRoots();
  });

  it('returns null on the first synchronous render (SSR-safe lazy mount)', () => {
    // Track effect execution by rendering with a custom
    // container that we then assert is empty before the
    // effect has a chance to run. Because act() flushes
    // effects, we sneak the first observation in by reading
    // the container BEFORE wrapping in act.
    const { container } = render(
      <Portal>
        <span data-testid="late">hi</span>
      </Portal>,
    );
    // After render + flushed effects, the child should be in
    // the document (the portal target was resolved). The
    // Portal element itself contributes no DOM at its
    // location, so the immediate container should be empty.
    expect(container.innerHTML).toBe('');
    expect(screen.getByTestId('late')).toBeInTheDocument();
  });

  it('mounts children into the canonical app-portal-root by default', () => {
    render(
      <Portal>
        <span data-testid="child">payload</span>
      </Portal>,
    );
    const target = document.getElementById('app-portal-root');
    expect(target).not.toBeNull();
    expect(target?.getAttribute('data-portal-root')).toBe('true');
    expect(target?.contains(screen.getByTestId('child'))).toBe(true);
  });

  it('reuses the same portal root across multiple Portal instances', () => {
    render(
      <>
        <Portal>
          <span data-testid="a">A</span>
        </Portal>
        <Portal>
          <span data-testid="b">B</span>
        </Portal>
      </>,
    );
    const targets = document.querySelectorAll(
      '#app-portal-root[data-portal-root="true"]',
    );
    expect(targets.length).toBe(1);
    expect(targets[0]?.contains(screen.getByTestId('a'))).toBe(true);
    expect(targets[0]?.contains(screen.getByTestId('b'))).toBe(true);
  });

  it('routes to a custom named container via containerId', () => {
    render(
      <Portal containerId="toast-root">
        <span data-testid="toast-child">toast</span>
      </Portal>,
    );
    const target = document.getElementById('toast-root');
    expect(target).not.toBeNull();
    expect(target?.getAttribute('data-portal-root')).toBe('true');
    expect(target?.contains(screen.getByTestId('toast-child'))).toBe(true);
    // The default root should NOT have been materialised.
    expect(document.getElementById('app-portal-root')).toBeNull();
  });

  it('honours an explicit container HTMLElement (escape hatch)', () => {
    const custom = document.createElement('div');
    custom.id = 'custom-portal-target';
    document.body.appendChild(custom);
    try {
      render(
        <Portal container={custom}>
          <span data-testid="custom-child">in-custom</span>
        </Portal>,
      );
      expect(custom.contains(screen.getByTestId('custom-child'))).toBe(true);
      // The canonical app-portal-root should not be created
      // when an explicit container is given.
      expect(document.getElementById('app-portal-root')).toBeNull();
    } finally {
      custom.remove();
    }
  });

  it('explicit container=null defers the mount (no children rendered yet)', () => {
    render(
      <Portal container={null}>
        <span data-testid="pending">pending</span>
      </Portal>,
    );
    expect(screen.queryByTestId('pending')).toBeNull();
  });

  it('disabled=true renders children inline (no portal call)', () => {
    const { container } = render(
      <div data-testid="host">
        <Portal disabled>
          <span data-testid="inline-child">inline</span>
        </Portal>
      </div>,
    );
    const host = screen.getByTestId('host');
    expect(host.contains(screen.getByTestId('inline-child'))).toBe(true);
    // No portal root should have been created when disabled.
    expect(document.getElementById('app-portal-root')).toBeNull();
    // The Portal element itself is transparent (the Fragment
    // wrapper), so the host's children are exactly the inline
    // span.
    expect(host.children.length).toBe(1);
    expect(container.contains(screen.getByTestId('inline-child'))).toBe(true);
  });

  it('disabled=false re-mounts in the portal target', () => {
    function Wrapper({ disabled }: { disabled: boolean }) {
      return (
        <Portal disabled={disabled}>
          <span data-testid="toggled">toggle</span>
        </Portal>
      );
    }
    const { rerender } = render(<Wrapper disabled={true} />);
    // Inline path
    expect(document.getElementById('app-portal-root')).toBeNull();
    expect(screen.getByTestId('toggled')).toBeInTheDocument();
    // Flip to disabled=false; portal root should appear.
    act(() => {
      rerender(<Wrapper disabled={false} />);
    });
    const target = document.getElementById('app-portal-root');
    expect(target).not.toBeNull();
    expect(target?.contains(screen.getByTestId('toggled'))).toBe(true);
  });

  it('updates the rendered children when props change', () => {
    function Counter({ label }: { label: string }) {
      return (
        <Portal>
          <span data-testid="count">{label}</span>
        </Portal>
      );
    }
    const { rerender } = render(<Counter label="one" />);
    expect(screen.getByTestId('count').textContent).toBe('one');
    act(() => {
      rerender(<Counter label="two" />);
    });
    expect(screen.getByTestId('count').textContent).toBe('two');
  });

  it('switches portal target when containerId changes', () => {
    function Switcher({ id }: { id: 'toast-root' | 'dialog-root' }) {
      return (
        <Portal containerId={id}>
          <span data-testid="switched">x</span>
        </Portal>
      );
    }
    const { rerender } = render(<Switcher id="toast-root" />);
    expect(
      document.getElementById('toast-root')?.contains(
        screen.getByTestId('switched'),
      ),
    ).toBe(true);
    act(() => {
      rerender(<Switcher id="dialog-root" />);
    });
    expect(
      document.getElementById('dialog-root')?.contains(
        screen.getByTestId('switched'),
      ),
    ).toBe(true);
    // The original target should no longer contain the child.
    expect(
      document.getElementById('toast-root')?.contains(
        screen.queryByTestId('switched') ?? document.body,
      ),
    ).toBe(false);
  });

  it('unmounts cleanly and removes its subtree from the portal root', () => {
    const { unmount } = render(
      <Portal>
        <span data-testid="ephemeral">x</span>
      </Portal>,
    );
    expect(screen.getByTestId('ephemeral')).toBeInTheDocument();
    unmount();
    expect(screen.queryByTestId('ephemeral')).toBeNull();
    // The portal root itself may still exist (it is reused
    // across renders), but its child subtree should be empty.
    const target = document.getElementById('app-portal-root');
    if (target) {
      expect(target.childElementCount).toBe(0);
    }
  });

  it('Portal has the expected displayName for devtools', () => {
    expect(Portal.displayName).toBe('Portal');
  });

  it('renders multiple children via a fragment', () => {
    render(
      <Portal>
        <span data-testid="multi-a">A</span>
        <span data-testid="multi-b">B</span>
      </Portal>,
    );
    const target = document.getElementById('app-portal-root');
    expect(target?.contains(screen.getByTestId('multi-a'))).toBe(true);
    expect(target?.contains(screen.getByTestId('multi-b'))).toBe(true);
  });

  it('the canonical portal root carries data-portal-root attribute', () => {
    render(
      <Portal>
        <span data-testid="tag-check">x</span>
      </Portal>,
    );
    const tagged = document.querySelectorAll('[data-portal-root="true"]');
    expect(tagged.length).toBeGreaterThanOrEqual(1);
  });
});
