import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  NavigationMenu,
  computeNavPanelOffset,
} from './navigation-menu';
import type { NavigationMenuItem } from './navigation-menu';

function makeItems(): NavigationMenuItem[] {
  return [
    {
      id: 'products',
      label: 'Products',
      sections: [
        {
          id: 'core',
          heading: 'Core',
          links: [
            { id: 'workers', label: 'Workers', href: '/workers' },
            { id: 'queues', label: 'Queues', href: '/queues' },
          ],
        },
        {
          id: 'addons',
          heading: 'Add-ons',
          links: [
            { id: 'specialist', label: 'Specialist', href: '/specialist' },
          ],
        },
      ],
    },
    {
      id: 'solutions',
      label: 'Solutions',
      sections: [
        {
          id: 'sol',
          links: [
            { id: 'teams', label: 'Teams', href: '/teams' },
            { id: 'devops', label: 'DevOps', href: '/devops' },
          ],
        },
      ],
    },
    { id: 'pricing', label: 'Pricing', href: '/pricing' },
    { id: 'docs', label: 'Docs', href: '/docs', disabled: true },
  ];
}

describe('computeNavPanelOffset()', () => {
  it('returns 0 when the panel fits to the right of the trigger', () => {
    expect(computeNavPanelOffset(100, 300, 1024)).toBe(0);
  });

  it('returns a negative shift when the panel overflows', () => {
    // trigger at 800, panel 300px wide, viewport 1000 -> overflow=100 -> shift -100
    expect(computeNavPanelOffset(800, 300, 1000)).toBe(-100);
  });

  it('caps the shift so the leading edge stays in viewport', () => {
    // trigger at 50, panel 600px wide, viewport 500 -> overflow=150
    // but cap at -triggerLeft (-50) so panel left does not go negative-of-zero.
    expect(computeNavPanelOffset(50, 600, 500)).toBe(-50);
  });
});

describe('<NavigationMenu>', () => {
  it('renders nav element with default aria-label "Site navigation"', () => {
    render(<NavigationMenu items={makeItems()} />);
    expect(
      screen.getByRole('navigation', { name: 'Site navigation' }),
    ).toBeInTheDocument();
  });

  it('aria-label override threads through', () => {
    render(<NavigationMenu items={makeItems()} ariaLabel="Top nav" />);
    expect(
      screen.getByRole('navigation', { name: 'Top nav' }),
    ).toBeInTheDocument();
  });

  it('one item per trigger (sub-menu items use button, link items use a)', () => {
    render(<NavigationMenu items={makeItems()} />);
    const items = document.querySelectorAll(
      '[data-section="nav-menu-item"]',
    );
    expect(items).toHaveLength(4);
    // products / solutions have sub-menus -> button triggers.
    const productsBtn = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    );
    expect(productsBtn?.tagName).toBe('BUTTON');
    const pricingLink = document.querySelector(
      '[data-nav-menu-trigger="pricing"]',
    );
    expect(pricingLink?.tagName).toBe('A');
  });

  it('roving tabindex: only first enabled trigger has tabindex=0', () => {
    render(<NavigationMenu items={makeItems()} />);
    const triggers = document.querySelectorAll(
      '[data-section="nav-menu-trigger"]',
    );
    expect(triggers[0]!.getAttribute('tabindex')).toBe('0');
    expect(triggers[1]!.getAttribute('tabindex')).toBe('-1');
  });

  it('clicking a sub-menu trigger opens its panel', () => {
    render(<NavigationMenu items={makeItems()} />);
    const trigger = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the same trigger again toggles it closed', () => {
    render(<NavigationMenu items={makeItems()} />);
    const trigger = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).toBeNull();
  });

  it('sections with 2+ render as a mega panel (multi-column)', () => {
    render(<NavigationMenu items={makeItems()} />);
    const trigger = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="nav-menu-mega"]'),
    ).not.toBeNull();
  });

  it('mega panel exposes data-is-mega="true"', () => {
    render(<NavigationMenu items={makeItems()} />);
    const trigger = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    const mega = document.querySelector(
      '[data-section="nav-menu-mega"]',
    ) as HTMLElement;
    expect(mega.getAttribute('data-is-mega')).toBe('true');
  });

  it('single-section sub-menu renders as a list panel (not mega)', () => {
    render(<NavigationMenu items={makeItems()} />);
    const trigger = document.querySelector(
      '[data-nav-menu-trigger="solutions"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="nav-menu-panel-list"]'),
    ).not.toBeNull();
  });

  it('renders section heading + links inside the panel', () => {
    render(<NavigationMenu items={makeItems()} />);
    const trigger = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(
      document.querySelector('[data-section="nav-menu-section-heading"]'),
    ).toHaveTextContent('Core');
    expect(
      document.querySelector('[data-nav-menu-link="workers"]'),
    ).toHaveTextContent('Workers');
  });

  it('external link gets target=_blank + rel + ExternalLink glyph', () => {
    const items: NavigationMenuItem[] = [
      {
        id: 'community',
        label: 'Community',
        sections: [
          {
            id: 'main',
            links: [
              {
                id: 'discord',
                label: 'Discord',
                href: 'https://discord.gg/x',
                external: true,
              },
            ],
          },
        ],
      },
    ];
    render(<NavigationMenu items={items} />);
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="community"]',
      ) as HTMLButtonElement,
    );
    const link = document.querySelector(
      '[data-nav-menu-link="discord"]',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('direct-link top-level item (no sub-menu) is an anchor', () => {
    render(<NavigationMenu items={makeItems()} />);
    const pricing = document.querySelector(
      '[data-nav-menu-trigger="pricing"]',
    ) as HTMLAnchorElement;
    expect(pricing.tagName).toBe('A');
    expect(pricing.getAttribute('href')).toBe('/pricing');
  });

  it('custom content slot renders verbatim inside the panel', () => {
    const items: NavigationMenuItem[] = [
      {
        id: 'featured',
        label: 'Featured',
        content: <div data-testid="custom-panel">CUSTOM</div>,
      },
    ];
    render(<NavigationMenu items={items} />);
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="featured"]',
      ) as HTMLButtonElement,
    );
    expect(
      document.querySelector('[data-section="nav-menu-panel-content"]'),
    ).not.toBeNull();
    expect(screen.getByTestId('custom-panel')).toHaveTextContent('CUSTOM');
  });

  it('ArrowRight on focused trigger moves focus to next enabled trigger', () => {
    render(<NavigationMenu items={makeItems()} />);
    const products = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    products.focus();
    fireEvent.keyDown(products, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(
      document.querySelector('[data-nav-menu-trigger="solutions"]'),
    );
  });

  it('ArrowRight skips disabled triggers', () => {
    render(<NavigationMenu items={makeItems()} />);
    const pricing = document.querySelector(
      '[data-nav-menu-trigger="pricing"]',
    ) as HTMLAnchorElement;
    // Anchors with tabIndex=-1 in jsdom may not fire native
    // focus event; use fireEvent.focus to seed focusIndex
    // explicitly via React's onFocus handler.
    fireEvent.focus(pricing);
    fireEvent.keyDown(pricing, { key: 'ArrowRight' });
    // docs is disabled -> wraps to products.
    expect(document.activeElement).toBe(
      document.querySelector('[data-nav-menu-trigger="products"]'),
    );
  });

  it('ArrowDown on a focused sub-menu trigger opens its panel', () => {
    render(<NavigationMenu items={makeItems()} />);
    const products = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    products.focus();
    fireEvent.keyDown(products, { key: 'ArrowDown' });
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).not.toBeNull();
  });

  it('Enter / Space on a focused sub-menu trigger opens its panel', () => {
    render(<NavigationMenu items={makeItems()} />);
    const products = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    products.focus();
    fireEvent.keyDown(products, { key: 'Enter' });
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).not.toBeNull();
  });

  it('Home / End on a focused trigger jump to first / last enabled', () => {
    render(<NavigationMenu items={makeItems()} />);
    const products = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    products.focus();
    fireEvent.keyDown(products, { key: 'End' });
    // docs is disabled -> last enabled is pricing.
    expect(document.activeElement).toBe(
      document.querySelector('[data-nav-menu-trigger="pricing"]'),
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(
      document.querySelector('[data-nav-menu-trigger="products"]'),
    );
  });

  it('Escape closes the open panel + restores focus to trigger', () => {
    render(<NavigationMenu items={makeItems()} />);
    const products = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    fireEvent.click(products);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).toBeNull();
  });

  it('clicking outside the nav closes the open panel', () => {
    render(<NavigationMenu items={makeItems()} />);
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="products"]',
      ) as HTMLButtonElement,
    );
    fireEvent.mouseDown(document.body);
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).toBeNull();
  });

  it('hovering a sibling trigger swaps the open panel', () => {
    render(<NavigationMenu items={makeItems()} />);
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="products"]',
      ) as HTMLButtonElement,
    );
    fireEvent.mouseEnter(
      document.querySelector(
        '[data-nav-menu-trigger="solutions"]',
      ) as HTMLButtonElement,
    );
    expect(
      document.querySelector('[data-nav-menu-panel="solutions"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-nav-menu-panel="products"]'),
    ).toBeNull();
  });

  it('hover does NOT auto-open when nothing is open yet', () => {
    render(<NavigationMenu items={makeItems()} />);
    fireEvent.mouseEnter(
      document.querySelector(
        '[data-nav-menu-trigger="products"]',
      ) as HTMLButtonElement,
    );
    expect(
      document.querySelector('[data-section="nav-menu-panel"]'),
    ).toBeNull();
  });

  it('aria-haspopup="menu" + aria-controls + aria-expanded on sub-menu triggers', () => {
    render(<NavigationMenu items={makeItems()} />);
    const products = document.querySelector(
      '[data-nav-menu-trigger="products"]',
    ) as HTMLButtonElement;
    expect(products.getAttribute('aria-haspopup')).toBe('menu');
    expect(products.getAttribute('aria-expanded')).toBe('false');
    expect(products.getAttribute('aria-controls')).toBeTruthy();
  });

  it('panel role="menu" + aria-labelledby + aria-orientation=vertical', () => {
    render(<NavigationMenu items={makeItems()} />);
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="products"]',
      ) as HTMLButtonElement,
    );
    const panel = document.querySelector(
      '[data-section="nav-menu-panel"]',
    ) as HTMLElement;
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.getAttribute('aria-orientation')).toBe('vertical');
    expect(panel.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('data-nav-menu-open mirrors per-item open state', () => {
    render(<NavigationMenu items={makeItems()} />);
    const productsItem = document.querySelector(
      '[data-nav-menu-item="products"]',
    ) as HTMLElement;
    expect(productsItem.getAttribute('data-nav-menu-open')).toBe('false');
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="products"]',
      ) as HTMLButtonElement,
    );
    expect(productsItem.getAttribute('data-nav-menu-open')).toBe('true');
  });

  it('disabled top-level link does NOT receive focus on ArrowRight', () => {
    render(<NavigationMenu items={makeItems()} />);
    const pricing = document.querySelector(
      '[data-nav-menu-trigger="pricing"]',
    ) as HTMLAnchorElement;
    pricing.focus();
    fireEvent.keyDown(pricing, { key: 'ArrowRight' });
    // Skips docs (disabled) -> wraps to products.
    expect(document.activeElement).not.toBe(
      document.querySelector('[data-nav-menu-trigger="docs"]'),
    );
  });

  it('exposes a stable displayName for devtools', () => {
    expect(NavigationMenu.displayName).toBe('NavigationMenu');
  });

  it('panelMinWidth override applies as inline style', () => {
    const items: NavigationMenuItem[] = [
      {
        id: 'one',
        label: 'One',
        panelMinWidth: 400,
        sections: [
          {
            id: 'main',
            links: [{ id: 'a', label: 'A', href: '/a' }],
          },
        ],
      },
    ];
    render(<NavigationMenu items={items} />);
    fireEvent.click(
      document.querySelector(
        '[data-nav-menu-trigger="one"]',
      ) as HTMLButtonElement,
    );
    const panel = document.querySelector(
      '[data-section="nav-menu-panel"]',
    ) as HTMLElement;
    expect(panel.style.minWidth).toBe('400px');
  });

  it('forwards data-testid onto the nav root', () => {
    render(
      <NavigationMenu items={makeItems()} data-testid="main-nav" />,
    );
    expect(screen.getByTestId('main-nav')).toBeInTheDocument();
  });
});
