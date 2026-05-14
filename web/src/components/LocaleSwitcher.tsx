// (11.201) LocaleSwitcher -- dropdown for flipping the active UI
// locale. Replaces the inline Languages IconButton in AppHeader so
// the menu surface matches AccountMenu / theme picker conventions
// instead of cycling EN -> KO on every click.
//
// Reuses the hand-rolled DropdownMenu primitive (Trigger + Content +
// Item), the existing useLocale() hook, and setLocale() from
// lib/i18n. setLocale already writes localStorage + dispatches the
// c4:locale-changed CustomEvent, which useLocale subscribes to, so
// no page reload is needed for the bundle swap -- every mounted
// component re-renders via the shared hook.
//
// Trigger surface: Globe icon + current locale code (EN/KO) +
// chevron-down. The locale code stays uppercase ASCII so the trigger
// width is stable across both locales.
//
// Menu items: native names ("English", "한국어") so a user landing
// in the wrong locale can still recognise their language. The active
// row carries a Check icon in the hint slot and aria-checked="true";
// the DropdownMenu primitive doesn't model radio groups itself so we
// project the state onto its existing aria + hint slots.

import { Check, ChevronDown, Globe } from 'lucide-react';
import { DropdownMenu, type DropdownMenuItem } from './ui/dropdown-menu';
import { Button } from './ui/button';
import {
  LOCALES,
  setLocale,
  t,
  useLocale,
  type Locale,
} from '../lib/i18n';

// Native names so the menu is readable regardless of the currently
// active locale. Exported so tests can source-grep without
// duplicating the string literals.
export const LOCALE_NATIVE_LABELS: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
};

// Exported aria-label for the trigger so the test can target the
// button without depending on i18n state.
export const LOCALE_SWITCHER_ARIA = 'common.language';

interface LocaleSwitcherProps {
  // Optional class hook so the AppHeader can tune sizing if needed.
  className?: string;
}

export default function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  // Subscribe to locale changes so the trigger label + check mark
  // re-render when setLocale fires the c4:locale-changed event.
  const current = useLocale();

  const items: DropdownMenuItem[] = LOCALES.map((code) => {
    const active = code === current;
    return {
      key: code,
      label: LOCALE_NATIVE_LABELS[code],
      // Selecting the active locale is a no-op (setLocale would still
      // dispatch the event, which causes unnecessary re-renders);
      // guard at the callsite instead of changing setLocale semantics.
      onSelect: () => {
        if (active) return;
        setLocale(code);
      },
      hint: active ? (
        <Check
          aria-hidden="true"
          data-testid={`locale-check-${code}`}
          className="h-4 w-4 text-foreground"
        />
      ) : undefined,
    };
  });

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 px-2"
      aria-label={t(LOCALE_SWITCHER_ARIA)}
      data-locale={current}
    >
      <Globe aria-hidden="true" className="h-4 w-4" />
      <span className="text-[11px] font-semibold uppercase">{current}</span>
      <ChevronDown aria-hidden="true" className="h-3 w-3 opacity-70" />
    </Button>
  );

  return (
    <DropdownMenu
      trigger={trigger}
      items={items}
      placement="bottom"
      ariaLabel={t(LOCALE_SWITCHER_ARIA)}
      className={className}
    />
  );
}
