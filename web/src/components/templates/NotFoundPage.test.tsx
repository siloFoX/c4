import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotFoundPage } from './NotFoundPage';

describe('<NotFoundPage>', () => {
  it('renders the default title "Page not found"', () => {
    render(<NotFoundPage />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('renders the default description', () => {
    render(<NotFoundPage />);
    expect(
      screen.getByText('The page you are looking for has moved or no longer exists.'),
    ).toBeInTheDocument();
  });

  it('renders Go home anchor pointing to homeHref', () => {
    render(<NotFoundPage homeHref="/start" />);
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link.getAttribute('href')).toBe('/start');
  });

  it('defaults Go home href to "/"', () => {
    render(<NotFoundPage />);
    const link = screen.getByRole('link', { name: 'Go home' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('lets custom title and description override the defaults', () => {
    render(<NotFoundPage title="Gone" description="Vanished into the void" />);
    expect(screen.getByText('Gone')).toBeInTheDocument();
    expect(screen.getByText('Vanished into the void')).toBeInTheDocument();
  });
});
