import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WikiBulkPublishRow from './WikiBulkPublishRow';

// WikiBulkPublishRow is pure controlled inputs — it forwards the
// raw checkbox state to onGitCommit / onGitPush and fires onPublish
// on the button click. The cascade rules (gitPush=true forces
// gitCommit=true, etc.) and the window.confirm gate are owned by
// the parent hook (use-wiki-bulk-publish). The component tests
// verify only the wiring + busy / message branches.

function renderRow(
  overrides: Partial<Parameters<typeof WikiBulkPublishRow>[0]> = {},
) {
  const props = {
    busy: false,
    gitCommit: false,
    gitPush: false,
    msg: null as string | null,
    failed: false,
    onGitCommit: vi.fn(),
    onGitPush: vi.fn(),
    onPublish: vi.fn(),
    ...overrides,
  };
  const utils = render(<WikiBulkPublishRow {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WikiBulkPublishRow>', () => {
  it('renders the publish button with its idle label', () => {
    renderRow();
    expect(
      screen.getByRole('button', {
        name: 'Publish all terminal meetings without a wiki page',
      }),
    ).toBeInTheDocument();
  });

  it('shows the idle inner text "Publish all" by default', () => {
    renderRow();
    expect(screen.getByText('Publish all')).toBeInTheDocument();
  });

  it('shows the busy inner text "Publishing…" when busy=true', () => {
    renderRow({ busy: true });
    expect(screen.getByText('Publishing…')).toBeInTheDocument();
    expect(screen.queryByText('Publish all')).not.toBeInTheDocument();
  });

  it('disables the publish button while busy=true', () => {
    renderRow({ busy: true });
    expect(
      screen.getByRole('button', {
        name: 'Publish all terminal meetings without a wiki page',
      }),
    ).toBeDisabled();
  });

  it('does not disable the publish button while busy=false', () => {
    renderRow({ busy: false });
    expect(
      screen.getByRole('button', {
        name: 'Publish all terminal meetings without a wiki page',
      }),
    ).not.toBeDisabled();
  });

  it('wraps the publish button with a Tooltip carrying the publish hint', () => {
    renderRow();
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(
      "Publish a wiki page for every terminal meeting that doesn't have one",
    );
  });

  it('fires onPublish when the publish button is clicked', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    renderRow({ onPublish });
    await user.click(
      screen.getByRole('button', {
        name: 'Publish all terminal meetings without a wiki page',
      }),
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('renders the gitCommit checkbox unchecked by default', () => {
    renderRow();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('renders the gitCommit checkbox checked when gitCommit=true', () => {
    renderRow({ gitCommit: true });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
  });

  it('renders the gitPush checkbox checked when gitPush=true', () => {
    renderRow({ gitPush: true });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).toBeChecked();
  });

  it('fires onGitCommit(true) when the commit checkbox is clicked off→on', async () => {
    const user = userEvent.setup();
    const onGitCommit = vi.fn();
    renderRow({ gitCommit: false, onGitCommit });
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(onGitCommit).toHaveBeenCalledTimes(1);
    expect(onGitCommit).toHaveBeenCalledWith(true);
  });

  it('fires onGitCommit(false) when the commit checkbox is clicked on→off', async () => {
    const user = userEvent.setup();
    const onGitCommit = vi.fn();
    renderRow({ gitCommit: true, onGitCommit });
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(onGitCommit).toHaveBeenCalledWith(false);
  });

  it('fires onGitPush(true) when the push checkbox is clicked off→on', async () => {
    const user = userEvent.setup();
    const onGitPush = vi.fn();
    renderRow({ gitPush: false, onGitPush });
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(onGitPush).toHaveBeenCalledTimes(1);
    expect(onGitPush).toHaveBeenCalledWith(true);
  });

  it('fires onGitPush(false) when the push checkbox is clicked on→off', async () => {
    const user = userEvent.setup();
    const onGitPush = vi.fn();
    renderRow({ gitPush: true, onGitPush });
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(onGitPush).toHaveBeenCalledWith(false);
  });

  it('disables both checkboxes while busy=true', () => {
    renderRow({ busy: true });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[1]).toBeDisabled();
  });

  it('does not disable the checkboxes while busy=false', () => {
    renderRow({ busy: false });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).not.toBeDisabled();
  });

  it('renders the "git commit" label', () => {
    renderRow();
    expect(screen.getByText('git commit')).toBeInTheDocument();
  });

  it('renders the "+ push" label', () => {
    renderRow();
    expect(screen.getByText('+ push')).toBeInTheDocument();
  });

  it('omits the result message span when msg is null', () => {
    const { container } = renderRow({ msg: null });
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('renders the success message with muted-foreground tone when failed=false', () => {
    renderRow({ msg: 'published 3 new page(s)', failed: false });
    const m = screen.getByText('published 3 new page(s)');
    expect(m).toHaveClass('text-muted-foreground');
    expect(m).not.toHaveClass('text-destructive');
  });

  it('renders the failure message with destructive tone when failed=true', () => {
    renderRow({ msg: 'publish-all failed: 500', failed: true });
    const m = screen.getByText('publish-all failed: 500');
    expect(m).toHaveClass('text-destructive');
  });

  it('does not fire any callback on initial render', () => {
    const onGitCommit = vi.fn();
    const onGitPush = vi.fn();
    const onPublish = vi.fn();
    renderRow({ onGitCommit, onGitPush, onPublish });
    expect(onGitCommit).not.toHaveBeenCalled();
    expect(onGitPush).not.toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('does not fire onPublish when a checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    renderRow({ onPublish });
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('rerendering with identical props does not duplicate publish calls', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const props = {
      busy: false,
      gitCommit: false,
      gitPush: false,
      msg: null as string | null,
      failed: false,
      onGitCommit: vi.fn(),
      onGitPush: vi.fn(),
      onPublish,
    };
    const { rerender } = render(<WikiBulkPublishRow {...props} />);
    rerender(<WikiBulkPublishRow {...props} />);
    await user.click(
      screen.getByRole('button', {
        name: 'Publish all terminal meetings without a wiki page',
      }),
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('re-renders the labels when the locale flips to ko', () => {
    renderRow();
    expect(screen.getByText('git commit')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('git commit')).not.toBeInTheDocument();
  });

  it('wraps the row in a flex container with the border-t and pt-2 classes', () => {
    const { container } = renderRow();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('border-t');
    expect(wrapper).toHaveClass('pt-2');
  });

  it('renders the publish button as type="button" (no implicit form submit)', () => {
    renderRow();
    expect(
      screen.getByRole('button', {
        name: 'Publish all terminal meetings without a wiki page',
      }),
    ).toHaveAttribute('type', 'button');
  });
});
