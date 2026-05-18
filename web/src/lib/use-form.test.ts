import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useForm } from './use-form';
import { compose, required } from './form-validation';

interface LoginForm {
  username: string;
  password: string;
}

describe('useForm', () => {
  function loginOptions(): Parameters<typeof useForm<LoginForm>>[0] {
    return {
      initialValues: { username: '', password: '' },
      schema: {
        username: required(),
        password: compose(required()),
      },
    };
  }

  it('initialises values + empty errors + untouched fields', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    expect(result.current.values).toEqual({ username: '', password: '' });
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({ username: false, password: false });
    expect(result.current.isValid).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('setValue updates the value and skips validation when not touched', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    act(() => result.current.setValue('username', 'alice'));
    expect(result.current.values.username).toBe('alice');
    expect(result.current.errors.username).toBeUndefined();
  });

  it('setValue validates when validateOnChange + field is already touched', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    act(() => result.current.setTouched('username', true));
    act(() => result.current.setValue('username', ''));
    expect(result.current.errors.username).toBe('Required');
    act(() => result.current.setValue('username', 'bob'));
    expect(result.current.errors.username).toBeUndefined();
  });

  it('field().onBlur sets touched and validates by default', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    act(() => result.current.field('username').onBlur());
    expect(result.current.touched.username).toBe(true);
    expect(result.current.errors.username).toBe('Required');
  });

  it('validate() returns errors and updates state', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    let snapshot: ReturnType<typeof result.current.validate> | null = null;
    act(() => {
      snapshot = result.current.validate();
    });
    expect(snapshot).toEqual({
      username: 'Required',
      password: 'Required',
    });
    expect(result.current.errors).toEqual({
      username: 'Required',
      password: 'Required',
    });
    expect(result.current.isValid).toBe(false);
  });

  it('validateAsync() resolves with the full error map', async () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    const errs = await act(() => result.current.validateAsync());
    expect(errs).toEqual({
      username: 'Required',
      password: 'Required',
    });
  });

  it('setError + setErrors override the state directly', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    act(() => result.current.setError('username', 'Custom'));
    expect(result.current.errors.username).toBe('Custom');
    act(() => result.current.setErrors({ password: 'p' }));
    expect(result.current.errors.password).toBe('p');
    expect(result.current.errors.username).toBeUndefined();
  });

  it('reset() restores initial values (or override) + clears errors + clears touched', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    act(() => result.current.setValue('username', 'x'));
    act(() => result.current.setError('username', 'boom'));
    act(() => result.current.setTouched('username', true));
    act(() => result.current.reset());
    expect(result.current.values).toEqual({ username: '', password: '' });
    expect(result.current.errors).toEqual({});
    expect(result.current.touched.username).toBe(false);

    act(() => result.current.reset({ username: 'override', password: 'p' }));
    expect(result.current.values).toEqual({ username: 'override', password: 'p' });
  });

  it('handleSubmit calls onValid with the values when validation passes', async () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    act(() => result.current.setValue('username', 'a'));
    act(() => result.current.setValue('password', 'p'));
    const onValid = vi.fn();
    await act(async () => {
      await result.current.handleSubmit(onValid)({ preventDefault: () => {} });
    });
    expect(onValid).toHaveBeenCalledWith({ username: 'a', password: 'p' });
  });

  it('handleSubmit calls onInvalid + skips onValid when validation fails', async () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    await act(async () => {
      await result.current.handleSubmit(onValid, onInvalid)();
    });
    expect(onValid).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalled();
    expect(result.current.touched.username).toBe(true);
    expect(result.current.touched.password).toBe(true);
  });

  it('handleSubmit awaits async validators', async () => {
    interface SignupForm {
      user: string;
    }
    const asyncValidate = vi.fn(async (v: string) =>
      v === 'taken' ? { error: 'Username taken' } : {},
    );
    const { result } = renderHook(() =>
      useForm<SignupForm>({
        initialValues: { user: 'taken' },
        schema: { user: asyncValidate },
      }),
    );
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    await act(async () => {
      await result.current.handleSubmit(onValid, onInvalid)();
    });
    expect(asyncValidate).toHaveBeenCalledWith('taken');
    expect(onValid).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith({ user: 'Username taken' });
  });

  it('field() returns bundled ARIA props that flip on error', () => {
    const { result } = renderHook(() => useForm<LoginForm>(loginOptions()));
    let handle = result.current.field('username');
    expect(handle.props).toEqual({});
    expect(handle.errorClass).toBe('');
    act(() => result.current.setError('username', 'Required'));
    handle = result.current.field('username');
    expect(handle.props['aria-invalid']).toBe(true);
    expect(handle.props['aria-describedby']).toBe(handle.errorId);
    expect(handle.errorClass).toContain('border-destructive');
  });

  it('field() ids are stable per name across renders', () => {
    const { result, rerender } = renderHook(() =>
      useForm<LoginForm>(loginOptions()),
    );
    const idA = result.current.field('username').id;
    rerender();
    const idB = result.current.field('username').id;
    expect(idA).toBe(idB);
    expect(result.current.field('password').id).not.toBe(idA);
  });
});
