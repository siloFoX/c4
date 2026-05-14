import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// (11.174) SpecialistsTagEditor was migrated to <TagInput>. The
// editor no longer leans on the use-specialist-tag-editor hook
// (its CSV +/- prefix semantics do not map onto a tag-array UI),
// so apiPatch is mocked directly. Tests focus on the JSX wiring:
// view vs edit branch, button label flip, chip dismiss, Apply
// gating, and the PATCH payload shape.

const apiPatchMock = vi.fn().mockResolvedValue({});

vi.mock('../lib/api', () => ({
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
}));

import SpecialistsTagEditor from './SpecialistsTagEditor';

beforeEach(() => {
  setLocale('en');
  apiPatchMock.mockReset();
  apiPatchMock.mockResolvedValue({});
});

function renderEditor(
  overrides: Partial<Parameters<typeof SpecialistsTagEditor>[0]> = {},
) {
  const onSaved = vi.fn();
  const onError = vi.fn();
  const props = {
    specialistId: 'arch-1',
    tags: ['core', 'design'] as string[] | undefined,
    onSaved,
    onError,
    ...overrides,
  };
  const utils = render(<SpecialistsTagEditor {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onSaved, onError, props };
}

describe('<SpecialistsTagEditor>', () => {
  it('renders the tags label', () => {
    renderEditor();
    expect(screen.getByText('tags')).toBeInTheDocument();
  });

  it('renders the Edit button in the view branch', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('renders all provided tags as chips in the view branch', () => {
    renderEditor();
    expect(screen.getByText('#core')).toBeInTheDocument();
    expect(screen.getByText('#design')).toBeInTheDocument();
  });

  it('renders the empty-tags placeholder when tags is undefined', () => {
    renderEditor({ tags: undefined });
    expect(screen.getByText('no tags')).toBeInTheDocument();
  });

  it('renders the empty-tags placeholder when tags is an empty array', () => {
    renderEditor({ tags: [] });
    expect(screen.getByText('no tags')).toBeInTheDocument();
  });

  it('switches to the edit branch when Edit is clicked', async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Edit tags' })).toBeInTheDocument();
  });

  it('pre-populates the TagInput with the current tags on open', async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const group = screen.getByRole('group', { name: 'Edit tags' });
    expect(group).toHaveTextContent('core');
    expect(group).toHaveTextContent('design');
  });

  it('closes the edit branch when Cancel is clicked', async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Edit tags' })).not.toBeInTheDocument();
  });

  it('disables Apply when there are no tags in the editor', async () => {
    const { user } = renderEditor({ tags: [] });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('PATCHes the specialist tags with mode=replace on Apply', async () => {
    const { user, onSaved } = renderEditor({ specialistId: 'sec-7' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(apiPatchMock).toHaveBeenCalledWith(
      '/api/specialists/sec-7/tags',
      { tags: ['core', 'design'], mode: 'replace' },
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('calls onError when the PATCH rejects', async () => {
    apiPatchMock.mockRejectedValueOnce(new Error('boom'));
    const { user, onError, onSaved } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('removes a tag from the editor when its dismiss button is clicked', async () => {
    const { user } = renderEditor();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByLabelText('Remove core'));
    const group = screen.getByRole('group', { name: 'Edit tags' });
    expect(group).not.toHaveTextContent('core');
    expect(group).toHaveTextContent('design');
  });

  it('adds a new tag via Enter inside the editor', async () => {
    const { user } = renderEditor({ tags: [] });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('fresh{Enter}');
    expect(screen.getByRole('group', { name: 'Edit tags' })).toHaveTextContent('fresh');
  });

  it('renders translated copy when the locale flips to ko', () => {
    renderEditor();
    expect(screen.getByText('tags')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('tags')).not.toBeInTheDocument();
  });

  it('flips the toggle button label when open transitions false -> true', async () => {
    const { user } = renderEditor();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
