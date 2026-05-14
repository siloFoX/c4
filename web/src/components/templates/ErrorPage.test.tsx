import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorPage } from './ErrorPage';

describe('<ErrorPage>', () => {
  it('renders default title and description', () => {
    render(<ErrorPage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred. Try again, or head back home.'),
    ).toBeInTheDocument();
  });

  it('shows error.message when an Error is provided', () => {
    render(<ErrorPage error={new Error('Boom failed')} />);
    expect(screen.getByText('Boom failed')).toBeInTheDocument();
  });

  it('omits the error alert when no error is provided', () => {
    const { container } = render(<ErrorPage />);
    // role="alert" is on the outer wrapper too, so check for two alerts only when error present.
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
  });

  it('shows the error alert in addition to the wrapper when an error is provided', () => {
    const { container } = render(<ErrorPage error={new Error('Kaboom')} />);
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(2);
  });

  it('calls resetError when "Try again" is clicked', () => {
    const reset = vi.fn();
    render(<ErrorPage resetError={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('omits the Try again button when resetError is not provided', () => {
    render(<ErrorPage />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('renders Go home anchor pointing to homeHref', () => {
    render(<ErrorPage homeHref="/dashboard" />);
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('defaults Go home href to "/" when homeHref is omitted', () => {
    render(<ErrorPage />);
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('lets custom title and description override the defaults', () => {
    render(<ErrorPage title="Boom" description="Service offline" />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByText('Service offline')).toBeInTheDocument();
  });

  it('handles string-shaped errors', () => {
    render(<ErrorPage error="raw failure" />);
    expect(screen.getByText('raw failure')).toBeInTheDocument();
  });
});
