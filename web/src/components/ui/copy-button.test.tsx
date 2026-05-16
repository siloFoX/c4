import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton } from './copy-button';

// Stub navigator.clipboard with a configurable writeText so the
// test can flip between success + failure paths.
let writeTextMock: ReturnType<typeof vi.fn>;

function installClipboard(ok: boolean = true) {
  if (ok) {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
  } else {
    writeTextMock = vi.fn().mockRejectedValue(new Error('denied'));
  }
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText: writeTextMock },
  });
}

beforeEach(() => {
  installClipboard(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('<CopyButton>', () => {
  it('renders an icon-only IconButton with aria-label "Copy <label>"', () => {
    render(<CopyButton value="abc-123" label="session id" />);
    expect(
      screen.getByRole('button', { name: 'Copy session id' }),
    ).toBeInTheDocument();
  });

  it('default label is "value" -> aria-label "Copy value"', () => {
    render(<CopyButton value="x" />);
    expect(
      screen.getByRole('button', { name: 'Copy value' }),
    ).toBeInTheDocument();
  });

  it('icon-only render shows the Copy glyph by default', () => {
    const { container } = render(<CopyButton value="x" />);
    expect(
      container.querySelector('[data-copy-button-glyph="copy"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-copy-button-glyph="check"]'),
    ).toBeNull();
  });

  it('icon+label render shows both glyph + visible "Copy <label>" text', () => {
    render(
      <CopyButton value="x" variant="icon+label" label="ID" />,
    );
    // The visible body label and the tooltip text both read
    // "Copy ID", so we address the button-body span via the
    // accessible button role rather than getByText (which would
    // match multiple nodes).
    const btn = screen.getByRole('button', { name: 'Copy ID' });
    expect(btn.textContent).toContain('Copy ID');
  });

  it('icon+label render accepts custom children', () => {
    render(
      <CopyButton value="x" variant="icon+label" label="ID">
        Copy this!
      </CopyButton>,
    );
    expect(screen.getByText('Copy this!')).toBeInTheDocument();
  });

  it('exposes data-section + data-variant + data-size on the trigger', () => {
    const { container } = render(<CopyButton value="x" size="sm" />);
    const btn = container.querySelector('[data-section="copy-button"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-variant')).toBe('icon-only');
    expect(btn!.getAttribute('data-size')).toBe('sm');
  });

  it('clicking fires the copy flow (flips data-copied + invokes onCopy)', async () => {
    // Asserts the user-facing observable contract rather than
    // poking the underlying navigator.clipboard spy -- jsdom's
    // global clipboard property is touched by multiple test
    // files, and defineProperty races make a direct spy
    // assertion flaky. The onCopy callback runs only after a
    // successful clipboard write, so it covers the same path.
    const onCopy = vi.fn();
    const user = userEvent.setup();
    render(<CopyButton value="abc-123" label="id" onCopy={onCopy} />);
    await user.click(screen.getByRole('button', { name: 'Copy id' }));
    await waitFor(() => expect(onCopy).toHaveBeenCalledWith('abc-123'));
  });

  it('flips data-copied to "true" after a successful write', async () => {
    const user = userEvent.setup();
    render(<CopyButton value="x" />);
    const btn = screen.getByRole('button', { name: 'Copy value' });
    await user.click(btn);
    await waitFor(() =>
      expect(btn.getAttribute('data-copied')).toBe('true'),
    );
  });

  it('swaps the Copy glyph for a Check glyph during the pulse window', async () => {
    const user = userEvent.setup();
    const { container } = render(<CopyButton value="x" />);
    await user.click(screen.getByRole('button', { name: 'Copy value' }));
    await waitFor(() => {
      expect(
        container.querySelector('[data-copy-button-glyph="check"]'),
      ).not.toBeNull();
    });
  });

  it('aria-label changes to "Copied <label>" during the pulse window', async () => {
    const user = userEvent.setup();
    render(<CopyButton value="x" label="ID" />);
    await user.click(screen.getByRole('button', { name: 'Copy ID' }));
    // After the click, the button's accessible name flips.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Copied ID' }),
      ).toBeInTheDocument();
    });
  });

  it('reverts to Copy glyph after the pulse timeout elapses', async () => {
    // Real timers + a long pulseMs so we can explicitly wait
    // for the revert without fighting jest's fake-timer +
    // userEvent + Promise interaction.
    const user = userEvent.setup();
    const { container } = render(
      <CopyButton value="x" pulseMs={150} />,
    );
    await user.click(screen.getByRole('button', { name: 'Copy value' }));
    await waitFor(() => {
      expect(
        container.querySelector('[data-copy-button-glyph="check"]'),
      ).not.toBeNull();
    });
    // Wait for the natural setTimeout to fire.
    await waitFor(
      () => {
        expect(
          container.querySelector('[data-copy-button-glyph="check"]'),
        ).toBeNull();
        expect(
          container.querySelector('[data-copy-button-glyph="copy"]'),
        ).not.toBeNull();
      },
      { timeout: 2000 },
    );
  });

  it('fires onCopy with the value on success', async () => {
    const onCopy = vi.fn();
    const user = userEvent.setup();
    render(<CopyButton value="abc-123" onCopy={onCopy} />);
    await user.click(screen.getByRole('button', { name: 'Copy value' }));
    await waitFor(() => expect(onCopy).toHaveBeenCalledWith('abc-123'));
  });

  it('fires showToast with the success message + "success" tone', async () => {
    const showToast = vi.fn();
    const user = userEvent.setup();
    render(<CopyButton value="x" label="thing" showToast={showToast} />);
    await user.click(screen.getByRole('button', { name: 'Copy thing' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Copied thing', 'success'),
    );
  });

  // (v1.11.285) Failure-path coverage lives in
  // `lib/clipboard.ts`'s own unit tests, which can mock the
  // entire pipeline (clipboard + execCommand fallback) without
  // the jsdom races that bite a high-level component test.
  // The CopyButton primitive itself just relays the
  // copyTextToClipboardWithError result, so the wire-through is
  // observable via onError -- but exercising that path requires
  // BOTH `navigator.clipboard.writeText` AND the
  // `document.execCommand` fallback to fail, and jsdom does not
  // reliably expose execCommand stubs through the textarea
  // fallback. Document this gap rather than ship a flaky test.

  it('disabled prop prevents the click handler from firing', async () => {
    const onCopy = vi.fn();
    const user = userEvent.setup();
    render(
      <CopyButton value="x" onCopy={onCopy} disabled />,
    );
    await user.click(screen.getByRole('button', { name: 'Copy value' }));
    expect(onCopy).not.toHaveBeenCalled();
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('size="sm" applies the smaller button + glyph dimensions', () => {
    const { container } = render(<CopyButton value="x" size="sm" />);
    const btn = container.querySelector('[data-section="copy-button"]');
    expect(btn!.className).toContain('h-6');
    const glyph = container.querySelector('[data-copy-button-glyph]');
    expect(glyph!.getAttribute('class')).toContain('h-3');
  });

  it('size="md" applies the default button dimensions', () => {
    const { container } = render(<CopyButton value="x" />);
    const btn = container.querySelector('[data-section="copy-button"]');
    expect(btn!.className).toContain('h-7');
  });

  it('icon+label variant carries the same data-* attrs', () => {
    const { container } = render(
      <CopyButton value="x" variant="icon+label" label="ID" />,
    );
    const btn = container.querySelector('[data-section="copy-button"]');
    expect(btn!.getAttribute('data-variant')).toBe('icon+label');
  });

  it('icon+label flips its visible body text from "Copy <label>" to "Copied!" after click', async () => {
    // The same string also appears in the tooltip body, so we
    // address the visible body via the button role's
    // textContent instead of a global getByText (which would
    // match the tooltip too).
    const user = userEvent.setup();
    render(<CopyButton value="x" variant="icon+label" label="ID" />);
    const btn = screen.getByRole('button', { name: 'Copy ID' });
    expect(btn.textContent).toContain('Copy ID');
    await user.click(btn);
    await waitFor(() => {
      // After the click the button's aria-label flips to
      // "Copied ID" and the body text reads "Copied!".
      const flipped = screen.getByRole('button', { name: 'Copied ID' });
      expect(flipped.textContent).toContain('Copied!');
    });
  });

  it('merges caller className', () => {
    const { container } = render(
      <CopyButton value="x" className="custom-cb" />,
    );
    const btn = container.querySelector('[data-section="copy-button"]');
    expect(btn!.className).toContain('custom-cb');
  });

  it('forwards data-testid to the trigger', () => {
    render(<CopyButton value="x" data-testid="my-cb" />);
    expect(screen.getByTestId('my-cb')).toBeInTheDocument();
  });

  it('forwards a ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<CopyButton value="x" ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('clearing the pulse timer on unmount does not throw', async () => {
    // Real-timer variant: click then unmount before the pulse
    // window elapses; the cleanup useEffect should clear the
    // pending setTimeout so the now-unmounted state setter
    // never runs. Test passes simply by not throwing.
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const { unmount } = render(
      <CopyButton value="x" pulseMs={5000} onCopy={onCopy} />,
    );
    await user.click(screen.getByRole('button', { name: 'Copy value' }));
    await waitFor(() => expect(onCopy).toHaveBeenCalled());
    expect(() => unmount()).not.toThrow();
  });
});
