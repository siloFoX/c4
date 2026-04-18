'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const webSrc = path.join(__dirname, '..', 'web', 'src');
const prefsPath = path.join(webSrc, 'lib', 'preferences.ts');
const settingsPath = path.join(webSrc, 'components', 'SettingsView.tsx');
const topTabsPath = path.join(webSrc, 'components', 'layout', 'TopTabs.tsx');
const appPath = path.join(webSrc, 'App.tsx');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

describe('preferences lib', () => {
  it('exists with localStorage key constants', () => {
    assert.ok(fs.existsSync(prefsPath), 'preferences.ts should exist');
    const src = read(prefsPath);
    for (const key of [
      'SIDEBAR_MODE_KEY',
      'DETAIL_MODE_KEY',
      'TOP_VIEW_KEY',
      'THEME_KEY',
    ]) {
      assert.ok(
        new RegExp(`export const ${key}\\s*=\\s*'c4\\.`).test(src),
        `${key} should be exported with a c4.* namespace`
      );
    }
  });

  it('exports default values and reader/writer helpers', () => {
    const src = read(prefsPath);
    for (const name of [
      'DEFAULT_SIDEBAR_MODE',
      'DEFAULT_DETAIL_MODE',
      'DEFAULT_TOP_VIEW',
      'DEFAULT_THEME',
      'readSidebarMode',
      'readDetailMode',
      'readTopView',
      'readTheme',
      'writeSidebarMode',
      'writeDetailMode',
      'writeTopView',
      'writeTheme',
      'resetPreferences',
      'applyTheme',
      'resolveTheme',
    ]) {
      assert.ok(
        new RegExp(`export (const|function) ${name}\\b`).test(src),
        `${name} should be exported from preferences.ts`
      );
    }
  });

  it('guards writeTopView against persisting the settings tab', () => {
    const src = read(prefsPath);
    assert.ok(
      /writeTopView[\s\S]*?value === 'settings'[\s\S]*?return/.test(src),
      "writeTopView should short-circuit when value === 'settings'"
    );
  });

  it('applyTheme toggles the dark class on the document root', () => {
    const src = read(prefsPath);
    assert.ok(
      /document\.documentElement/.test(src),
      'applyTheme should operate on document.documentElement'
    );
    assert.ok(
      /classList\.add\('dark'\)/.test(src) &&
        /classList\.remove\('dark'\)/.test(src),
      "applyTheme should add/remove the 'dark' class"
    );
  });
});

describe('Settings top tab', () => {
  it("TopTabs lists 'settings' with the lucide Settings icon", () => {
    const src = read(topTabsPath);
    assert.ok(
      /['"]settings['"]/.test(src),
      "TopTabs should include 'settings' value"
    );
    assert.ok(
      /\bSettings\b[^;]*from ['"]lucide-react['"]/.test(src),
      'TopTabs should import Settings icon from lucide-react'
    );
    assert.ok(
      /TopView =[\s\S]*?'settings'/.test(src),
      "TopView union should include 'settings'"
    );
  });
});

describe('SettingsView component', () => {
  it('renders appearance and layout panels with a reset action', () => {
    assert.ok(fs.existsSync(settingsPath), 'SettingsView.tsx should exist');
    const src = read(settingsPath);
    assert.ok(
      /export default function SettingsView/.test(src),
      'SettingsView should default-export a component'
    );
    for (const label of ['Appearance', 'Theme', 'Sidebar mode', 'Detail view']) {
      assert.ok(
        src.includes(label),
        `SettingsView should render a "${label}" control`
      );
    }
    assert.ok(
      /resetPreferences\(\)/.test(src),
      'SettingsView should call resetPreferences() when reset is clicked'
    );
    assert.ok(
      /role="radiogroup"/.test(src),
      'SettingsView should expose choice groups with role="radiogroup"'
    );
  });
});

describe('App wires Settings view', () => {
  it('renders SettingsView when topView is settings', () => {
    const src = read(appPath);
    assert.ok(
      /import SettingsView from ['"]\.\/components\/SettingsView['"]/.test(src),
      'App.tsx should import SettingsView'
    );
    assert.ok(
      /topView === 'settings'[\s\S]*?<SettingsView/.test(src),
      "App.tsx should mount SettingsView when topView === 'settings'"
    );
    assert.ok(
      /applyTheme\(theme\)/.test(src),
      'App.tsx should call applyTheme(theme) on change'
    );
  });
});
