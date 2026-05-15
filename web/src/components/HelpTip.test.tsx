import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpTip, { renderInlineMarkdown } from './HelpTip';

describe('renderInlineMarkdown', () => {
  it('returns the empty string when given an empty input', () => {
    expect(renderInlineMarkdown('')).toBe('');
  });

  it('renders plain text verbatim', () => {
    const { container } = render(
      <span>{renderInlineMarkdown('hello world')}</span>,
    );
    expect(container.textContent).toBe('hello world');
  });

  it('renders **bold** as <strong>', () => {
    const { container } = render(
      <span>{renderInlineMarkdown('this is **bold** text')}</span>,
    );
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('bold');
    expect(container.textContent).toBe('this is bold text');
  });

  it('renders *italic* as <em>', () => {
    const { container } = render(
      <span>{renderInlineMarkdown('this is *italic* text')}</span>,
    );
    const em = container.querySelector('em');
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe('italic');
  });

  it('renders `code` as a styled <code> span', () => {
    const { container } = render(
      <span>{renderInlineMarkdown('the `flag` key')}</span>,
    );
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('flag');
  });

  it('keeps **bold** inside `code` literal (code outranks bold)', () => {
    const { container } = render(
      <span>{renderInlineMarkdown('`**not bold**`')}</span>,
    );
    const code = container.querySelector('code');
    expect(code!.textContent).toBe('**not bold**');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('renders [label](https://...) as a safe outbound <a>', () => {
    const { container } = render(
      <span>
        {renderInlineMarkdown('see [the docs](https://example.com/x)')}
      </span>,
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('https://example.com/x');
    expect(a!.getAttribute('target')).toBe('_blank');
    expect(a!.getAttribute('rel')).toContain('noreferrer');
    expect(a!.getAttribute('rel')).toContain('noopener');
  });

  it('accepts relative and hash-anchor links without target=_blank', () => {
    const { container: a } = render(
      <span>{renderInlineMarkdown('[home](/dashboard)')}</span>,
    );
    expect(a.querySelector('a')!.getAttribute('href')).toBe('/dashboard');
    expect(a.querySelector('a')!.getAttribute('target')).toBeNull();
    const { container: b } = render(
      <span>{renderInlineMarkdown('[skip](#main)')}</span>,
    );
    expect(b.querySelector('a')!.getAttribute('href')).toBe('#main');
    expect(b.querySelector('a')!.getAttribute('target')).toBeNull();
  });

  it('strips the link tag for unsafe URL schemes (javascript:, data:)', () => {
    const { container } = render(
      <span>
        {renderInlineMarkdown('see [xss](javascript:alert) here')}
      </span>,
    );
    // The safety contract: no <a> rendered, no href leak. The
    // label text passes through as plain text (no XSS surface).
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('xss');
    expect(container.textContent).not.toContain('javascript:');
  });

  it('strips the link tag for data: scheme as well', () => {
    const { container } = render(
      <span>
        {renderInlineMarkdown('[pkt](data:text/html,malicious)')}
      </span>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toContain('data:');
  });

  it('composes bold + italic + code in the same string', () => {
    const { container } = render(
      <span>
        {renderInlineMarkdown('the `flag` is **on** by *default*')}
      </span>,
    );
    expect(container.querySelector('code')!.textContent).toBe('flag');
    expect(container.querySelector('strong')!.textContent).toBe('on');
    expect(container.querySelector('em')!.textContent).toBe('default');
  });
});

describe('<HelpTip>', () => {
  it('renders the HelpCircle icon trigger', () => {
    render(<HelpTip content="hello" />);
    const trigger = screen.getByTestId('help-tip');
    expect(trigger).toBeInTheDocument();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.querySelector('svg')).not.toBeNull();
  });

  it('marks the trigger with a default aria-label="Help"', () => {
    render(<HelpTip content="hello" />);
    expect(
      screen.getByTestId('help-tip').getAttribute('aria-label'),
    ).toBe('Help');
  });

  it('forwards a custom ariaLabel prop to the trigger', () => {
    render(<HelpTip content="hello" ariaLabel="Help for foo" />);
    expect(
      screen.getByTestId('help-tip').getAttribute('aria-label'),
    ).toBe('Help for foo');
  });

  it('exposes the help text as the tooltip body on hover', async () => {
    const user = userEvent.setup();
    render(<HelpTip content="explains the row" />);
    await user.hover(screen.getByTestId('help-tip'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('explains the row');
  });

  it('renders parsed markdown inside the tooltip body', async () => {
    const user = userEvent.setup();
    render(<HelpTip content="press **Enter** to commit" />);
    await user.hover(screen.getByTestId('help-tip'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.querySelector('strong')).not.toBeNull();
    expect(tooltip.querySelector('strong')!.textContent).toBe('Enter');
  });

  it('renders verbatim children when both content + children are supplied (children wins)', async () => {
    const user = userEvent.setup();
    render(
      <HelpTip content="ignored">
        <span data-testid="custom-body">custom layout</span>
      </HelpTip>,
    );
    await user.hover(screen.getByTestId('help-tip'));
    expect(screen.getByTestId('custom-body')).toBeInTheDocument();
  });

  it('returns null when neither content nor children are provided', () => {
    const { container } = render(<HelpTip />);
    expect(container.firstChild).toBeNull();
  });

  it('supports a custom data-testid override', () => {
    render(<HelpTip content="hello" data-testid="my-help" />);
    expect(screen.getByTestId('my-help')).toBeInTheDocument();
  });

  it('tags the root with data-section="help-tip" for e2e selectors', () => {
    render(<HelpTip content="hello" />);
    expect(
      document.querySelector('[data-section="help-tip"]'),
    ).not.toBeNull();
  });

  it('size="md" renders a larger icon', () => {
    const { rerender } = render(<HelpTip content="x" size="sm" />);
    const small =
      screen.getByTestId('help-tip').querySelector('svg')!.getAttribute(
        'class',
      ) ?? '';
    rerender(<HelpTip content="x" size="md" />);
    const big =
      screen.getByTestId('help-tip').querySelector('svg')!.getAttribute(
        'class',
      ) ?? '';
    expect(small).toContain('h-3');
    expect(big).toContain('h-4');
  });
});
