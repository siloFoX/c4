import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { UseMorningState, MorningResponse } from '../lib/use-morning';
import type { ToastType } from '../components/Toast';

// Morning.tsx wires PageFrame + useMorning (POST /api/morning +
// clipboard copy) + the shared single-slot useToast. Stub both
// hooks so each test drives a single branch of the generate /
// copy / empty / error flow without touching fetch or
// navigator.clipboard. PageDescriptionBanner + Toast + markdown
// are stubbed to thin markers so the assertions stay focused on
// the page composition.

const generateMock = vi.fn(async () => {});
const copyMock = vi.fn(async () => {});
const showToastMock = vi.fn();
const dismissToastMock = vi.fn();

interface ToastSlot {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastApi {
  toast: ToastSlot | null;
  showToast: (m: string, t: ToastType) => void;
  dismissToast: () => void;
}

let hookState: UseMorningState = {
  report: null,
  loading: false,
  error: null,
  generate: generateMock,
  copy: copyMock,
};

let toastState: ToastApi = {
  toast: null,
  showToast: showToastMock,
  dismissToast: dismissToastMock,
};

vi.mock('../lib/use-morning', () => ({
  useMorning: (): UseMorningState => hookState,
}));

vi.mock('../lib/use-toast', () => ({
  useToast: (): ToastApi => toastState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

interface CapturedToastProps {
  message: string;
  type: string;
}

let lastToastProps: CapturedToastProps | null = null;

vi.mock('../components/Toast', () => ({
  default: (props: CapturedToastProps & { onDismiss: () => void }) => {
    lastToastProps = { message: props.message, type: props.type };
    return (
      <div
        data-testid="toast"
        data-message={props.message}
        data-type={props.type}
      />
    );
  },
}));

vi.mock('../lib/markdown', () => ({
  renderMarkdown: (src: string) => (
    <div data-testid="markdown" data-src={src} />
  ),
}));

import Morning from './Morning';

function makeReport(over: Partial<MorningResponse> = {}): MorningResponse {
  return {
    content: '# morning report',
    generatedAt: '2026-05-12T08:00:00.000Z',
    sections: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  generateMock.mockReset();
  generateMock.mockResolvedValue(undefined);
  copyMock.mockReset();
  copyMock.mockResolvedValue(undefined);
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  hookState = {
    report: null,
    loading: false,
    error: null,
    generate: generateMock,
    copy: copyMock,
  };
  toastState = {
    toast: null,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  };
  lastToastProps = null;
});

describe('<Morning>', () => {
  it('renders the page title in the frame header', () => {
    render(<Morning />);
    expect(screen.getByText('Morning report')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Morning />);
    expect(
      screen.getByText(/Daily overview/),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Morning />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('renders the Generate button', () => {
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Generate/ }),
    ).toBeInTheDocument();
  });

  it('renders the Copy button', () => {
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Copy/ }),
    ).toBeInTheDocument();
  });

  it('fires generate when the Generate button is clicked', async () => {
    const user = userEvent.setup();
    render(<Morning />);
    await user.click(screen.getByRole('button', { name: /Generate/ }));
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('disables the Generate button while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Generate/ }),
    ).toBeDisabled();
  });

  it('enables the Generate button when not loading', () => {
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Generate/ }),
    ).toBeEnabled();
  });

  it('flips the Generate icon to animate-spin while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Morning />);
    const btn = screen.getByRole('button', { name: /Generate/ });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply animate-spin on the Generate icon when idle', () => {
    render(<Morning />);
    const btn = screen.getByRole('button', { name: /Generate/ });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('disables the Copy button when there is no report content', () => {
    hookState = { ...hookState, report: null };
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Copy/ }),
    ).toBeDisabled();
  });

  it('disables the Copy button when the report has no content field', () => {
    hookState = {
      ...hookState,
      report: { content: undefined, sections: [{ title: 't', body: 'b' }] },
    };
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Copy/ }),
    ).toBeDisabled();
  });

  it('enables the Copy button when report content is present', () => {
    hookState = { ...hookState, report: makeReport() };
    render(<Morning />);
    expect(
      screen.getByRole('button', { name: /Copy/ }),
    ).toBeEnabled();
  });

  it('fires copy when the Copy button is clicked', async () => {
    hookState = { ...hookState, report: makeReport() };
    const user = userEvent.setup();
    render(<Morning />);
    await user.click(screen.getByRole('button', { name: /Copy/ }));
    expect(copyMock).toHaveBeenCalledTimes(1);
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<Morning />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('hides the error panel when error is null', () => {
    render(<Morning />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the empty-report hint when there is no report yet', () => {
    render(<Morning />);
    expect(
      screen.getByText(/No report generated yet/),
    ).toBeInTheDocument();
  });

  it('hides the empty-report hint once a report is loaded', () => {
    hookState = { ...hookState, report: makeReport() };
    render(<Morning />);
    expect(
      screen.queryByText(/No report generated yet/),
    ).not.toBeInTheDocument();
  });

  it('renders the generatedAt timestamp line when present', () => {
    hookState = { ...hookState, report: makeReport() };
    render(<Morning />);
    expect(screen.getByText(/Generated at/)).toBeInTheDocument();
  });

  it('does NOT render the generatedAt line when missing', () => {
    hookState = {
      ...hookState,
      report: makeReport({ generatedAt: undefined }),
    };
    render(<Morning />);
    expect(screen.queryByText(/Generated at/)).not.toBeInTheDocument();
  });

  it('renders one panel per section when the report has sections', () => {
    hookState = {
      ...hookState,
      report: makeReport({
        sections: [
          { title: 'Yesterday', body: 'merged 3 PRs' },
          { title: 'Open TODO', body: 'three items' },
        ],
      }),
    };
    render(<Morning />);
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Open TODO')).toBeInTheDocument();
  });

  it('renders the markdown body for each section', () => {
    hookState = {
      ...hookState,
      report: makeReport({
        sections: [
          { title: 'A', body: 'body-a' },
          { title: 'B', body: 'body-b' },
        ],
      }),
    };
    render(<Morning />);
    const md = screen.getAllByTestId('markdown');
    expect(md).toHaveLength(2);
    const srcs = md.map((el) => el.getAttribute('data-src'));
    expect(srcs).toContain('body-a');
    expect(srcs).toContain('body-b');
  });

  it('renders a single markdown body for `content` when sections is empty', () => {
    hookState = {
      ...hookState,
      report: makeReport({ sections: [], content: '# fallback' }),
    };
    render(<Morning />);
    const md = screen.getAllByTestId('markdown');
    expect(md).toHaveLength(1);
    expect(md[0].getAttribute('data-src')).toBe('# fallback');
  });

  it('renders the no-content empty hint when sections empty AND content missing', () => {
    hookState = {
      ...hookState,
      report: makeReport({ sections: [], content: undefined }),
    };
    render(<Morning />);
    expect(
      screen.getByText(/Report returned no content/),
    ).toBeInTheDocument();
  });

  it('prefers sections over content when both are populated', () => {
    hookState = {
      ...hookState,
      report: makeReport({
        sections: [{ title: 'S', body: 'section-body' }],
        content: '# top-level-content',
      }),
    };
    render(<Morning />);
    const md = screen.getAllByTestId('markdown');
    expect(md).toHaveLength(1);
    expect(md[0].getAttribute('data-src')).toBe('section-body');
  });

  it('hides the toast slot when the toast hook is empty', () => {
    render(<Morning />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('renders the Toast marker when the toast slot is non-null', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'copied', type: 'success' },
    };
    render(<Morning />);
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(lastToastProps?.message).toBe('copied');
    expect(lastToastProps?.type).toBe('success');
  });

  it('renders an error toast tone correctly via the marker', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'fail', type: 'error' },
    };
    render(<Morning />);
    expect(lastToastProps?.type).toBe('error');
  });

  it('shows the empty hint, the generate button and the toast slot together when toast set without report', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'msg', type: 'info' },
    };
    render(<Morning />);
    expect(
      screen.getByText(/No report generated yet/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('renders both error panel and empty hint together when error is set with no report', () => {
    hookState = { ...hookState, error: 'load fail' };
    render(<Morning />);
    expect(screen.getByRole('alert')).toHaveTextContent('load fail');
    expect(
      screen.getByText(/No report generated yet/),
    ).toBeInTheDocument();
  });

  it('still renders the error panel above the report when both error and report are set', () => {
    hookState = {
      ...hookState,
      error: 'partial fail',
      report: makeReport(),
    };
    render(<Morning />);
    expect(screen.getByRole('alert')).toHaveTextContent('partial fail');
    expect(screen.getByTestId('markdown')).toBeInTheDocument();
  });

  it('forwards rerender state changes through hookState mutation', () => {
    const { rerender } = render(<Morning />);
    expect(
      screen.getByText(/No report generated yet/),
    ).toBeInTheDocument();
    hookState = { ...hookState, report: makeReport({ content: '# fresh' }) };
    rerender(<Morning />);
    expect(screen.getByTestId('markdown').getAttribute('data-src')).toBe(
      '# fresh',
    );
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Morning />);
    expect(screen.getByText('Morning report')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
