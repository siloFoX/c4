'use strict';

// 8.33 - Web UI docs + intuition coverage.
//
// Three layers:
//   (a) i18n bundle integrity - both en.json and ko.json parse as JSON,
//       carry the keys every page consumes, and share identical key
//       sets so a translator does not have to guess what English ships.
//   (b) Shared component wiring - PageDescriptionBanner, HelpDrawer,
//       OnboardingTour, KeyboardShortcutsModal, ConfirmDialog, Tooltip,
//       HelpUIRoot expose the symbols the test suite locks as their
//       public contract.
//   (c) Feature-page wiring - each of the 12 CLI-coverage pages mounts
//       a <PageDescriptionBanner>, at least one <Tooltip>, pulls its
//       empty-state copy from the i18n bundle, and dispatches the
//       help-drawer custom event. Follows the same source-grep pattern
//       as tests/ui-cli-coverage so the suite does not need a React
//       renderer.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');
const WEB_SRC = path.join(REPO_ROOT, 'web', 'src');
const PAGES_DIR = path.join(WEB_SRC, 'pages');
const COMPONENTS_DIR = path.join(WEB_SRC, 'components');
const I18N_DIR = path.join(WEB_SRC, 'i18n');
const APP_HEADER = path.join(COMPONENTS_DIR, 'layout', 'AppHeader.tsx');
const APP_TSX = path.join(WEB_SRC, 'App.tsx');

const PAGES = [
  { id: 'scribe', file: 'Scribe.tsx', keyBase: 'scribe' },
  { id: 'batch', file: 'Batch.tsx', keyBase: 'batch' },
  { id: 'cleanup', file: 'Cleanup.tsx', keyBase: 'cleanup' },
  { id: 'swarm', file: 'Swarm.tsx', keyBase: 'swarm' },
  { id: 'token-usage', file: 'TokenUsage.tsx', keyBase: 'tokenUsage' },
  { id: 'plan', file: 'Plan.tsx', keyBase: 'plan' },
  { id: 'morning', file: 'Morning.tsx', keyBase: 'morning' },
  { id: 'auto', file: 'Auto.tsx', keyBase: 'auto' },
  { id: 'templates', file: 'Templates.tsx', keyBase: 'templates' },
  { id: 'profiles', file: 'Profiles.tsx', keyBase: 'profiles' },
  { id: 'health', file: 'Health.tsx', keyBase: 'health' },
  { id: 'validation', file: 'Validation.tsx', keyBase: 'validation' },
];

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

// -----------------------------------------------------------------
// (a) i18n bundle integrity
// -----------------------------------------------------------------

describe('i18n bundles (8.33)', () => {
  const en = readJson(path.join(I18N_DIR, 'en.json'));
  const ko = readJson(path.join(I18N_DIR, 'ko.json'));

  it('both bundles parse and are flat string maps', () => {
    for (const [k, v] of Object.entries(en)) {
      assert.strictEqual(typeof v, 'string', `en[${k}] should be string`);
    }
    for (const [k, v] of Object.entries(ko)) {
      assert.strictEqual(typeof v, 'string', `ko[${k}] should be string`);
    }
  });

  it('en and ko share an identical key set', () => {
    const enKeys = Object.keys(en).sort();
    const koKeys = Object.keys(ko).sort();
    const missingInKo = enKeys.filter((k) => !(k in ko));
    const missingInEn = koKeys.filter((k) => !(k in en));
    assert.deepStrictEqual(missingInKo, [], `keys missing in ko: ${missingInKo.join(', ')}`);
    assert.deepStrictEqual(missingInEn, [], `keys missing in en: ${missingInEn.join(', ')}`);
  });

  it('every page carries summary / cli / example / useCases keys in both bundles', () => {
    for (const page of PAGES) {
      for (const suffix of ['summary', 'cli', 'example', 'useCases']) {
        const key = `${page.keyBase}.${suffix}`;
        assert.ok(
          key in en,
          `en.json missing ${key}`,
        );
        assert.ok(
          key in ko,
          `ko.json missing ${key}`,
        );
      }
    }
  });

  it('help center + tour + shortcuts copy is defined in both bundles', () => {
    const required = [
      'help.title',
      'help.globalIntro',
      'help.featureNav',
      'help.cliMapping',
      'help.shortcutHint',
      'tour.step1.title',
      'tour.step1.body',
      'tour.step2.title',
      'tour.step2.body',
      'tour.step3.title',
      'tour.step3.body',
      'tour.step4.title',
      'tour.step4.body',
      'shortcuts.heading',
      'shortcuts.openHelp',
      'shortcuts.openHelpDrawer',
      'shortcuts.closeOverlay',
      'shortcuts.terminalSearch',
      'common.learnMore',
      'common.cliEquivalent',
      'common.example',
      'common.useCases',
      'common.helpCenter',
      'common.shortcuts',
      'common.language',
    ];
    for (const k of required) {
      assert.ok(k in en, `en.json missing ${k}`);
      assert.ok(k in ko, `ko.json missing ${k}`);
    }
  });

  it('useCases values use the pipe delimiter so tList can split them', () => {
    for (const page of PAGES) {
      const key = `${page.keyBase}.useCases`;
      assert.ok(
        en[key].includes('|'),
        `en.json ${key} should be pipe-delimited`,
      );
      assert.ok(
        ko[key].includes('|'),
        `ko.json ${key} should be pipe-delimited`,
      );
    }
  });
});

// -----------------------------------------------------------------
// (b) shared component contracts
// -----------------------------------------------------------------

describe('i18n loader (lib/i18n.ts)', () => {
  const src = readText(path.join(WEB_SRC, 'lib', 'i18n.ts'));

  it('exports the public surface tests and pages depend on', () => {
    assert.match(src, /export\s+type\s+Locale/);
    assert.match(src, /export\s+const\s+LOCALES/);
    assert.match(src, /export\s+const\s+DEFAULT_LOCALE/);
    assert.match(src, /export\s+function\s+detectLocale/);
    assert.match(src, /export\s+function\s+getLocale/);
    assert.match(src, /export\s+function\s+setLocale/);
    assert.match(src, /export\s+function\s+onLocaleChange/);
    assert.match(src, /export\s+function\s+t\(/);
    assert.match(src, /export\s+function\s+tList/);
    assert.match(src, /export\s+function\s+useLocale/);
  });

  it('loads both en and ko bundles at module scope', () => {
    assert.match(src, /from '\.\.\/i18n\/en\.json'/);
    assert.match(src, /from '\.\.\/i18n\/ko\.json'/);
  });

  it('falls back through English when a key is missing', () => {
    assert.match(src, /BUNDLES\[DEFAULT_LOCALE\]/);
  });
});

describe('Tooltip primitive (ui/tooltip.tsx)', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'ui', 'tooltip.tsx'));

  it('exposes the Tooltip component', () => {
    assert.match(src, /export\s+function\s+Tooltip/);
  });

  it('fires on hover and focus so keyboard users get the label', () => {
    assert.match(src, /onMouseEnter/);
    assert.match(src, /onMouseLeave/);
    assert.match(src, /onFocus/);
    assert.match(src, /onBlur/);
  });

  it('applies aria-describedby when visible so screen readers announce it', () => {
    assert.match(src, /aria-describedby/);
    assert.match(src, /role="tooltip"/);
  });

  it('dismisses on Escape', () => {
    assert.match(src, /e\.key === 'Escape'/);
  });
});

describe('PageDescriptionBanner component', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'PageDescriptionBanner.tsx'));

  it('accepts the five public props the pages bind to', () => {
    assert.match(src, /summaryKey:/);
    assert.match(src, /cliKey\?:/);
    assert.match(src, /exampleKey\?:/);
    assert.match(src, /useCasesKey\?:/);
    assert.match(src, /onOpenHelp\?:/);
  });

  it('renders the translated summary / cli / example / useCases', () => {
    assert.match(src, /t\(summaryKey\)/);
    assert.match(src, /t\(cliKey\)/);
    assert.match(src, /t\(exampleKey\)/);
    assert.match(src, /tList\(useCasesKey\)/);
  });

  it('exposes a data-testid hook so tests and tours can target it', () => {
    assert.match(src, /data-testid=\{testId\}/);
  });

  it('offers a Learn more button that calls onOpenHelp', () => {
    assert.match(src, /onClick=\{onOpenHelp\}/);
    assert.match(src, /common\.learnMore/);
  });
});

describe('HelpDrawer component', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'HelpDrawer.tsx'));

  it('lists every feature from the registry', () => {
    assert.match(src, /FEATURES\.map\(featureToEntry\)/);
  });

  it('has a search field filtering on title + summary + useCases', () => {
    assert.match(src, /common\.search/);
    assert.match(src, /useCases\.join/);
  });

  it('closes on Escape and click outside', () => {
    assert.match(src, /e\.key === 'Escape'/);
  });

  it('scrolls the active feature into view when opened', () => {
    assert.match(src, /scrollIntoView/);
  });
});

describe('OnboardingTour component', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'OnboardingTour.tsx'));

  it('persists dismissal in localStorage via TOUR_STORAGE_KEY', () => {
    assert.match(src, /export\s+const\s+TOUR_STORAGE_KEY/);
    assert.match(src, /window\.localStorage\.setItem/);
  });

  it('exposes a programmatic startOnboardingTour helper', () => {
    assert.match(src, /export\s+function\s+startOnboardingTour/);
    assert.match(src, /window\.localStorage\.removeItem/);
  });

  it('renders at least four steps', () => {
    const count = (src.match(/titleKey:\s*'tour\.step\d+\.title'/g) || []).length;
    assert.ok(count >= 4, `expected >=4 tour steps, saw ${count}`);
  });
});

describe('KeyboardShortcutsModal component', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'KeyboardShortcutsModal.tsx'));

  it('exports SHORTCUT_ROWS for downstream tests', () => {
    assert.match(src, /export\s+const\s+SHORTCUT_ROWS/);
  });

  it('documents the ? trigger for the sheet', () => {
    assert.match(src, /'\?'/);
  });

  it('closes on Escape', () => {
    assert.match(src, /e\.key === 'Escape'/);
  });
});

describe('ConfirmDialog component', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'ConfirmDialog.tsx'));

  it('requires an explicit preview + onConfirm contract', () => {
    assert.match(src, /preview\?:/);
    assert.match(src, /onConfirm:/);
    assert.match(src, /onCancel:/);
  });

  it('defaults to destructive styling and supports a busy flag', () => {
    assert.match(src, /destructive\s*=\s*true/);
    assert.match(src, /busy\?:/);
  });

  it('forwards Escape to onCancel unless busy', () => {
    assert.match(src, /e\.key === 'Escape'/);
  });
});

describe('HelpUIRoot shell', () => {
  const src = readText(path.join(COMPONENTS_DIR, 'HelpUIRoot.tsx'));

  it('exports the window-event names used to drive overlays', () => {
    assert.match(src, /HELP_EVENT_OPEN_DRAWER\s*=\s*'c4:help-drawer-open'/);
    assert.match(src, /HELP_EVENT_OPEN_SHORTCUTS\s*=\s*'c4:shortcuts-open'/);
  });

  it('mounts the three overlays as a single unit', () => {
    assert.match(src, /<HelpDrawer/);
    assert.match(src, /<KeyboardShortcutsModal/);
    assert.match(src, /<OnboardingTour/);
  });

  it('registers global keyboard shortcuts but ignores input fields', () => {
    assert.match(src, /e\.key === '\?'/);
    assert.match(src, /tag === 'INPUT'/);
    assert.match(src, /tag === 'TEXTAREA'/);
  });
});

describe('App.tsx mounts HelpUIRoot', () => {
  const src = readText(APP_TSX);

  it('imports and renders HelpUIRoot once', () => {
    assert.match(src, /from '\.\/components\/HelpUIRoot'/);
    assert.match(src, /<HelpUIRoot\s*\/>/);
  });
});

describe('AppHeader exposes help + locale controls', () => {
  const src = readText(APP_HEADER);

  it('dispatches the help drawer and shortcut events', () => {
    assert.match(src, /HELP_EVENT_OPEN_DRAWER/);
    assert.match(src, /HELP_EVENT_OPEN_SHORTCUTS/);
  });

  it('exposes a locale toggle calling setLocale', () => {
    assert.match(src, /setLocale\(locale === 'en' \? 'ko' : 'en'\)/);
  });
});

// -----------------------------------------------------------------
// (c) per-page wiring
// -----------------------------------------------------------------

describe('CLI-coverage pages wire the shared docs surface', () => {
  for (const page of PAGES) {
    describe(`${page.file}`, () => {
      const src = readText(path.join(PAGES_DIR, page.file));

      it('imports PageDescriptionBanner', () => {
        assert.match(
          src,
          /from '\.\.\/components\/PageDescriptionBanner'/,
          `${page.file} missing PageDescriptionBanner import`,
        );
      });

      it('renders <PageDescriptionBanner ...> with summaryKey bound to this page', () => {
        assert.match(
          src,
          /<PageDescriptionBanner/,
          `${page.file} missing PageDescriptionBanner usage`,
        );
        const expected = new RegExp(
          `summaryKey=(['"])${page.keyBase}\\.summary\\1`,
        );
        assert.match(
          src,
          expected,
          `${page.file} summaryKey should be ${page.keyBase}.summary`,
        );
      });

      it('hooks the Learn more button to openHelpDrawer', () => {
        assert.match(
          src,
          /onOpenHelp=\{openHelpDrawer\}/,
          `${page.file} should wire onOpenHelp to openHelpDrawer`,
        );
        assert.match(
          src,
          /from '\.\.\/components\/HelpUIRoot'/,
          `${page.file} should import from HelpUIRoot`,
        );
      });

      it('wraps at least one control with <Tooltip label=t(...)>', () => {
        assert.match(
          src,
          /<Tooltip\s+label=\{t\(/,
          `${page.file} should wrap at least one control with a localized Tooltip`,
        );
      });

      it('subscribes to locale changes via useLocale', () => {
        assert.match(
          src,
          /useLocale\(\)/,
          `${page.file} should call useLocale()`,
        );
      });
    });
  }
});

describe('Cleanup uses ConfirmDialog with concrete preview', () => {
  const src = readText(path.join(PAGES_DIR, 'Cleanup.tsx'));

  it('replaces window.confirm with ConfirmDialog', () => {
    assert.ok(
      !/window\.confirm/.test(src),
      'Cleanup should no longer use window.confirm',
    );
    assert.match(src, /<ConfirmDialog/);
  });

  it('renders per-group previews inside the dialog', () => {
    assert.match(src, /PreviewGroup/);
    assert.match(src, /cleanup\.preview\.branches/);
    assert.match(src, /cleanup\.preview\.worktrees/);
    assert.match(src, /cleanup\.preview\.directories/);
  });
});

describe('Batch exposes a Try example affordance', () => {
  const src = readText(path.join(PAGES_DIR, 'Batch.tsx'));

  it('defines a prefillExample callback and binds it to the banner action', () => {
    assert.match(src, /prefillExample/);
    assert.match(src, /batch\.tryExample/);
  });

  it('drives both modes off batch.example and batch.exampleMulti', () => {
    assert.match(src, /batch\.example/);
    assert.match(src, /batch\.exampleMulti/);
  });
});

describe('Auto surfaces typical scenarios', () => {
  const src = readText(path.join(PAGES_DIR, 'Auto.tsx'));

  it('renders the three scenario entries from i18n', () => {
    assert.match(src, /auto\.scenario\.heading/);
    assert.match(src, /auto\.scenario\.overnight/);
    assert.match(src, /auto\.scenario\.triage/);
    assert.match(src, /auto\.scenario\.spike/);
  });
});
