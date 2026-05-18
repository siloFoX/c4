import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.268, TODO 11.250) Kbd primitive renders a keyboard
// shortcut chip with optional platform-aware mod-key mapping.
//
// Three call shapes:
//   1. <Kbd>?</Kbd>                            -- literal single key
//   2. <Kbd keys={['Ctrl', 'C']} />            -- explicit key array
//   3. <Kbd combo="Cmd+K" />                   -- parsed combo string;
//      modifier tokens flip to platform glyphs on mac (Cmd -> ⌘,
//      Shift -> ⇧, Alt/Option -> ⌥, Ctrl -> ⌃). Non-mac keeps the
//      tokens literal so the chip reads natively on Windows / Linux.
//      The `Mod` alias is the canonical "platform meta" token --
//      flips to ⌘ on mac, "Ctrl" on others -- so a shortcut author
//      can write `Mod+K` once and the right glyph renders everywhere.
//
// Reference: /root/c4/arps-design-system-v1/ "keyboard chip" pattern.

const KBD_BASE =
  'inline-flex items-center rounded border bg-muted text-muted-foreground font-mono';

// (v1.11.396, TODO 11.378) Size scale. Default `md` matches
// the legacy 11.250 layout byte-for-byte (`px-1.5 text-xs`).
// `sm` is a denser inline chip for menu rows / command
// palette suggestions; `lg` is a hero-strip chip for
// shortcut-overlay pages.
export type KbdSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<KbdSize, string> = {
  sm: 'px-1 text-[10px]',
  md: 'px-1.5 text-xs',
  lg: 'px-2 py-0.5 text-sm',
};

export type KbdPlatform = 'mac' | 'other';

// Mac glyphs sourced from the Apple HIG. Each modifier maps to a
// single visible character so the chip stays compact. Non-modifier
// special keys (Enter / Backspace / Escape / Tab / Space / arrow)
// also flip to glyph form on mac for visual parity with native
// system menus.
const MAC_GLYPH: Record<string, string> = {
  mod: '⌘', // U+2318 PLACE OF INTEREST SIGN ("Command")
  cmd: '⌘',
  command: '⌘',
  meta: '⌘',
  shift: '⇧', // U+21E7 UPWARDS WHITE ARROW
  alt: '⌥', // U+2325 OPTION KEY
  opt: '⌥',
  option: '⌥',
  ctrl: '⌃', // U+2303 UP ARROWHEAD ("Control")
  control: '⌃',
  enter: '↵', // U+21B5 DOWNWARDS ARROW WITH CORNER LEFTWARDS
  return: '↵',
  backspace: '⌫', // U+232B ERASE TO THE LEFT
  delete: '⌫',
  escape: '⎋', // U+238B BROKEN CIRCLE WITH NORTHWEST ARROW
  esc: '⎋',
  tab: '⇥', // U+21E5 RIGHTWARDS ARROW TO BAR
  space: '␣', // U+2423 OPEN BOX
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

// Non-mac mappings: keep the textual form, only resolve the
// platform-meta alias `Mod` to `Ctrl`.
const OTHER_LITERAL: Record<string, string> = {
  mod: 'Ctrl',
  cmd: 'Ctrl', // most non-mac users read Cmd as Ctrl
  meta: 'Ctrl',
  command: 'Ctrl',
};

export function detectPlatform(): KbdPlatform {
  if (typeof navigator === 'undefined') return 'other';
  // navigator.platform is deprecated but still set in jsdom and
  // every shipped browser. navigator.userAgentData.platform is the
  // modern replacement but jsdom doesn't expose it.
  const src =
    (typeof navigator.userAgent === 'string' ? navigator.userAgent : '') +
    ' ' +
    (typeof navigator.platform === 'string' ? navigator.platform : '');
  return /Mac|iPhone|iPad|iPod/i.test(src) ? 'mac' : 'other';
}

export function mapKey(token: string, platform: KbdPlatform): string {
  const norm = token.trim().toLowerCase();
  if (platform === 'mac' && MAC_GLYPH[norm]) return MAC_GLYPH[norm];
  if (platform === 'other' && OTHER_LITERAL[norm]) return OTHER_LITERAL[norm];
  // Preserve the original casing for non-modifier keys ("K", "A",
  // "/", "?", "Enter", "Esc"). The token stays literal so the
  // chip text reads naturally.
  return token;
}

export function parseCombo(combo: string, platform: KbdPlatform): string[] {
  return combo
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => mapKey(t, platform));
}

export interface KbdProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children?: ReactNode;
  keys?: readonly string[];
  combo?: string;
  separator?: ReactNode;
  // Test / story override. Defaults to `detectPlatform()`.
  platform?: KbdPlatform;
  // (v1.11.396, TODO 11.378) Size scale. Default `md` keeps
  // legacy byte-identical render.
  size?: KbdSize;
  className?: string;
}

export function Kbd({
  children,
  keys,
  combo,
  separator,
  platform,
  size = 'md',
  className,
  ...rest
}: KbdProps) {
  const resolvedPlatform = platform ?? detectPlatform();
  const sizeClass = SIZE_CLASS[size];
  // (v1.11.268) Mac uses no separator between glyphs (system menus
  // render the modifiers tightly). Non-mac defaults to a thin "+"
  // separator. Callers can override with the `separator` prop.
  const resolvedSeparator =
    separator !== undefined
      ? separator
      : resolvedPlatform === 'mac'
        ? ''
        : ' + ';
  // `combo` takes precedence over `keys` so a caller can drop in
  // the new shorthand without touching siblings.
  const tokens =
    combo !== undefined
      ? parseCombo(combo, resolvedPlatform)
      : keys
        ? keys.map((k) => mapKey(k, resolvedPlatform))
        : null;
  if (tokens && tokens.length > 0) {
    return (
      <span
        data-kbd
        data-platform={resolvedPlatform}
        data-size={size}
        {...rest}
      >
        {tokens.map((key, i) => (
          <Fragment key={`${key}-${i}`}>
            {i > 0 && resolvedSeparator !== '' ? (
              <span data-kbd-separator aria-hidden="true">
                {resolvedSeparator}
              </span>
            ) : null}
            <kbd
              data-size={size}
              className={cn(KBD_BASE, sizeClass, className)}
            >
              {key}
            </kbd>
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    <kbd
      data-kbd
      data-size={size}
      className={cn(KBD_BASE, sizeClass, className)}
      {...rest}
    >
      {children}
    </kbd>
  );
}

Kbd.displayName = 'Kbd';
