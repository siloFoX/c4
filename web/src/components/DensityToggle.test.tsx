import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DensityToggle from './DensityToggle';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

describe('<DensityToggle>', () => {
  it('renders three group buttons in the default variant', () => {
    render(<DensityToggle />);
    expect(screen.getByTestId('density-toggle-compact')).toBeInTheDocument();
    expect(
      screen.getByTestId('density-toggle-comfortable'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('density-toggle-cozy')).toBeInTheDocument();
  });

  it('marks the currently active density with aria-pressed=true', () => {
    render(<DensityToggle />);
    expect(
      screen
        .getByTestId('density-toggle-comfortable')
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('density-toggle-compact').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('clicking a button writes the chosen density to localStorage', async () => {
    const user = userEvent.setup();
    render(<DensityToggle />);
    await user.click(screen.getByTestId('density-toggle-cozy'));
    expect(window.localStorage.getItem('c4:density')).toBe('cozy');
  });

  it('clicking a button updates the data-density attr on <html>', async () => {
    const user = userEvent.setup();
    render(<DensityToggle />);
    await user.click(screen.getByTestId('density-toggle-compact'));
    expect(document.documentElement.getAttribute('data-density')).toBe(
      'compact',
    );
  });

  it('clicking moves aria-pressed=true to the newly chosen button', async () => {
    const user = userEvent.setup();
    render(<DensityToggle />);
    await user.click(screen.getByTestId('density-toggle-cozy'));
    expect(
      screen.getByTestId('density-toggle-cozy').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByTestId('density-toggle-comfortable')
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('the group wrapper has role=group and aria-label="Density"', () => {
    render(<DensityToggle />);
    const group = screen.getByTestId('density-toggle-group');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Density');
  });

  it('compact variant renders a single cycle button', () => {
    render(<DensityToggle variant="compact" />);
    expect(screen.getByTestId('density-toggle-compact')).toBeInTheDocument();
    expect(
      screen.queryByTestId('density-toggle-comfortable'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('density-toggle-cozy')).not.toBeInTheDocument();
  });

  it('compact variant cycles comfortable -> cozy -> compact -> comfortable', async () => {
    const user = userEvent.setup();
    render(<DensityToggle variant="compact" />);
    // Start at comfortable -> click -> cozy
    await user.click(screen.getByTestId('density-toggle-compact'));
    expect(window.localStorage.getItem('c4:density')).toBe('cozy');
    // From cozy -> click -> compact
    await user.click(screen.getByTestId('density-toggle-compact'));
    expect(window.localStorage.getItem('c4:density')).toBe('compact');
    // From compact -> click -> comfortable
    await user.click(screen.getByTestId('density-toggle-compact'));
    expect(window.localStorage.getItem('c4:density')).toBe('comfortable');
  });

  it('forwards a className override to the group wrapper', () => {
    render(<DensityToggle className="my-toggle" />);
    expect(screen.getByTestId('density-toggle-group').className).toContain(
      'my-toggle',
    );
  });

  it('hydrates the active state from localStorage on mount', () => {
    window.localStorage.setItem('c4:density', 'cozy');
    render(<DensityToggle />);
    expect(
      screen.getByTestId('density-toggle-cozy').getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
