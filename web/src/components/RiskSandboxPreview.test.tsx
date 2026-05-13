import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { SandboxPreview } from '../pages/Risk';
import RiskSandboxPreview from './RiskSandboxPreview';

// (v1.11.109) RiskSandboxPreview is pure display over a SandboxPreview
// value (the parent owns the fetch + busy state -- the
// useRiskSandboxPreview hook has its own dedicated test). Each test
// here drives one branch of the prop shape: badge labels,
// available / unavailable text, the capability grid, the argv pre
// (binary fallback + arg quoting), and the optional env details
// block. Mirrors the v1.11.107 RiskCheckResult composition pattern.

function makeSandbox(over: Partial<SandboxPreview> = {}): SandboxPreview {
  return {
    binary: '/usr/bin/docker',
    args: ['run', '--rm', 'demo'],
    env: {},
    command: 'demo',
    isolation: {
      name: 'docker-default',
      network: 'none',
      filesystem: 'ro',
      resources: 'cpu=1',
    },
    available: { ok: true, reason: null },
    runtime: 'docker',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<RiskSandboxPreview>', () => {
  it('renders the runtime badge with the runtime value interpolated', () => {
    render(<RiskSandboxPreview sandbox={makeSandbox({ runtime: 'docker' })} />);
    expect(screen.getByText('runtime: docker')).toBeInTheDocument();
  });

  it('renders the runtime badge for the null runtime value too', () => {
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ runtime: 'null', binary: null })}
      />,
    );
    expect(screen.getByText('runtime: null')).toBeInTheDocument();
  });

  it('renders the isolation badge with the isolation.name value', () => {
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({
          isolation: {
            name: 'gvisor',
            network: 'none',
            filesystem: 'ro',
            resources: 'cpu=1',
          },
        })}
      />,
    );
    expect(screen.getByText('isolation: gvisor')).toBeInTheDocument();
  });

  it('renders the available indicator span (success branch) when available.ok=true', () => {
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ available: { ok: true, reason: null } })}
      />,
    );
    const span = screen.getByText(/^available\b/);
    expect(span).toBeInTheDocument();
    expect(span.className).toMatch(/text-success/);
  });

  it('renders the unavailable indicator with the reason interpolated when available.ok=false', () => {
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({
          available: { ok: false, reason: 'docker daemon not running' },
        })}
      />,
    );
    const span = screen.getByText(/^unavailable: docker daemon not running/);
    expect(span).toBeInTheDocument();
    expect(span.className).toMatch(/text-destructive/);
  });

  it('falls back to "?" inside the unavailable indicator when reason is null', () => {
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ available: { ok: false, reason: null } })}
      />,
    );
    expect(screen.getByText(/^unavailable: \?/)).toBeInTheDocument();
  });

  it('renders the capability grid with network / filesystem / resources values', () => {
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({
          isolation: {
            name: 'docker-default',
            network: 'bridge',
            filesystem: 'rw',
            resources: 'cpu=2,mem=512m',
          },
        })}
      />,
    );
    expect(screen.getByText('network:').parentElement?.textContent).toMatch(
      /network:\s*bridge/,
    );
    expect(screen.getByText('filesystem:').parentElement?.textContent).toMatch(
      /filesystem:\s*rw/,
    );
    expect(screen.getByText('resources:').parentElement?.textContent).toMatch(
      /resources:\s*cpu=2,mem=512m/,
    );
  });

  it('renders the argv header label literally', () => {
    render(<RiskSandboxPreview sandbox={makeSandbox()} />);
    expect(screen.getByText('argv')).toBeInTheDocument();
  });

  it('renders the argv pre with the binary and bare args joined by spaces', () => {
    const { container } = render(
      <RiskSandboxPreview
        sandbox={makeSandbox({
          binary: '/usr/bin/docker',
          args: ['run', '--rm', 'demo'],
        })}
      />,
    );
    const pres = container.querySelectorAll('pre');
    expect(pres.length).toBeGreaterThanOrEqual(1);
    expect(pres[0].textContent).toBe('/usr/bin/docker run --rm demo');
  });

  it('falls back to <NullRuntime> in the argv pre when binary is null', () => {
    const { container } = render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ binary: null, args: ['noop'] })}
      />,
    );
    const pres = container.querySelectorAll('pre');
    expect(pres[0].textContent).toBe('<NullRuntime> noop');
  });

  it('falls back to <NullRuntime> in the argv pre when binary is the empty string', () => {
    const { container } = render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ binary: '', args: [] })}
      />,
    );
    const pres = container.querySelectorAll('pre');
    expect(pres[0].textContent).toBe('<NullRuntime> ');
  });

  it('JSON-quotes any arg that contains whitespace and leaves bare args alone', () => {
    const { container } = render(
      <RiskSandboxPreview
        sandbox={makeSandbox({
          binary: '/bin/sh',
          args: ['-c', 'echo hi there', 'tail'],
        })}
      />,
    );
    const pres = container.querySelectorAll('pre');
    expect(pres[0].textContent).toBe('/bin/sh -c "echo hi there" tail');
  });

  it('hides the env details block when sandbox.env has no keys', () => {
    render(<RiskSandboxPreview sandbox={makeSandbox({ env: {} })} />);
    expect(screen.queryByText(/^env \(/)).not.toBeInTheDocument();
  });

  it('renders the env details summary with the entry count and a key=value pre', () => {
    const { container } = render(
      <RiskSandboxPreview
        sandbox={makeSandbox({
          env: { FOO: 'bar', BAZ: 'qux' },
        })}
      />,
    );
    const summary = screen.getByText('env (2)');
    expect(summary).toBeInTheDocument();
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    const pre = details!.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe('FOO=bar\nBAZ=qux');
  });

  it('drops the English "available" indicator text when the locale flips to ko', () => {
    render(<RiskSandboxPreview sandbox={makeSandbox()} />);
    expect(screen.getByText(/^available\b/)).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText(/^available\b/)).not.toBeInTheDocument();
  });

  it('does not crash when sandbox.env is undefined (defensive Object.keys default)', () => {
    const { container } = render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ env: undefined as unknown as Record<string, string> })}
      />,
    );
    expect(container.querySelector('details')).toBeNull();
    expect(screen.queryByText(/^env \(/)).not.toBeInTheDocument();
  });

  it('keeps the argv pre keyboard-focusable via tabIndex=0', () => {
    const { container } = render(<RiskSandboxPreview sandbox={makeSandbox()} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute('tabindex')).toBe('0');
  });

  it('lets a keyboard user toggle the env details element open', async () => {
    const user = userEvent.setup();
    render(
      <RiskSandboxPreview
        sandbox={makeSandbox({ env: { FOO: 'bar' } })}
      />,
    );
    const summary = screen.getByText('env (1)');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(summary);
    expect(details.open).toBe(true);
    const pre = within(details).getByText('FOO=bar');
    expect(pre).toBeInTheDocument();
  });
});
