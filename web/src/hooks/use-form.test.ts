import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForm } from './use-form';
import { minLength, required } from '../lib/form-validation';

describe('useForm', () => {
  it('initial values populated; errors + touched empty', () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { name: '', age: 0 } }),
    );
    expect(result.current.values).toEqual({ name: '', age: 0 });
    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
  });

  it('setValue updates values', () => {
    const { result } = renderHook(() =>
      useForm({ initialValues: { name: '' } }),
    );
    act(() => result.current.setValue('name', 'Alice'));
    expect(result.current.values.name).toBe('Alice');
  });

  it('errors empty until touched or submit', () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: '' },
        validators: { name: required() },
      }),
    );
    expect(result.current.errors).toEqual({});
    expect(result.current.isValid).toBe(false);
  });

  it('setting touched then setValue populates / clears error per validator', () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: 'ab' },
        validators: { name: minLength(3) },
      }),
    );
    expect(result.current.errors.name).toBeUndefined();
    act(() => result.current.setTouched('name', true));
    expect(result.current.errors.name).toBeDefined();
    act(() => result.current.setValue('name', 'abcd'));
    expect(result.current.errors.name).toBeUndefined();
  });

  it('handleSubmit calls onSubmit when valid', () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: 'Alice' },
        validators: { name: required() },
        onSubmit,
      }),
    );
    act(() => result.current.handleSubmit());
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' });
  });

  it('handleSubmit does NOT call onSubmit when invalid; populates errors + touched all', () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: '', email: '' },
        validators: { name: required(), email: required('Email required') },
        onSubmit,
      }),
    );
    act(() => result.current.handleSubmit());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.name).toBeDefined();
    expect(result.current.errors.email).toBe('Email required');
    expect(result.current.touched.name).toBe(true);
    expect(result.current.touched.email).toBe(true);
  });

  it('isValid reflects validation state', () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: '' },
        validators: { name: required() },
      }),
    );
    expect(result.current.isValid).toBe(false);
    act(() => result.current.setValue('name', 'x'));
    expect(result.current.isValid).toBe(true);
  });

  it('reset restores initial values + clears errors/touched', () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues: { name: 'init' },
        validators: { name: required() },
      }),
    );
    act(() => result.current.setValue('name', 'changed'));
    act(() => result.current.setTouched('name', true));
    expect(result.current.values.name).toBe('changed');
    expect(result.current.touched.name).toBe(true);
    act(() => result.current.reset());
    expect(result.current.values.name).toBe('init');
    expect(result.current.touched.name).toBeUndefined();
    expect(result.current.errors.name).toBeUndefined();
  });

  it('handleSubmit calls e.preventDefault when given an event', () => {
    const preventDefault = vi.fn();
    const { result } = renderHook(() =>
      useForm({ initialValues: { name: 'a' } }),
    );
    act(() => result.current.handleSubmit({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
  });
});
