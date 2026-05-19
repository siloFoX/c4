import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ENV_KINDS,
  EnvBadge,
  EnvBanner,
  getEnvBadgeClass,
  getEnvBannerClass,
  getEnvKind,
  getEnvLabel,
  isProductionEnv,
} from './env-badge';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('ENV_KINDS', () => {
  it('lists seven canonical kinds in order', () => {
    expect([...ENV_KINDS]).toEqual([
      'production',
      'staging',
      'development',
      'preview',
      'test',
      'local',
      'unknown',
    ]);
  });
});

describe('getEnvKind', () => {
  it('returns unknown for falsy / unparseable', () => {
    expect(getEnvKind(undefined)).toBe('unknown');
    expect(getEnvKind(null)).toBe('unknown');
    expect(getEnvKind('')).toBe('unknown');
    expect(getEnvKind('xyz')).toBe('unknown');
  });
  it('case-insensitive + trims whitespace', () => {
    expect(getEnvKind('  PROD  ')).toBe('production');
    expect(getEnvKind('Staging')).toBe('staging');
  });
  it('maps common production aliases', () => {
    expect(getEnvKind('production')).toBe('production');
    expect(getEnvKind('prod')).toBe('production');
    expect(getEnvKind('live')).toBe('production');
    expect(getEnvKind('release')).toBe('production');
  });
  it('maps common staging aliases', () => {
    expect(getEnvKind('staging')).toBe('staging');
    expect(getEnvKind('stage')).toBe('staging');
    expect(getEnvKind('uat')).toBe('staging');
    expect(getEnvKind('qa')).toBe('staging');
  });
  it('maps dev / preview / test / local aliases', () => {
    expect(getEnvKind('dev')).toBe('development');
    expect(getEnvKind('development')).toBe('development');
    expect(getEnvKind('preview')).toBe('preview');
    expect(getEnvKind('pr')).toBe('preview');
    expect(getEnvKind('test')).toBe('test');
    expect(getEnvKind('ci')).toBe('test');
    expect(getEnvKind('local')).toBe('local');
    expect(getEnvKind('localhost')).toBe('local');
  });
});

describe('getEnvLabel', () => {
  it('returns the human label for each kind', () => {
    expect(getEnvLabel('prod')).toBe('Production');
    expect(getEnvLabel('stage')).toBe('Staging');
    expect(getEnvLabel('dev')).toBe('Development');
    expect(getEnvLabel('preview')).toBe('Preview');
    expect(getEnvLabel('ci')).toBe('Test');
    expect(getEnvLabel('local')).toBe('Local');
  });
  it('returns generic "Environment" for unknown', () => {
    expect(getEnvLabel('xyz')).toBe('Environment');
  });
});

describe('getEnvBadgeClass', () => {
  it('returns a non-empty class per env', () => {
    for (const k of ENV_KINDS) {
      expect(getEnvBadgeClass(k).length).toBeGreaterThan(0);
    }
  });
  it('production uses destructive palette', () => {
    expect(getEnvBadgeClass('production')).toContain(
      'text-destructive',
    );
  });
});

describe('getEnvBannerClass', () => {
  it('returns a non-empty class per env', () => {
    for (const k of ENV_KINDS) {
      expect(getEnvBannerClass(k).length).toBeGreaterThan(0);
    }
  });
});

describe('isProductionEnv', () => {
  it('true for production aliases', () => {
    expect(isProductionEnv('prod')).toBe(true);
    expect(isProductionEnv('live')).toBe(true);
    expect(isProductionEnv('release')).toBe(true);
  });
  it('false for non-production', () => {
    expect(isProductionEnv('staging')).toBe(false);
    expect(isProductionEnv('dev')).toBe(false);
    expect(isProductionEnv(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('EnvBadge component', () => {
  it('renders a status region with default aria-label', () => {
    render(<EnvBadge env="production" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Production environment',
    );
  });

  it('honors custom ariaLabel', () => {
    render(
      <EnvBadge env="staging" ariaLabel="Current environment" />,
    );
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Current environment',
    );
  });

  it('label resolves to the env human label by default', () => {
    render(<EnvBadge env="prod" />);
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  it('custom label overrides the resolved label', () => {
    render(<EnvBadge env="prod" label="LIVE" />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('root data-env-kind reflects resolved kind', () => {
    render(<EnvBadge env="qa" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-env-kind',
      'staging',
    );
  });

  it('non-interactive when onSwitch missing', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
      />,
    );
    // no onSwitch -> renders as static span, not a button
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('non-interactive when options missing', () => {
    render(
      <EnvBadge env="production" onSwitch={() => {}} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('interactive trigger has aria-haspopup=listbox', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={() => {}}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-haspopup',
      'listbox',
    );
  });

  it('clicking the trigger opens the listbox', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('listbox renders one option per env', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
          { env: 'dev' },
        ]}
        onSwitch={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('option').length).toBe(3);
  });

  it('clicking an option fires onSwitch + closes the popover', () => {
    const onSwitch = vi.fn();
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={onSwitch}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    const opts = screen.getAllByRole('option');
    fireEvent.click(opts[1]!);
    expect(onSwitch).toHaveBeenCalledWith('staging');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('aria-selected mirrors the current env in the listbox', () => {
    render(
      <EnvBadge
        env="staging"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    const opts = screen.getAllByRole('option');
    expect(opts[0]).toHaveAttribute('aria-selected', 'false');
    expect(opts[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the open popover', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape' }),
      );
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('outside mousedown closes the open popover', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('description renders inline (non-interactive only)', () => {
    render(
      <EnvBadge
        env="production"
        description="Live customer traffic"
      />,
    );
    expect(
      screen.getByText('Live customer traffic'),
    ).toBeInTheDocument();
  });

  it('icon prop replaces the default per-kind icon', () => {
    const { container } = render(
      <EnvBadge
        env="production"
        icon={<span data-testid="custom-icon">!</span>}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    // default svg icon should not render
    expect(
      container.querySelector(
        '[data-section="env-badge-icon"] svg',
      ),
    ).toBeNull();
  });

  it('showLabel=false hides the env label', () => {
    const { container } = render(
      <EnvBadge env="production" showLabel={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="env-badge-label"]',
      ),
    ).toBeNull();
  });

  it('data-size mirrors the size prop', () => {
    render(<EnvBadge env="production" size="lg" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-size',
      'lg',
    );
  });

  it('root data-env mirrors the raw env prop', () => {
    render(<EnvBadge env="my-custom-env" />);
    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('data-env', 'my-custom-env');
    expect(root).toHaveAttribute('data-env-kind', 'unknown');
  });

  it('data-open reflects popover state', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={() => {}}
      />,
    );
    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('data-open', 'false');
    fireEvent.click(screen.getByRole('button'));
    expect(root).toHaveAttribute('data-open', 'true');
  });

  it('exposes a stable displayName', () => {
    expect(EnvBadge.displayName).toBe('EnvBadge');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<EnvBadge ref={ref} env="production" />);
    expect(ref.current?.getAttribute('role')).toBe('status');
  });

  it('exposes EnvBanner via EnvBadge.Banner', () => {
    expect(EnvBadge.Banner).toBe(EnvBanner);
  });

  it('per-option label override + description render', () => {
    render(
      <EnvBadge
        env="production"
        options={[
          {
            env: 'production',
            label: 'LIVE',
            description: 'real customers',
          },
          {
            env: 'staging',
            label: 'STG',
            description: 'internal',
          },
        ]}
        onSwitch={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('real customers')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------
// EnvBanner sub-component
// ---------------------------------------------------------------

describe('EnvBanner sub-component', () => {
  it('renders role=banner with default aria-label', () => {
    render(<EnvBadge.Banner env="production" />);
    expect(screen.getByRole('banner')).toHaveAttribute(
      'aria-label',
      'Production environment banner',
    );
  });

  it('honors custom ariaLabel on banner', () => {
    render(
      <EnvBadge.Banner
        env="staging"
        ariaLabel="env top bar"
      />,
    );
    expect(screen.getByRole('banner')).toHaveAttribute(
      'aria-label',
      'env top bar',
    );
  });

  it('renders the chip inside the banner', () => {
    const { container } = render(
      <EnvBadge.Banner env="production" />,
    );
    expect(
      container.querySelector('[data-section="env-badge"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="env-banner"]'),
    ).toBeInTheDocument();
  });

  it('description slot renders alongside the chip', () => {
    render(
      <EnvBadge.Banner
        env="production"
        description="Do not test in production"
      />,
    );
    expect(
      screen.getByText('Do not test in production'),
    ).toBeInTheDocument();
  });

  it('align reflects on data-align', () => {
    const { rerender } = render(
      <EnvBadge.Banner env="production" />,
    );
    expect(screen.getByRole('banner')).toHaveAttribute(
      'data-align',
      'left',
    );
    rerender(
      <EnvBadge.Banner env="production" align="center" />,
    );
    expect(screen.getByRole('banner')).toHaveAttribute(
      'data-align',
      'center',
    );
  });

  it('banner data-env + data-env-kind mirror state', () => {
    render(<EnvBadge.Banner env="qa" />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveAttribute('data-env', 'qa');
    expect(banner).toHaveAttribute('data-env-kind', 'staging');
  });

  it('banner background class reflects the kind', () => {
    const { container } = render(
      <EnvBadge.Banner env="production" />,
    );
    const banner = container.querySelector(
      '[data-section="env-banner"]',
    ) as HTMLElement;
    expect(banner.className).toContain('text-destructive');
  });

  it('banner forwards interactive switch when options + onSwitch supplied', () => {
    const onSwitch = vi.fn();
    render(
      <EnvBadge.Banner
        env="production"
        options={[
          { env: 'production' },
          { env: 'staging' },
        ]}
        onSwitch={onSwitch}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getAllByRole('option')[1]!);
    expect(onSwitch).toHaveBeenCalledWith('staging');
  });

  it('exposes a stable displayName', () => {
    expect(EnvBanner.displayName).toBe('EnvBanner');
  });

  it('forwards ref to the banner root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<EnvBadge.Banner ref={ref} env="production" />);
    expect(ref.current?.getAttribute('role')).toBe('banner');
  });
});
