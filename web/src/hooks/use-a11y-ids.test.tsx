import { afterEach, describe, it, expect } from 'vitest';
import { render, cleanup, renderHook } from '@testing-library/react';
import { useA11yIds } from './use-a11y-ids';

describe('useA11yIds', () => {
  afterEach(() => cleanup());

  it('returns a stable controlId from React useId when no id is provided', () => {
    const { result, rerender } = renderHook(() => useA11yIds());
    const first = result.current.controlId;
    expect(first).toBeTruthy();
    rerender();
    expect(result.current.controlId).toBe(first);
  });

  it('honours an explicit caller-provided id', () => {
    const { result } = renderHook(() => useA11yIds({ id: 'my-field' }));
    expect(result.current.controlId).toBe('my-field');
    expect(result.current.labelId).toBe('my-field-label');
    expect(result.current.helperId).toBe('my-field-helper');
    expect(result.current.warningId).toBe('my-field-warning');
    expect(result.current.errorId).toBe('my-field-error');
  });

  it('derives all four ids using the same prefix', () => {
    const { result } = renderHook(() => useA11yIds({ id: 'addr' }));
    expect(result.current.labelId.startsWith('addr')).toBe(true);
    expect(result.current.helperId.startsWith('addr')).toBe(true);
    expect(result.current.warningId.startsWith('addr')).toBe(true);
    expect(result.current.errorId.startsWith('addr')).toBe(true);
  });

  it('omits aria-describedby when no message slot is active', () => {
    const { result } = renderHook(() => useA11yIds({ id: 'x' }));
    expect(result.current.ariaDescribedBy).toBeUndefined();
  });

  it('includes only the helper id when only helper is active', () => {
    const { result } = renderHook(() =>
      useA11yIds({ id: 'x', helper: 'hint text' }),
    );
    expect(result.current.ariaDescribedBy).toBe('x-helper');
    expect(result.current.state).toBe('ok');
    expect(result.current.ariaInvalid).toBeUndefined();
  });

  it('includes warning id and sets state=warning', () => {
    const { result } = renderHook(() =>
      useA11yIds({ id: 'x', warning: 'careful' }),
    );
    expect(result.current.ariaDescribedBy).toBe('x-warning');
    expect(result.current.state).toBe('warning');
    expect(result.current.ariaInvalid).toBeUndefined();
  });

  it('includes error id, sets state=error, sets ariaInvalid=true', () => {
    const { result } = renderHook(() =>
      useA11yIds({ id: 'x', error: 'bad' }),
    );
    expect(result.current.ariaDescribedBy).toBe('x-error');
    expect(result.current.state).toBe('error');
    expect(result.current.ariaInvalid).toBe(true);
  });

  it('includes helper + error together when both are present (precedence)', () => {
    const { result } = renderHook(() =>
      useA11yIds({ id: 'x', helper: 'h', error: 'e' }),
    );
    // Helper survives independently; error flips state to error.
    expect(result.current.ariaDescribedBy).toBe('x-helper x-error');
    expect(result.current.state).toBe('error');
    expect(result.current.ariaInvalid).toBe(true);
  });

  it('precedence error > warning > ok', () => {
    const { result: errAndWarn } = renderHook(() =>
      useA11yIds({ id: 'x', warning: 'w', error: 'e' }),
    );
    expect(errAndWarn.current.state).toBe('error');
    expect(errAndWarn.current.ariaDescribedBy).toBe('x-warning x-error');

    const { result: warnOnly } = renderHook(() =>
      useA11yIds({ id: 'x', warning: 'w' }),
    );
    expect(warnOnly.current.state).toBe('warning');

    const { result: okOnly } = renderHook(() =>
      useA11yIds({ id: 'x' }),
    );
    expect(okOnly.current.state).toBe('ok');
  });

  it('treats empty string and false as no-message', () => {
    const { result: emptyStr } = renderHook(() =>
      useA11yIds({ id: 'x', helper: '', warning: '', error: '' }),
    );
    expect(emptyStr.current.ariaDescribedBy).toBeUndefined();
    expect(emptyStr.current.state).toBe('ok');

    const { result: falses } = renderHook(() =>
      useA11yIds({ id: 'x', helper: false, warning: false, error: false }),
    );
    expect(falses.current.ariaDescribedBy).toBeUndefined();
    expect(falses.current.state).toBe('ok');

    const { result: nulls } = renderHook(() =>
      useA11yIds({ id: 'x', helper: null, warning: null, error: null }),
    );
    expect(nulls.current.ariaDescribedBy).toBeUndefined();
  });

  it('merges upstream describedBy with derived ids', () => {
    const { result } = renderHook(() =>
      useA11yIds({
        id: 'x',
        describedBy: 'tooltip-1',
        helper: 'h',
        error: 'e',
      }),
    );
    expect(result.current.ariaDescribedBy).toBe('tooltip-1 x-helper x-error');
  });

  it('upstream describedBy alone is preserved when no slots are active', () => {
    const { result } = renderHook(() =>
      useA11yIds({ id: 'x', describedBy: 'tooltip-1' }),
    );
    expect(result.current.ariaDescribedBy).toBe('tooltip-1');
  });

  it('memoises the result -- repeat renders without input change return same object', () => {
    const { result, rerender } = renderHook(
      (props: { id: string; helper: string }) => useA11yIds(props),
      { initialProps: { id: 'x', helper: 'h' } },
    );
    const first = result.current;
    rerender({ id: 'x', helper: 'h' });
    expect(result.current).toBe(first);
  });

  it('returns a new object when inputs change', () => {
    const { result, rerender } = renderHook(
      (props: { id: string; helper?: string; error?: string }) =>
        useA11yIds(props),
      { initialProps: { id: 'x', helper: 'h' } },
    );
    const first = result.current;
    rerender({ id: 'x', error: 'e' });
    expect(result.current).not.toBe(first);
    expect(result.current.state).toBe('error');
  });

  it('truthy boolean true counts as an active slot', () => {
    const { result } = renderHook(() =>
      useA11yIds({ id: 'x', error: true }),
    );
    expect(result.current.ariaDescribedBy).toBe('x-error');
    expect(result.current.ariaInvalid).toBe(true);
  });

  it('useId fallback yields unique ids across hook instances', () => {
    let firstId = '';
    let secondId = '';
    function ProbeOne() {
      const { controlId } = useA11yIds();
      firstId = controlId;
      return null;
    }
    function ProbeTwo() {
      const { controlId } = useA11yIds();
      secondId = controlId;
      return null;
    }
    render(
      <>
        <ProbeOne />
        <ProbeTwo />
      </>,
    );
    expect(firstId).not.toBe('');
    expect(secondId).not.toBe('');
    expect(firstId).not.toBe(secondId);
  });

  it('label/helper/warning/error suffix shape is the documented contract', () => {
    const { result } = renderHook(() => useA11yIds({ id: 'foo' }));
    expect(result.current.labelId).toBe('foo-label');
    expect(result.current.helperId).toBe('foo-helper');
    expect(result.current.warningId).toBe('foo-warning');
    expect(result.current.errorId).toBe('foo-error');
  });
});
