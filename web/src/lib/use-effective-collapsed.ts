import { useEffect, useState } from 'react';

// (v1.10.689) Extracted from layout/Sidebar. Mobile
// breakpoint guard for the sidebar's collapsed flag.
// Without this, a previously-collapsed-on-desktop
// session reopened on a phone would render an empty
// aside (logo only). At widths below the 768px md
// breakpoint, the collapsed flag is treated as false.

export function useEffectiveCollapsed(collapsed: boolean): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return collapsed && isDesktop;
}
