// (TODO 8.40) Source-grep tests for the sidebar collapse contract:
// new preference key, Sidebar prop wiring, App.tsx Ctrl+B handler,
// KeyboardShortcutsModal entry, i18n keys.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PREFS = path.join(ROOT, 'web/src/lib/preferences.ts');
const SIDEBAR = path.join(ROOT, 'web/src/components/layout/Sidebar.tsx');
const APP = path.join(ROOT, 'web/src/App.tsx');
const SHORTCUTS = path.join(ROOT, 'web/src/components/KeyboardShortcutsModal.tsx');
const I18N_EN = path.join(ROOT, 'web/src/i18n/en.json');
const I18N_KO = path.join(ROOT, 'web/src/i18n/ko.json');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('preferences.ts adds sidebarCollapsed key', () => {
  const src = readText(PREFS);

  it('exports SIDEBAR_COLLAPSED_KEY = c4.sidebar.collapsed', () => {
    assert.match(src, /SIDEBAR_COLLAPSED_KEY = 'c4\.sidebar\.collapsed'/);
  });

  it('exports DEFAULT_SIDEBAR_COLLAPSED = false', () => {
    assert.match(src, /DEFAULT_SIDEBAR_COLLAPSED = false/);
  });

  it('exports readSidebarCollapsed + writeSidebarCollapsed', () => {
    assert.match(src, /export function readSidebarCollapsed\(\): boolean/);
    assert.match(src, /export function writeSidebarCollapsed\(value: boolean\)/);
  });

  it('stores 1/0 for forward-compatibility with shell readers', () => {
    assert.match(src, /writeString\(SIDEBAR_COLLAPSED_KEY, value \? '1' : '0'\)/);
  });

  it('resetPreferences wipes the collapsed key too', () => {
    assert.match(src, /removeString\(SIDEBAR_COLLAPSED_KEY\)/);
  });
});

describe('Sidebar component wires the collapsed mode', () => {
  const src = readText(SIDEBAR);

  it('declares collapsed + onToggleCollapsed props', () => {
    assert.match(src, /collapsed\?: boolean/);
    assert.match(src, /onToggleCollapsed\?: \(\) => void/);
  });

  it('uses the PanelLeftOpen / PanelLeftClose lucide icons', () => {
    assert.match(src, /PanelLeftClose/);
    assert.match(src, /PanelLeftOpen/);
  });

  it('renders the collapse toggle behind the onToggleCollapsed prop', () => {
    assert.match(src, /onToggleCollapsed\s*\?\s*\(/);
    assert.match(src, /aria-label=\{collapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/);
    assert.match(src, /aria-pressed=\{collapsed\}/);
    assert.match(src, /aria-keyshortcuts="Control\+B"/);
  });

  it('hides the worker list / hierarchy tree in collapsed mode', () => {
    assert.match(src, /\{!collapsed \? \(/);
  });

  it('switches md width between w-72 (expanded) and w-14 (collapsed)', () => {
    assert.match(src, /collapsed \? 'md:w-14' : 'md:w-72'/);
  });

  it('marks data-collapsed attribute for css tests / e2e selectors', () => {
    assert.match(src, /data-collapsed=\{collapsed \? 'true' : 'false'\}/);
  });

  it('animates the width transition (200ms ease-out)', () => {
    assert.match(src, /transition-\[width\] duration-200 ease-out/);
  });
});

describe('App.tsx wires sidebarCollapsed + Ctrl+B', () => {
  const src = readText(APP);

  it('imports the new preference helpers', () => {
    assert.match(src, /readSidebarCollapsed/);
    assert.match(src, /writeSidebarCollapsed/);
    assert.match(src, /DEFAULT_SIDEBAR_COLLAPSED/);
  });

  it('initialises sidebarCollapsed state from the persisted value', () => {
    assert.match(src, /useState<boolean>\(readSidebarCollapsed\)/);
  });

  it('persists changes via writeSidebarCollapsed', () => {
    assert.match(src, /writeSidebarCollapsed\(sidebarCollapsed\)/);
  });

  it('passes collapsed + onToggleCollapsed through to Sidebar', () => {
    assert.match(src, /collapsed=\{sidebarCollapsed\}/);
    assert.match(src, /onToggleCollapsed=\{\(\) => setSidebarCollapsed\(\(v\) => !v\)\}/);
  });

  it('binds Ctrl+B / Cmd+B with input/textarea/contentEditable guard', () => {
    assert.match(src, /e\.ctrlKey \|\| e\.metaKey/);
    assert.match(src, /e\.key\.toLowerCase\(\) !== 'b'/);
    assert.match(src, /tag === 'INPUT'/);
    assert.match(src, /tag === 'TEXTAREA'/);
    assert.match(src, /isContentEditable/);
  });

  it('routes Ctrl+B to collapse on desktop and to open/close on mobile', () => {
    assert.match(src, /matchMedia\('\(min-width: 768px\)'\)/);
    assert.match(src, /setSidebarCollapsed\(\(v\) => !v\)/);
  });

  it('cross-tab storage handler refreshes the collapsed flag', () => {
    assert.match(src, /setSidebarCollapsed\(readSidebarCollapsed\(\)\)/);
  });

  it('Settings reset restores DEFAULT_SIDEBAR_COLLAPSED', () => {
    assert.match(src, /setSidebarCollapsed\(DEFAULT_SIDEBAR_COLLAPSED\)/);
  });
});

describe('KeyboardShortcutsModal documents Ctrl+B', () => {
  const src = readText(SHORTCUTS);
  it('lists Ctrl+B with the toggleSidebar i18n key', () => {
    assert.match(src, /\{ keys: 'Ctrl\+B', descriptionKey: 'shortcuts\.toggleSidebar' \}/);
  });
});

describe('i18n bundles cover shortcuts.toggleSidebar', () => {
  const en = JSON.parse(readText(I18N_EN));
  const ko = JSON.parse(readText(I18N_KO));
  it('en has shortcuts.toggleSidebar', () => {
    assert.match(en['shortcuts.toggleSidebar'], /sidebar/i);
  });
  it('ko has shortcuts.toggleSidebar', () => {
    assert.match(ko['shortcuts.toggleSidebar'], /사이드바/);
  });
});
