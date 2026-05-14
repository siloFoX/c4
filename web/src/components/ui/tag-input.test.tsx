import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagInput } from './tag-input';

function Controlled(props: {
  initial?: string[];
  normalize?: (raw: string) => string;
  dedupe?: boolean;
  maxTags?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  onChange?: (next: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(props.initial ?? []);
  return (
    <TagInput
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      normalize={props.normalize}
      dedupe={props.dedupe}
      maxTags={props.maxTags}
      disabled={props.disabled}
      ariaLabel={props.ariaLabel}
      className={props.className}
      inputClassName={props.inputClassName}
      placeholder={props.placeholder}
    />
  );
}

describe('<TagInput>', () => {
  it('renders existing tags as chips', () => {
    render(<Controlled initial={['alpha', 'beta']} ariaLabel="tags" />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('Enter adds a new tag', async () => {
    const user = userEvent.setup();
    render(<Controlled ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('new-tag{Enter}');
    expect(screen.getByText('new-tag')).toBeInTheDocument();
  });

  it('Comma separator adds a new tag', async () => {
    const user = userEvent.setup();
    render(<Controlled ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'foo,');
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('Backspace on empty input removes last tag', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['x', 'y']} ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(screen.queryByText('y')).not.toBeInTheDocument();
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('Backspace on non-empty input does not remove a tag', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['keep']} ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'abc');
    await user.keyboard('{Backspace}');
    expect(screen.getByText('keep')).toBeInTheDocument();
    expect(input.value).toBe('ab');
  });

  it('click chip enters edit mode (input replaces chip)', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['target']} ariaLabel="tags" />);
    await user.click(screen.getByText('target'));
    expect(screen.queryByText('target')).not.toBeInTheDocument();
    const edit = screen.getByLabelText('Edit tag') as HTMLInputElement;
    expect(edit.value).toBe('target');
  });

  it('edit mode Enter commits the change', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['old']} ariaLabel="tags" />);
    await user.click(screen.getByText('old'));
    const edit = screen.getByLabelText('Edit tag') as HTMLInputElement;
    await user.clear(edit);
    await user.type(edit, 'new');
    await user.keyboard('{Enter}');
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('edit mode Escape cancels', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['keep']} ariaLabel="tags" />);
    await user.click(screen.getByText('keep'));
    const edit = screen.getByLabelText('Edit tag') as HTMLInputElement;
    await user.clear(edit);
    await user.type(edit, 'changed');
    await user.keyboard('{Escape}');
    expect(screen.getByText('keep')).toBeInTheDocument();
    expect(screen.queryByText('changed')).not.toBeInTheDocument();
  });

  it('paste CSV adds multiple tags', async () => {
    const user = userEvent.setup();
    render(<Controlled ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.paste('one,two,three');
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
  });

  it('dedupe rejects duplicates (normalize lowercase)', async () => {
    const user = userEvent.setup();
    const normalize = (raw: string) => raw.trim().toLowerCase();
    render(<Controlled initial={['foo']} normalize={normalize} ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'Foo{Enter}');
    expect(screen.getAllByText('foo')).toHaveLength(1);
  });

  it('maxTags caps additions', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['a', 'b']} maxTags={2} ariaLabel="tags" />);
    expect(screen.queryByLabelText('Add tag')).not.toBeInTheDocument();
  });

  it('disabled hides input and chips have no dismiss button', () => {
    render(<Controlled initial={['x']} disabled ariaLabel="tags" />);
    expect(screen.queryByLabelText('Add tag')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove x')).not.toBeInTheDocument();
  });

  it('chip dismiss button removes the tag', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={['gone', 'stay']} ariaLabel="tags" />);
    await user.click(screen.getByLabelText('Remove gone'));
    expect(screen.queryByText('gone')).not.toBeInTheDocument();
    expect(screen.getByText('stay')).toBeInTheDocument();
  });

  it('className merges on the wrapper', () => {
    render(<Controlled className="custom-wrap" ariaLabel="tags" />);
    const wrap = screen.getByRole('group', { name: 'tags' });
    expect(wrap.className).toContain('custom-wrap');
  });

  it('ariaLabel is applied to the wrapper', () => {
    render(<Controlled ariaLabel="my-tags" />);
    expect(screen.getByRole('group', { name: 'my-tags' })).toBeInTheDocument();
  });

  it('onChange fires with the new tag list', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled onChange={spy} ariaLabel="tags" />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('hello{Enter}');
    expect(spy).toHaveBeenLastCalledWith(['hello']);
  });
});
