import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  ApplyResult,
  SuggestResponse,
} from '../lib/use-prompt-revision';

// SpecialistsPromptPanel delegates the entire suggest / apply
// pipeline to usePromptRevision. Tests mock the hook with
// per-test-tunable flags (suggestBusy / applyBusy / suggestion /
// suggestError / applyResult / applyError) so the JSX wiring is
// exercised in isolation. Covered: prompt text rendering, the
// Suggest + Apply buttons (label / aria / busy gating /
// click -> handler), the suggest result panel (revision present,
// revision absent, rationale optional, applyHint with
// interpolated id), the suggest error banner, the apply result
// panel (applied / fired / noRevision branches + tone, decision
// chip + reason, meeting link, rendered revision pre +
// rationale), the apply error banner, and the locale flip.

let hookState: {
  suggestBusy: boolean;
  suggestion: SuggestResponse | null;
  suggestError: string | null;
  applyBusy: boolean;
  applyResult: ApplyResult | null;
  applyError: string | null;
} = {
  suggestBusy: false,
  suggestion: null,
  suggestError: null,
  applyBusy: false,
  applyResult: null,
  applyError: null,
};

const handleSuggestMock = vi.fn();
const handleApplyMock = vi.fn();

let lastHookArgs: { specialistId: string } | null = null;

vi.mock('../lib/use-prompt-revision', () => ({
  usePromptRevision: (args: { specialistId: string }) => {
    lastHookArgs = args;
    return {
      suggestBusy: hookState.suggestBusy,
      suggestion: hookState.suggestion,
      suggestError: hookState.suggestError,
      applyBusy: hookState.applyBusy,
      applyResult: hookState.applyResult,
      applyError: hookState.applyError,
      handleSuggest: handleSuggestMock,
      handleApply: handleApplyMock,
    };
  },
}));

import SpecialistsPromptPanel from './SpecialistsPromptPanel';

beforeEach(() => {
  setLocale('en');
  handleSuggestMock.mockReset();
  handleApplyMock.mockReset();
  hookState = {
    suggestBusy: false,
    suggestion: null,
    suggestError: null,
    applyBusy: false,
    applyResult: null,
    applyError: null,
  };
  lastHookArgs = null;
});

function makeApplyResult(
  over: Partial<ApplyResult> = {},
): ApplyResult {
  return {
    specialistId: 'arch-1',
    meetingId: 'mtg-12345678-abcd',
    decision: {
      accepted: true,
      accepts: ['arch-1', 'reviewer-1'],
      objects: [],
      missing: [],
      reason: null,
    },
    applied: true,
    suggestion: {
      revision: 'New system prompt body',
      rationale: 'Better tone',
    },
    sessionStatus: 'completed',
    ...over,
  };
}

function renderPanel(
  overrides: Partial<Parameters<typeof SpecialistsPromptPanel>[0]> = {},
) {
  const props = {
    specialistId: 'arch-1',
    systemPrompt: '[Role: Architect] Default prompt body.',
    ...overrides,
  };
  const utils = render(<SpecialistsPromptPanel {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, props };
}

describe('<SpecialistsPromptPanel>', () => {
  it('renders the system prompt label', () => {
    renderPanel();
    expect(screen.getByText('system prompt')).toBeInTheDocument();
  });

  it('renders the system prompt body inside a pre block', () => {
    const { container } = renderPanel({
      systemPrompt: '[Role: Reviewer] Be careful.',
    });
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre as HTMLElement).toHaveTextContent('[Role: Reviewer] Be careful.');
  });

  it('forwards specialistId into the usePromptRevision hook args', () => {
    renderPanel({ specialistId: 'reviewer-99' });
    expect(lastHookArgs?.specialistId).toBe('reviewer-99');
  });

  it('renders the Suggest revision button', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Suggest revision' }),
    ).toBeInTheDocument();
  });

  it('renders the Apply via meeting button', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Apply via meeting' }),
    ).toBeInTheDocument();
  });

  it('uses the Suggest tooltip text on the Suggest button title', () => {
    renderPanel();
    const btn = screen.getByRole('button', { name: 'Suggest revision' });
    expect(btn.getAttribute('title')).toContain(
      'Ask brain to draft a revised systemPrompt',
    );
  });

  it('uses the Apply tooltip text on the Apply button title', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Apply via meeting' }),
    ).toHaveAttribute(
      'title',
      'Spawn meta-meeting and apply revision on consensus',
    );
  });

  it('does not disable the Suggest button when suggestBusy is false', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Suggest revision' }),
    ).not.toBeDisabled();
  });

  it('disables the Suggest button when suggestBusy is true', () => {
    hookState.suggestBusy = true;
    renderPanel();
    expect(
      screen.getByRole('button', { name: /^Asking/ }),
    ).toBeDisabled();
  });

  it('flips the Suggest label to Asking when suggestBusy is true', () => {
    hookState.suggestBusy = true;
    renderPanel();
    expect(screen.getByRole('button', { name: /^Asking/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Suggest revision' }),
    ).not.toBeInTheDocument();
  });

  it('does not disable the Apply button when applyBusy is false', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Apply via meeting' }),
    ).not.toBeDisabled();
  });

  it('disables the Apply button when applyBusy is true', () => {
    hookState.applyBusy = true;
    renderPanel();
    expect(screen.getByRole('button', { name: /^Applying/ })).toBeDisabled();
  });

  it('flips the Apply label to Applying when applyBusy is true', () => {
    hookState.applyBusy = true;
    renderPanel();
    expect(
      screen.getByRole('button', { name: /^Applying/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply via meeting' }),
    ).not.toBeInTheDocument();
  });

  it('fires handleSuggest when the Suggest button is clicked', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Suggest revision' }));
    expect(handleSuggestMock).toHaveBeenCalledTimes(1);
  });

  it('fires handleApply when the Apply button is clicked', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Apply via meeting' }));
    expect(handleApplyMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire handleSuggest on initial render', () => {
    renderPanel();
    expect(handleSuggestMock).not.toHaveBeenCalled();
  });

  it('does NOT fire handleApply on initial render', () => {
    renderPanel();
    expect(handleApplyMock).not.toHaveBeenCalled();
  });

  it('does NOT render the suggest error banner when suggestError is null', () => {
    renderPanel();
    expect(
      screen.queryByText(/suggest failed|brain returned/i),
    ).not.toBeInTheDocument();
  });

  it('renders the suggest error text with destructive tone', () => {
    hookState.suggestError = 'brain timeout';
    renderPanel();
    const banner = screen.getByText('brain timeout');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toMatch(/text-destructive/);
  });

  it('does NOT render the suggestion panel when suggestion is null', () => {
    renderPanel();
    expect(
      screen.queryByText('Suggested revision (review only)'),
    ).not.toBeInTheDocument();
  });

  it('renders the Suggested revision heading when suggestion is set', () => {
    hookState.suggestion = {
      revision: 'New body',
      rationale: 'Cleaner phrasing',
    };
    renderPanel();
    expect(
      screen.getByText('Suggested revision (review only)'),
    ).toBeInTheDocument();
  });

  it('renders the suggestion.revision body inside a pre block', () => {
    hookState.suggestion = {
      revision: 'A new prompt revision',
      rationale: null,
    };
    const { container } = renderPanel();
    const pres = container.querySelectorAll('pre');
    const hasRevision = Array.from(pres).some((p) =>
      p.textContent?.includes('A new prompt revision'),
    );
    expect(hasRevision).toBe(true);
  });

  it('renders the empty-revision fallback when suggestion.revision is null', () => {
    hookState.suggestion = { revision: null, rationale: null };
    renderPanel();
    expect(
      screen.getByText('Brain returned no parseable revision. Try with a real claude brain.'),
    ).toBeInTheDocument();
  });

  it('renders the rationale prefix when suggestion.rationale is set', () => {
    hookState.suggestion = {
      revision: 'rev',
      rationale: 'because it is friendlier',
    };
    renderPanel();
    expect(screen.getByText('Rationale:')).toBeInTheDocument();
  });

  it('renders the rationale body when suggestion.rationale is set', () => {
    hookState.suggestion = {
      revision: 'rev',
      rationale: 'because it is friendlier',
    };
    renderPanel();
    expect(
      screen.getByText(/because it is friendlier/),
    ).toBeInTheDocument();
  });

  it('does NOT render the Rationale prefix when suggestion.rationale is null', () => {
    hookState.suggestion = { revision: 'rev', rationale: null };
    renderPanel();
    expect(screen.queryByText('Rationale:')).not.toBeInTheDocument();
  });

  it('renders the apply-hint CLI snippet interpolated with the specialist id', () => {
    hookState.suggestion = { revision: 'rev', rationale: null };
    renderPanel({ specialistId: 'arch-7' });
    const code = screen.getByText('c4 specialist apply-prompt arch-7');
    expect(code).toBeInTheDocument();
    expect(code.tagName.toLowerCase()).toBe('code');
  });

  it('does NOT render the apply error banner when applyError is null', () => {
    renderPanel();
    expect(screen.queryByText(/apply failed/i)).not.toBeInTheDocument();
  });

  it('renders the apply error text with destructive tone', () => {
    hookState.applyError = 'apply request failed';
    renderPanel();
    const banner = screen.getByText('apply request failed');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toMatch(/text-destructive/);
  });

  it('does NOT render the apply result panel when applyResult is null', () => {
    renderPanel();
    expect(
      screen.queryByText('Applied via meeting consensus'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/^Meeting fired/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No revision drafted (no meeting fired)'),
    ).not.toBeInTheDocument();
  });

  it('renders the applied banner when applyResult.applied is true', () => {
    hookState.applyResult = makeApplyResult({ applied: true });
    renderPanel();
    expect(
      screen.getByText('Applied via meeting consensus'),
    ).toBeInTheDocument();
  });

  it('uses the emerald tone on the applied banner', () => {
    hookState.applyResult = makeApplyResult({ applied: true });
    renderPanel();
    const banner = screen.getByText('Applied via meeting consensus');
    expect(banner.className).toMatch(/text-emerald-700/);
  });

  it('renders the fired banner when applyResult.applied is false but meetingId is set', () => {
    hookState.applyResult = makeApplyResult({
      applied: false,
      meetingId: 'mtg-x',
    });
    renderPanel();
    expect(
      screen.getByText(/^Meeting fired/),
    ).toBeInTheDocument();
  });

  it('uses the amber tone on the fired banner', () => {
    hookState.applyResult = makeApplyResult({
      applied: false,
      meetingId: 'mtg-x',
    });
    renderPanel();
    const banner = screen.getByText(/^Meeting fired/);
    expect(banner.className).toMatch(/text-amber-700/);
  });

  it('renders the no-revision banner when applied is false and meetingId is null', () => {
    hookState.applyResult = makeApplyResult({
      applied: false,
      meetingId: null,
    });
    renderPanel();
    expect(
      screen.getByText('No revision drafted (no meeting fired)'),
    ).toBeInTheDocument();
  });

  it('renders the meeting link with the truncated id when meetingId is set', () => {
    hookState.applyResult = makeApplyResult({
      meetingId: 'mtg-12345678-abcdef',
    });
    renderPanel();
    const link = screen.getByText(/meeting.*mtg-1234/);
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link).toHaveAttribute(
      'href',
      `#/meetings/${encodeURIComponent('mtg-12345678-abcdef')}`,
    );
  });

  it('does NOT render the meeting link when meetingId is null', () => {
    hookState.applyResult = makeApplyResult({
      applied: false,
      meetingId: null,
    });
    renderPanel();
    expect(screen.queryByText(/^meeting/)).not.toBeInTheDocument();
  });

  it('renders the decision accepted summary line', () => {
    hookState.applyResult = makeApplyResult({
      decision: {
        accepted: true,
        accepts: ['a', 'b', 'c'],
        objects: [],
        missing: [],
        reason: null,
      },
    });
    renderPanel();
    expect(screen.getByText(/decision: accepted/)).toBeInTheDocument();
    expect(screen.getByText(/accepts 3/)).toBeInTheDocument();
  });

  it('renders the decision rejected summary line', () => {
    hookState.applyResult = makeApplyResult({
      decision: {
        accepted: false,
        accepts: ['a'],
        objects: [{ id: 'x' }],
        missing: [],
        reason: 'too risky',
      },
    });
    renderPanel();
    expect(screen.getByText(/decision: rejected/)).toBeInTheDocument();
  });

  it('renders the objects-count clause when objects is non-empty', () => {
    hookState.applyResult = makeApplyResult({
      decision: {
        accepted: false,
        accepts: [],
        objects: [{ id: 'x' }, { id: 'y' }],
        missing: [],
        reason: null,
      },
    });
    renderPanel();
    expect(screen.getByText(/objects 2/)).toBeInTheDocument();
  });

  it('omits the objects-count clause when objects is empty', () => {
    hookState.applyResult = makeApplyResult({
      decision: {
        accepted: true,
        accepts: ['a'],
        objects: [],
        missing: [],
        reason: null,
      },
    });
    renderPanel();
    expect(screen.queryByText(/objects \d/)).not.toBeInTheDocument();
  });

  it('renders the reason clause when reason is set', () => {
    hookState.applyResult = makeApplyResult({
      decision: {
        accepted: false,
        accepts: [],
        objects: [],
        missing: [],
        reason: 'consensus failed',
      },
    });
    renderPanel();
    expect(screen.getByText(/consensus failed/)).toBeInTheDocument();
  });

  it('omits the reason clause when reason is null', () => {
    hookState.applyResult = makeApplyResult({
      decision: {
        accepted: true,
        accepts: ['a'],
        objects: [],
        missing: [],
        reason: null,
      },
    });
    renderPanel();
    expect(screen.queryByText(/\u2014\s+[A-Za-z]/)).not.toBeInTheDocument();
  });

  it('renders the suggestion revision body inside the apply result panel', () => {
    hookState.applyResult = makeApplyResult({
      suggestion: { revision: 'A finalised prompt body', rationale: null },
    });
    const { container } = renderPanel();
    const pres = container.querySelectorAll('pre');
    const hasRevision = Array.from(pres).some((p) =>
      p.textContent?.includes('A finalised prompt body'),
    );
    expect(hasRevision).toBe(true);
  });

  it('omits the suggestion revision pre when revision is null', () => {
    hookState.applyResult = makeApplyResult({
      suggestion: { revision: null, rationale: 'why' },
    });
    const { container } = renderPanel();
    // (pre only renders when applyResult.suggestion.revision is set;
    // the systemPrompt pre is always rendered)
    const pres = container.querySelectorAll('pre');
    expect(pres).toHaveLength(1);
  });

  it('renders the rationale prefix in the apply result panel', () => {
    hookState.applyResult = makeApplyResult({
      suggestion: { revision: 'r', rationale: 'because' },
    });
    renderPanel();
    expect(screen.getByText('Rationale:')).toBeInTheDocument();
  });

  it('omits the rationale prefix when rationale is null in the apply result', () => {
    hookState.applyResult = makeApplyResult({
      suggestion: { revision: 'r', rationale: null },
    });
    renderPanel();
    expect(screen.queryByText('Rationale:')).not.toBeInTheDocument();
  });

  it('rerendering with applyResult flipping from null to applied surfaces the banner', () => {
    const { rerender, props } = renderPanel();
    expect(
      screen.queryByText('Applied via meeting consensus'),
    ).not.toBeInTheDocument();
    hookState.applyResult = makeApplyResult({ applied: true });
    rerender(<SpecialistsPromptPanel {...props} />);
    expect(
      screen.getByText('Applied via meeting consensus'),
    ).toBeInTheDocument();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByText('system prompt')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('system prompt')).not.toBeInTheDocument();
  });
});
