// Setup for the browser-mode vitest project. Real Chromium via
// playwright; vitest-browser-react owns mount/unmount lifecycle, so no
// RTL `cleanup()` is needed here. MSW is intentionally omitted — browser
// mode visual tests should mount components in isolation, not exercise
// network code paths (those belong in the jsdom unit project).
//
// We import the app's global stylesheet so tailwind utilities + CSS
// variables (theme tokens) are present on the page. Then we flip <html>
// to the dark class so cva tokens (bg-primary, bg-destructive, etc.)
// resolve against the dark palette — which matches both the prod default
// and the snapshot-screenshot test backgrounds.
import '../index.css';
import '@testing-library/jest-dom/vitest';
import { beforeAll } from 'vitest';

beforeAll(() => {
  document.documentElement.classList.add('dark');
});
