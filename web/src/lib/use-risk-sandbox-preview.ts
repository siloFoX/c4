import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t } from './i18n';
import type { SandboxPreview } from '../pages/Risk';

// (v1.10.657) Extracted from pages/Risk. The "what would
// the sandbox do?" preview — POST /api/risk/preview with
// the raw command. The hook owns busy / result / error
// state and the command-empty short-circuit so the
// button can just call runPreview.

interface RiskSandboxPreviewState {
  sandboxBusy: boolean;
  sandbox: SandboxPreview | null;
  sandboxError: string | null;
  runPreview: () => Promise<void>;
}

export function useRiskSandboxPreview(args: {
  command: string;
}): RiskSandboxPreviewState {
  const { command } = args;
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxPreview | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    if (!command.trim()) return;
    setSandboxBusy(true);
    setSandboxError(null);
    setSandbox(null);
    try {
      const res = await apiPost<SandboxPreview>('/api/risk/preview', {
        command: command.trim(),
      });
      setSandbox(res);
    } catch (e) {
      setSandboxError((e as Error).message || t('common.previewFailed'));
    } finally {
      setSandboxBusy(false);
    }
  }, [command]);

  return { sandboxBusy, sandbox, sandboxError, runPreview };
}
