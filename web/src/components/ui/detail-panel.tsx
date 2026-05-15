import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Drawer, type DrawerSide } from './drawer';
import { cn } from '../../lib/cn';

// (v1.11.265, TODO 11.247) DetailPanel slide-in. Thin wrapper over
// the existing Drawer primitive that adds two missing pieces:
//   - A pinned footer slot for action rows (Save / Cancel / Open
//     in full view / Copy link / Close). Drawer's built-in body
//     scrolls; the footer stays anchored at the bottom edge.
//   - A compound API (`<DetailPanel.Body>` / `<DetailPanel.Footer>`)
//     so callers can spread the slide-in layout across components
//     without prop-drilling. The flat API still works (`footer`
//     prop + children as body) so simple call sites stay terse.
//
// Reference: /root/c4/arps-design-system-v1/USAGE.md "detail panel"
// pattern -- header at the top, scrollable body in the middle,
// pinned footer with action buttons at the bottom.
//
// The Drawer primitive already owns:
//   - portal mount
//   - focus trap
//   - Escape-to-close (gated by `closeOnEsc`)
//   - backdrop click-to-close (gated by `closeOnBackdropClick`)
//   - title + description aria wiring
//   - sliding transition (motion-duration-normal, ease-standard)
//
// DetailPanel only adds the footer slot + compound surface. The
// body and footer split happens via inner flexbox: the body gets
// `flex-1 overflow-y-auto`, the footer gets a fixed-height row
// with `border-t border-border`.

export interface DetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: DrawerSide;
  width?: number | string;
  title?: ReactNode;
  description?: ReactNode;
  // Pinned bottom strip. Renders below the scrollable body with a
  // top border. Use for action buttons / inline status copy / a
  // "Open in full view" link, etc. Omit to use Drawer's default
  // (no footer; the body fills the whole content area).
  footer?: ReactNode;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  // Body content. When `<DetailPanel.Body>` is used as a child
  // instead, the flat `children` prop is ignored.
  children?: ReactNode;
  bodyClassName?: string;
  footerClassName?: string;
  'data-testid'?: string;
}

// ===== Compound slot markers ============================================

const BODY_TYPE = Symbol('DetailPanelBody');
const FOOTER_TYPE = Symbol('DetailPanelFooter');

interface SlotProps {
  children?: ReactNode;
  className?: string;
}

function DetailPanelBodyComponent({ children, className }: SlotProps) {
  return (
    <div data-detail-panel-slot="body" className={className}>
      {children}
    </div>
  );
}
(DetailPanelBodyComponent as unknown as { __type: symbol }).__type = BODY_TYPE;

function DetailPanelFooterComponent({ children, className }: SlotProps) {
  return (
    <div data-detail-panel-slot="footer" className={className}>
      {children}
    </div>
  );
}
(DetailPanelFooterComponent as unknown as { __type: symbol }).__type = FOOTER_TYPE;

// Walk the children array looking for slot components by their
// hidden __type marker. Returns the matching subtree as ReactNode,
// or null when no slot of that kind was passed. Any non-slot
// children fall back into the body via the `rest` accumulator.
function partitionSlots(children: ReactNode): {
  body: ReactNode;
  footer: ReactNode;
} {
  let body: ReactNode = null;
  let footer: ReactNode = null;
  const rest: ReactNode[] = [];
  const walk = (arr: ReactNode) => {
    if (!arr) return;
    if (Array.isArray(arr)) {
      for (const c of arr) walk(c);
      return;
    }
    if (
      typeof arr === 'object' &&
      'type' in (arr as object) &&
      (arr as { type: unknown }).type !== null &&
      typeof (arr as { type: unknown }).type === 'function' &&
      (
        (arr as { type: { __type?: symbol } }).type.__type === BODY_TYPE ||
        (arr as { type: { __type?: symbol } }).type.__type === FOOTER_TYPE
      )
    ) {
      const t = (arr as { type: { __type: symbol } }).type.__type;
      if (t === BODY_TYPE) body = arr;
      else if (t === FOOTER_TYPE) footer = arr;
      return;
    }
    rest.push(arr);
  };
  walk(children);
  if (body === null && rest.length > 0) {
    body = <Fragment>{rest}</Fragment>;
  }
  return { body, footer };
}

// ===== Root component ==================================================

function DetailPanelRoot({
  open,
  onOpenChange,
  side = 'right',
  width = '420px',
  title,
  description,
  footer,
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  className,
  children,
  bodyClassName,
  footerClassName,
  'data-testid': testId,
}: DetailPanelProps) {
  // Resolve compound slots first; fall back to flat props.
  const slots = partitionSlots(children);
  const bodyContent = slots.body ?? children ?? null;
  const footerContent = slots.footer ?? (footer !== undefined ? footer : null);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side={side}
      width={width}
      title={title}
      description={description}
      showCloseButton={showCloseButton}
      closeOnBackdropClick={closeOnBackdropClick}
      closeOnEsc={closeOnEsc}
      className={cn('detail-panel-root', className)}
    >
      {/* Render the body + footer inside Drawer's content slot.
          Drawer wraps children in `flex-1 overflow-y-auto p-4`, so
          we use a negative outer padding wrapper to take the body
          + footer out of that wrapper and into our own
          flex-column layout. */}
      <div
        data-section="detail-panel"
        {...(testId ? { 'data-testid': testId } : {})}
        className="-m-4 flex h-full min-h-0 flex-col"
      >
        <div
          data-detail-panel-section="body"
          className={cn('min-h-0 flex-1 overflow-y-auto p-4', bodyClassName)}
        >
          {bodyContent}
        </div>
        {footerContent !== null && (
          <div
            data-detail-panel-section="footer"
            className={cn(
              'shrink-0 border-t border-border bg-card px-4 py-3',
              footerClassName,
            )}
          >
            {footerContent}
          </div>
        )}
      </div>
    </Drawer>
  );
}

// Compound API attached to the root export. Callers can spread the
// layout across files via `<DetailPanel.Body>` + `<DetailPanel.Footer>`
// child elements; the root walks the tree and pulls them out.
export interface DetailPanelCompound {
  (props: DetailPanelProps): JSX.Element;
  Body: typeof DetailPanelBodyComponent;
  Footer: typeof DetailPanelFooterComponent;
}

const DetailPanel = DetailPanelRoot as unknown as DetailPanelCompound;
DetailPanel.Body = DetailPanelBodyComponent;
DetailPanel.Footer = DetailPanelFooterComponent;

(DetailPanel as unknown as { displayName: string }).displayName = 'DetailPanel';

export { DetailPanel };
export const DetailPanelBody = DetailPanelBodyComponent;
export const DetailPanelFooter = DetailPanelFooterComponent;
