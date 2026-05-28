import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Workers from './Workers';

function stubFetchListResponse(payload: unknown) {
  vi.stubGlobal('fetch', (input: string) => {
    if (input === '/api/list') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      text: () => Promise.resolve(''),
    } as Response);
  });
}

describe('<Workers> hero page', () => {
  beforeEach(() => {
    window.localStorage.removeItem('c4:workers:hero-sparkline');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.removeItem('c4:workers:hero-sparkline');
  });

  it('renders the hero shell with page title + description', () => {
    stubFetchListResponse({ workers: [] });
    render(<Workers onSpawnRequest={async () => undefined} />);
    expect(screen.getByText('Workers')).toBeInTheDocument();
    expect(
      screen.getByText(/At-a-glance worker dashboard/i),
    ).toBeInTheDocument();
  });

  it('exposes data-section="workers-hero" for e2e targeting', () => {
    stubFetchListResponse({ workers: [] });
    render(<Workers onSpawnRequest={async () => undefined} />);
    expect(
      document.querySelector('[data-section="workers-hero"]'),
    ).not.toBeNull();
  });

  it('renders three count blocks (busy / idle / lost) once loaded', async () => {
    stubFetchListResponse({ workers: [] });
    render(<Workers onSpawnRequest={async () => undefined} />);
    // (v1.11.1105, TODO 11.1087) Count blocks now render only after the
    // first /api/list poll settles -- skeleton tiles show until then.
    expect(await screen.findByTestId('workers-hero-count-busy')).toBeInTheDocument();
    expect(screen.getByTestId('workers-hero-count-idle')).toBeInTheDocument();
    expect(screen.getByTestId('workers-hero-count-lost')).toBeInTheDocument();
  });

  it('shows skeleton stat tiles while the first /api/list poll is in flight', () => {
    // A fetch that never resolves keeps the hook in its loading state.
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    render(<Workers onSpawnRequest={async () => undefined} />);
    expect(
      document.querySelector('[data-section="workers-hero-count-skeleton"]'),
    ).not.toBeNull();
    // The real count blocks are not present yet.
    expect(screen.queryByTestId('workers-hero-count-busy')).toBeNull();
  });

  it('derives counts from /api/list (busy/idle split + lost)', async () => {
    stubFetchListResponse({
      workers: [
        { name: 'a', state: 'busy' },
        { name: 'b', state: 'idle' },
        { name: 'c', state: 'idle' },
      ],
      lost: [{ name: 'x' }],
    });
    render(<Workers onSpawnRequest={async () => undefined} />);
    await waitFor(() => {
      const busy = screen.getByTestId('workers-hero-count-busy');
      expect(busy.textContent).toContain('1');
    });
    const idle = screen.getByTestId('workers-hero-count-idle');
    expect(idle.textContent).toContain('2');
    const lost = screen.getByTestId('workers-hero-count-lost');
    expect(lost.textContent).toContain('1');
  });

  it('renders the spawn worker CTA', () => {
    stubFetchListResponse({ workers: [] });
    render(<Workers onSpawnRequest={async () => undefined} />);
    expect(screen.getByTestId('workers-hero-spawn-cta')).toBeInTheDocument();
  });

  it('clicking the CTA fires the spawn callback', async () => {
    stubFetchListResponse({ workers: [] });
    const onSpawn = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<Workers onSpawnRequest={onSpawn} />);
    await user.click(screen.getByTestId('workers-hero-spawn-cta'));
    await waitFor(() => {
      expect(onSpawn).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a success toast after a successful spawn', async () => {
    stubFetchListResponse({ workers: [] });
    const user = userEvent.setup();
    render(<Workers onSpawnRequest={async () => undefined} />);
    await user.click(screen.getByTestId('workers-hero-spawn-cta'));
    await waitFor(() => {
      expect(
        screen.getByText(/Spawn request sent/i),
      ).toBeInTheDocument();
    });
  });

  it('shows an error toast when the spawn rejects', async () => {
    stubFetchListResponse({ workers: [] });
    const user = userEvent.setup();
    render(
      <Workers
        onSpawnRequest={async () => {
          throw new Error('quota exceeded');
        }}
      />,
    );
    await user.click(screen.getByTestId('workers-hero-spawn-cta'));
    await waitFor(() => {
      expect(screen.getByText(/Spawn failed/i)).toBeInTheDocument();
      expect(screen.getByText(/quota exceeded/i)).toBeInTheDocument();
    });
  });

  it('renders the sparkline element with an accessible label', () => {
    stubFetchListResponse({ workers: [] });
    render(<Workers onSpawnRequest={async () => undefined} />);
    const sparkline = screen.getByTestId('workers-hero-sparkline');
    expect(sparkline).toBeInTheDocument();
    const ariaLabel =
      sparkline.getAttribute('aria-label') ??
      sparkline.querySelector('[aria-label]')?.getAttribute('aria-label') ??
      '';
    expect(ariaLabel.toLowerCase()).toMatch(/worker total trend/);
  });

  it('count blocks carry data-tone for theming', async () => {
    stubFetchListResponse({ workers: [] });
    render(<Workers onSpawnRequest={async () => undefined} />);
    await screen.findByTestId('workers-hero-count-busy');
    expect(
      screen.getByTestId('workers-hero-count-busy').getAttribute('data-tone'),
    ).toBe('accent');
    expect(
      screen.getByTestId('workers-hero-count-idle').getAttribute('data-tone'),
    ).toBe('muted');
    expect(
      screen.getByTestId('workers-hero-count-lost').getAttribute('data-tone'),
    ).toBe('danger');
  });

  it('handles a malformed /api/list response without crashing (counts stay at 0)', async () => {
    stubFetchListResponse({});
    render(<Workers onSpawnRequest={async () => undefined} />);
    // Wait a tick to let the fetch resolve.
    await new Promise((r) => setTimeout(r, 10));
    expect(
      screen.getByTestId('workers-hero-count-busy').textContent,
    ).toContain('0');
    expect(
      screen.getByTestId('workers-hero-count-idle').textContent,
    ).toContain('0');
  });
});
