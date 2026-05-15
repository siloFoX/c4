import { describe, it, expect, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from './use-confirm';

// Tiny harness: exposes the most recent `confirm()` promise as a
// resolved value (or 'pending') so each test can assert what the
// hook handed back without juggling refs in every case.
interface HarnessApi {
  open: (opts: Parameters<ReturnType<typeof useConfirm>>[0]) => Promise<boolean>;
}

function Harness({ apiRef }: { apiRef: { current: HarnessApi | null } }) {
  const confirm = useConfirm();
  const [last, setLast] = useState<string>('idle');
  useEffect(() => {
    apiRef.current = {
      open: (opts) => {
        const p = confirm(opts);
        setLast('pending');
        p.then((v) => setLast(v ? 'true' : 'false'));
        return p;
      },
    };
  }, [confirm, apiRef]);
  return <div data-testid="last">{last}</div>;
}

function renderHarness() {
  const apiRef: { current: HarnessApi | null } = { current: null };
  const utils = render(
    <ConfirmProvider>
      <Harness apiRef={apiRef} />
    </ConfirmProvider>,
  );
  return { apiRef, ...utils };
}

describe('useConfirm()', () => {
  it('opens a Dialog with the given title and message', async () => {
    const { apiRef } = renderHarness();
    await act(async () => {
      apiRef.current!.open({ title: 'Delete worker', message: 'This is permanent.' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete worker')).toBeInTheDocument();
    expect(screen.getByText('This is permanent.')).toBeInTheDocument();
  });

  it('resolves true when the Confirm button is clicked', async () => {
    const { apiRef } = renderHarness();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = apiRef.current!.open({ title: 'Proceed?' });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-ok'));
    });
    await expect(pending).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when the Cancel button is clicked', async () => {
    const { apiRef } = renderHarness();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = apiRef.current!.open({ title: 'Proceed?' });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-cancel'));
    });
    await expect(pending).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when Escape is pressed', async () => {
    const { apiRef } = renderHarness();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = apiRef.current!.open({ title: 'Proceed?' });
    });
    // useFocusTrap inside Dialog wires the Escape -> onClose path.
    await act(async () => {
      const user = userEvent.setup();
      await user.keyboard('{Escape}');
    });
    await expect(pending).resolves.toBe(false);
  });

  it('resolves false when the backdrop is clicked', async () => {
    const { apiRef } = renderHarness();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = apiRef.current!.open({ title: 'Proceed?' });
    });
    const backdrop = document.querySelector('[data-dialog-backdrop]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    await act(async () => {
      fireEvent.click(backdrop);
    });
    await expect(pending).resolves.toBe(false);
  });

  it('applies the destructive Button variant when tone="destructive"', async () => {
    const { apiRef } = renderHarness();
    await act(async () => {
      apiRef.current!.open({ title: 'Delete', tone: 'destructive' });
    });
    const ok = screen.getByTestId('confirm-ok');
    expect(ok.className).toContain('bg-destructive');
  });

  it('uses the default Button variant when tone is omitted', async () => {
    const { apiRef } = renderHarness();
    await act(async () => {
      apiRef.current!.open({ title: 'Continue' });
    });
    const ok = screen.getByTestId('confirm-ok');
    expect(ok.className).toContain('bg-primary');
    expect(ok.className).not.toContain('bg-destructive');
  });

  it('honours custom confirmLabel and cancelLabel', async () => {
    const { apiRef } = renderHarness();
    await act(async () => {
      apiRef.current!.open({
        title: 'Discard?',
        confirmLabel: 'Throw away',
        cancelLabel: 'Keep',
      });
    });
    expect(screen.getByTestId('confirm-ok')).toHaveTextContent('Throw away');
    expect(screen.getByTestId('confirm-cancel')).toHaveTextContent('Keep');
  });

  it('last-wins on concurrent confirms: the prior promise resolves false, the new one becomes active', async () => {
    const { apiRef } = renderHarness();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = apiRef.current!.open({ title: 'First' });
    });
    await act(async () => {
      second = apiRef.current!.open({ title: 'Second' });
    });
    // First is settled false right away; second stays pending.
    await expect(first).resolves.toBe(false);
    expect(screen.getByText('Second')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('confirm-ok'));
    });
    await expect(second).resolves.toBe(true);
  });

  it('resolves the promise exactly once even if confirm is clicked repeatedly', async () => {
    const { apiRef } = renderHarness();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = apiRef.current!.open({ title: 'Once only' });
    });
    const observer = vi.fn();
    pending.then(observer);
    const ok = screen.getByTestId('confirm-ok');
    await act(async () => {
      fireEvent.click(ok);
      // Subsequent clicks should be no-ops because the dialog is gone.
      // We also fire a Cancel click on the (already-unmounted) node.
    });
    await act(async () => {
      // Flush microtasks so the .then handler runs.
      await Promise.resolve();
    });
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves any pending promise as false when the provider unmounts', async () => {
    const { apiRef, unmount } = renderHarness();
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = apiRef.current!.open({ title: 'Goodbye' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      unmount();
    });
    await expect(pending).resolves.toBe(false);
  });

  it('throws when useConfirm() is called outside of a <ConfirmProvider>', () => {
    function Bare() {
      useConfirm();
      return null;
    }
    // Silence React's error log for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/ConfirmProvider/);
    spy.mockRestore();
    cleanup();
  });
});
