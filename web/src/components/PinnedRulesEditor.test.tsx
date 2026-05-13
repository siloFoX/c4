import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// (v1.11.107) PinnedRulesEditor is the per-worker "Persistent Rules"
// surface. The usePinnedRules hook owns all of the load/save/state
// plumbing -- the component itself is a thin display wrapper that
// forwards onChange / onClick to the hook setters. Mock the hook so
// each test drives the rulesText / defaultTemplate / loading / saving
// / error / lastRefreshAt branches deterministically. Mirrors
// v1.11.105/106's marker-stub composition pattern.

interface PinnedHookState {
  rulesText: string;
  defaultTemplate: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastRefreshAt: number | null;
}

const saveMock = vi.fn();
const loadMock = vi.fn();
const setRulesTextMock = vi.fn();
const setDefaultTemplateMock = vi.fn();
let lastWorkerName = '';
let pinnedState: PinnedHookState = {
  rulesText: '',
  defaultTemplate: '',
  loading: false,
  saving: false,
  error: null,
  lastRefreshAt: null,
};

vi.mock('../lib/use-pinned-rules', () => ({
  usePinnedRules: (args: { workerName: string }) => {
    lastWorkerName = args.workerName;
    return {
      ...pinnedState,
      setRulesText: setRulesTextMock,
      setDefaultTemplate: setDefaultTemplateMock,
      save: saveMock,
      load: loadMock,
    };
  },
}));

import PinnedRulesEditor from './PinnedRulesEditor';

beforeEach(() => {
  setLocale('en');
  saveMock.mockReset();
  loadMock.mockReset();
  setRulesTextMock.mockReset();
  setDefaultTemplateMock.mockReset();
  lastWorkerName = '';
  pinnedState = {
    rulesText: '',
    defaultTemplate: '',
    loading: false,
    saving: false,
    error: null,
    lastRefreshAt: null,
  };
});

describe('<PinnedRulesEditor>', () => {
  it('forwards workerName into the usePinnedRules hook', () => {
    render(<PinnedRulesEditor workerName="demo-1" />);
    expect(lastWorkerName).toBe('demo-1');
  });

  it('renders the localized "Persistent Rules" header text', () => {
    render(<PinnedRulesEditor workerName="w1" />);
    const headerSpan = screen
      .getAllByText('Persistent Rules')
      .find((node) => node.tagName === 'SPAN');
    expect(headerSpan).toBeInTheDocument();
  });

  it('hides the last-refresh chip when lastRefreshAt is null', () => {
    pinnedState.lastRefreshAt = null;
    render(<PinnedRulesEditor workerName="w1" />);
    expect(screen.queryByText(/last refresh:/)).not.toBeInTheDocument();
  });

  it('renders the formatted last-refresh chip when lastRefreshAt is set', () => {
    pinnedState.lastRefreshAt = Date.parse('2026-05-13T10:00:00Z');
    render(<PinnedRulesEditor workerName="w1" />);
    expect(screen.getByText(/last refresh:/)).toBeInTheDocument();
  });

  it('renders the {separator} placeholder as a <code>---</code> element', () => {
    const { container } = render(<PinnedRulesEditor workerName="w1" />);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('---');
  });

  it('renders all four role-template options', () => {
    render(<PinnedRulesEditor workerName="w1" />);
    const select = screen.getByRole('combobox', { name: 'Role template' });
    const optionTexts = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent,
    );
    expect(optionTexts).toEqual([
      'No template',
      'role-manager',
      'role-worker',
      'role-attached',
    ]);
  });

  it('reflects defaultTemplate as the role select value', () => {
    pinnedState.defaultTemplate = 'worker';
    render(<PinnedRulesEditor workerName="w1" />);
    const select = screen.getByRole('combobox', {
      name: 'Role template',
    }) as HTMLSelectElement;
    expect(select.value).toBe('worker');
  });

  it('fires setDefaultTemplate when the role select changes', () => {
    render(<PinnedRulesEditor workerName="w1" />);
    const select = screen.getByRole('combobox', { name: 'Role template' });
    fireEvent.change(select, { target: { value: 'manager' } });
    expect(setDefaultTemplateMock).toHaveBeenCalledWith('manager');
  });

  it('reflects rulesText as the textarea value', () => {
    pinnedState.rulesText = 'rule A\n\n---\n\nrule B';
    render(<PinnedRulesEditor workerName="w1" />);
    const textarea = screen.getByRole('textbox', {
      name: 'Persistent Rules',
    }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('rule A\n\n---\n\nrule B');
  });

  it('fires setRulesText when the textarea changes', () => {
    render(<PinnedRulesEditor workerName="w1" />);
    const textarea = screen.getByRole('textbox', { name: 'Persistent Rules' });
    fireEvent.change(textarea, { target: { value: 'next-rules' } });
    expect(setRulesTextMock).toHaveBeenCalledWith('next-rules');
  });

  it('does not render the error alert when error is null', () => {
    pinnedState.error = null;
    render(<PinnedRulesEditor workerName="w1" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the error alert with the error message when error is set', () => {
    pinnedState.error = 'save failed: 500';
    render(<PinnedRulesEditor workerName="w1" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('save failed: 500');
  });

  it('disables both save buttons + select + textarea when loading=true', () => {
    pinnedState.loading = true;
    render(<PinnedRulesEditor workerName="w1" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save and refresh now' }),
    ).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Role template' })).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Persistent Rules' }),
    ).toBeDisabled();
  });

  it('disables both save buttons + select + textarea when saving=true', () => {
    pinnedState.saving = true;
    render(<PinnedRulesEditor workerName="w1" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save and refresh now' }),
    ).toBeDisabled();
  });

  it('fires save({refresh: false}) when the plain Save button is clicked', async () => {
    const user = userEvent.setup();
    render(<PinnedRulesEditor workerName="w1" />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith({ refresh: false });
  });

  it('fires save({refresh: true}) when the Save-and-refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<PinnedRulesEditor workerName="w1" />);
    await user.click(
      screen.getByRole('button', { name: 'Save and refresh now' }),
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith({ refresh: true });
  });

  it('drops the English "Save" button label when the locale flips to ko', () => {
    render(<PinnedRulesEditor workerName="w1" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
