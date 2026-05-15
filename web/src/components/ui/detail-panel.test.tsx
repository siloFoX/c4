import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanel, DetailPanelBody, DetailPanelFooter } from './detail-panel';

describe('<DetailPanel>', () => {
  it('renders nothing when open=false', () => {
    render(
      <DetailPanel open={false} onOpenChange={vi.fn()}>
        body
      </DetailPanel>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the inner Drawer dialog when open=true', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()} title="Title">
        body
      </DetailPanel>,
    );
    expect(screen.getByRole('dialog', { name: 'Title' })).toBeInTheDocument();
  });

  it('exposes data-section="detail-panel" on the root', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()}>
        body
      </DetailPanel>,
    );
    expect(
      document.querySelector('[data-section="detail-panel"]'),
    ).not.toBeNull();
  });

  it('places the flat-prop footer below the body with a top border', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()} footer={<button>Save</button>}>
        body content
      </DetailPanel>,
    );
    const footer = document.querySelector(
      '[data-detail-panel-section="footer"]',
    );
    expect(footer).not.toBeNull();
    expect(footer!.className).toContain('border-t');
    expect(footer!.textContent).toContain('Save');
  });

  it('omits the footer wrapper entirely when no footer is supplied', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()}>
        body content
      </DetailPanel>,
    );
    expect(
      document.querySelector('[data-detail-panel-section="footer"]'),
    ).toBeNull();
  });

  it('routes compound DetailPanel.Body content into the body slot', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()}>
        <DetailPanelBody>
          <span data-testid="body-payload">compound body</span>
        </DetailPanelBody>
      </DetailPanel>,
    );
    const body = document.querySelector(
      '[data-detail-panel-section="body"]',
    );
    expect(body).not.toBeNull();
    expect(body!.textContent).toContain('compound body');
    expect(screen.getByTestId('body-payload')).toBeInTheDocument();
  });

  it('routes compound DetailPanel.Footer content into the footer slot', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()}>
        <DetailPanelBody>body</DetailPanelBody>
        <DetailPanelFooter>
          <button data-testid="compound-footer">Done</button>
        </DetailPanelFooter>
      </DetailPanel>,
    );
    expect(screen.getByTestId('compound-footer')).toBeInTheDocument();
    const footer = document.querySelector(
      '[data-detail-panel-section="footer"]',
    );
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain('Done');
  });

  it('children outside compound slots fall back into the body', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()}>
        <p data-testid="loose-child">loose</p>
        <DetailPanelFooter>
          <button>Save</button>
        </DetailPanelFooter>
      </DetailPanel>,
    );
    const body = document.querySelector(
      '[data-detail-panel-section="body"]',
    );
    expect(body!.textContent).toContain('loose');
    expect(
      document.querySelector('[data-detail-panel-section="footer"]')!
        .textContent,
    ).toContain('Save');
  });

  it('attaches the .Body + .Footer compound members on the root export', () => {
    expect(DetailPanel.Body).toBe(DetailPanelBody);
    expect(DetailPanel.Footer).toBe(DetailPanelFooter);
  });

  it('forwards the data-testid prop to the root', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()} data-testid="my-detail">
        body
      </DetailPanel>,
    );
    expect(screen.getByTestId('my-detail')).toBeInTheDocument();
  });

  it('fires onOpenChange(false) when the X button is clicked', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DetailPanel open onOpenChange={onOpenChange} title="t">
        body
      </DetailPanel>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('passes width through to the inner Drawer panel style', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()} width={520}>
        body
      </DetailPanel>,
    );
    const panel = screen.getByRole('dialog');
    expect((panel as HTMLElement).style.width).toBe('520px');
  });

  it('renders on the left side when side="left"', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()} side="left">
        body
      </DetailPanel>,
    );
    expect(screen.getByRole('dialog').getAttribute('data-drawer-side')).toBe(
      'left',
    );
  });

  it('renders the description below the title in the Drawer header', () => {
    render(
      <DetailPanel
        open
        onOpenChange={vi.fn()}
        title="Worker auto-w1"
        description="branch c4/auto-foo"
      >
        body
      </DetailPanel>,
    );
    expect(screen.getByText('Worker auto-w1')).toBeInTheDocument();
    expect(screen.getByText('branch c4/auto-foo')).toBeInTheDocument();
  });

  it('body slot keeps a `flex-1 overflow-y-auto` class so long content scrolls', () => {
    render(
      <DetailPanel open onOpenChange={vi.fn()}>
        body
      </DetailPanel>,
    );
    const body = document.querySelector('[data-detail-panel-section="body"]')!;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('flex-1');
  });
});
