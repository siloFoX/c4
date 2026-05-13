import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { PatternsResponse } from '../lib/use-lazy-risk-patterns';

// (v1.11.107) RiskRuleCatalogPanel composes a collapsible Panel with
// the useLazyRiskPatterns hook (lazy GET /api/risk/patterns on first
// open) plus a local filter + useToggle for open state. The lazy
// fetch + cache logic is covered by use-lazy-risk-patterns.test.ts,
// so here we stub the hook to drive each (open / loading / loaded /
// filter) branch deterministically. Mirrors v1.11.105/106's
// marker-stub composition pattern.

let patternsState: PatternsResponse | null = null;
let lastOpenArg = false;

vi.mock('../lib/use-lazy-risk-patterns', () => ({
  useLazyRiskPatterns: ({ open }: { open: boolean }) => {
    lastOpenArg = open;
    return patternsState;
  },
}));

import RiskRuleCatalogPanel from './RiskRuleCatalogPanel';

function makePatterns(over: Partial<PatternsResponse> = {}): PatternsResponse {
  return {
    builtin: {
      critical: [{ code: 'rm-rf', label: 'recursive remove' }],
      high: [{ code: 'sudo', label: 'privileged escalation' }],
      medium: [{ code: 'curl-pipe-sh', label: 'pipe to shell' }],
    },
    custom: { critical: [], high: [], medium: [] },
    counts: {
      builtin: { critical: 1, high: 1, medium: 1, total: 3 },
      custom: { critical: 0, high: 0, medium: 0, total: 0 },
    },
    allowList: 0,
    denyList: 0,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  patternsState = null;
  lastOpenArg = false;
});

describe('<RiskRuleCatalogPanel>', () => {
  it('renders the "Rule catalog" heading as a toggle button', () => {
    render(<RiskRuleCatalogPanel />);
    expect(
      screen.getByRole('button', { name: /Rule catalog/ }),
    ).toBeInTheDocument();
  });

  it('starts closed: aria-expanded=false and the body is not rendered', () => {
    render(<RiskRuleCatalogPanel />);
    expect(
      screen.getByRole('button', { name: /Rule catalog/ }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('textbox', { name: 'Filter rule catalog' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading catalog/)).not.toBeInTheDocument();
  });

  it('flips aria-expanded to true after the operator clicks the toggle', async () => {
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(
      screen.getByRole('button', { name: /Rule catalog/ }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('passes the current open flag down into useLazyRiskPatterns', async () => {
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    expect(lastOpenArg).toBe(false);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(lastOpenArg).toBe(true);
  });

  it('renders the "Loading catalog" caption when open with patterns=null', async () => {
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(screen.getByText(/Loading catalog/)).toBeInTheDocument();
  });

  it('shows the count rollup in the heading caption once patterns load', async () => {
    patternsState = makePatterns({ allowList: 4, denyList: 7 });
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    const btn = screen.getByRole('button', { name: /Rule catalog/ });
    expect(btn.textContent).toMatch(
      /3 builtin.*0 custom.*4 allow.*7 deny/,
    );
  });

  it('renders the filter input + critical/high/medium sections when open with patterns', async () => {
    patternsState = makePatterns();
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(
      screen.getByRole('textbox', { name: 'Filter rule catalog' }),
    ).toBeInTheDocument();
    expect(screen.getByText('rm-rf')).toBeInTheDocument();
    expect(screen.getByText('sudo')).toBeInTheDocument();
    expect(screen.getByText('curl-pipe-sh')).toBeInTheDocument();
  });

  it('skips a severity section entirely when its builtin list is empty', async () => {
    patternsState = makePatterns({
      builtin: {
        critical: [{ code: 'rm-rf', label: 'recursive remove' }],
        high: [],
        medium: [],
      },
      counts: {
        builtin: { critical: 1, high: 0, medium: 0, total: 1 },
        custom: { critical: 0, high: 0, medium: 0, total: 0 },
      },
    });
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(screen.getByText('rm-rf')).toBeInTheDocument();
    expect(screen.queryByText('sudo')).not.toBeInTheDocument();
    expect(screen.queryByText('curl-pipe-sh')).not.toBeInTheDocument();
  });

  it('hides the "Custom rules" block when counts.custom.total=0', async () => {
    patternsState = makePatterns();
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(screen.queryByText('Custom rules')).not.toBeInTheDocument();
  });

  it('renders the "Custom rules" block with per-severity counts when custom.total>0', async () => {
    patternsState = makePatterns({
      counts: {
        builtin: { critical: 1, high: 1, medium: 1, total: 3 },
        custom: { critical: 2, high: 3, medium: 5, total: 10 },
      },
    });
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    expect(screen.getByText('Custom rules')).toBeInTheDocument();
    expect(
      screen.getByText(/2 critical.*3 high.*5 medium/),
    ).toBeInTheDocument();
  });

  it('narrows the visible items to substring matches when the filter is typed (by code)', async () => {
    patternsState = makePatterns();
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    const filter = screen.getByRole('textbox', { name: 'Filter rule catalog' });
    await user.type(filter, 'sudo');
    expect(screen.getByText('sudo')).toBeInTheDocument();
    expect(screen.queryByText('rm-rf')).not.toBeInTheDocument();
    expect(screen.queryByText('curl-pipe-sh')).not.toBeInTheDocument();
  });

  it('matches the filter against the label too, not just the code', async () => {
    patternsState = makePatterns();
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    const filter = screen.getByRole('textbox', { name: 'Filter rule catalog' });
    await user.type(filter, 'recursive');
    expect(screen.getByText('rm-rf')).toBeInTheDocument();
    expect(screen.queryByText('sudo')).not.toBeInTheDocument();
  });

  it('hides every severity section when the filter has no matches', async () => {
    patternsState = makePatterns();
    const user = userEvent.setup();
    render(<RiskRuleCatalogPanel />);
    await user.click(screen.getByRole('button', { name: /Rule catalog/ }));
    const filter = screen.getByRole('textbox', { name: 'Filter rule catalog' });
    await user.type(filter, 'nope-no-match');
    expect(screen.queryByText('rm-rf')).not.toBeInTheDocument();
    expect(screen.queryByText('sudo')).not.toBeInTheDocument();
    expect(screen.queryByText('curl-pipe-sh')).not.toBeInTheDocument();
  });

  it('drops the English "Rule catalog" heading when the locale flips to ko', () => {
    render(<RiskRuleCatalogPanel />);
    expect(
      screen.queryByRole('button', { name: /Rule catalog/ }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /Rule catalog/ }),
    ).not.toBeInTheDocument();
  });
});
