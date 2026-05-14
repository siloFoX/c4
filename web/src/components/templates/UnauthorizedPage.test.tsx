import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnauthorizedPage } from './UnauthorizedPage';

describe('<UnauthorizedPage>', () => {
  it('renders the default title "Unauthorized"', () => {
    render(<UnauthorizedPage />);
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('renders the default description', () => {
    render(<UnauthorizedPage />);
    expect(
      screen.getByText('You do not have permission to view this page.'),
    ).toBeInTheDocument();
  });

  it('renders Sign in anchor pointing to signInHref', () => {
    render(<UnauthorizedPage signInHref="/auth/login" />);
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/auth/login');
  });

  it('defaults Sign in href to "/login"', () => {
    render(<UnauthorizedPage />);
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('renders Go home anchor pointing to homeHref', () => {
    render(<UnauthorizedPage homeHref="/start" />);
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link.getAttribute('href')).toBe('/start');
  });

  it('defaults Go home href to "/"', () => {
    render(<UnauthorizedPage />);
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('lets custom title and description override the defaults', () => {
    render(<UnauthorizedPage title="No access" description="Members only" />);
    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.getByText('Members only')).toBeInTheDocument();
  });
});
