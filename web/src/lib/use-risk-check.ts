import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t } from './i18n';
import type { CheckResponse } from '../pages/Risk';

// (v1.10.657) Extracted from pages/Risk. The classifier
// "check" call — POST /api/risk/check with the raw
// command + the inspected-rule include flag. The hook
// owns busy / result / error state slots and the
// command-empty short-circuit. Trim happens here so the
// button can stay dumb (just calls runCheck).

interface RiskCheckState {
  checkBusy: boolean;
  checkResult: CheckResponse | null;
  checkError: string | null;
  runCheck: () => Promise<void>;
}

export function useRiskCheck(args: {
  command: string;
  includeInspected: boolean;
}): RiskCheckState {
  const { command, includeInspected } = args;
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!command.trim()) return;
    setCheckBusy(true);
    setCheckError(null);
    setCheckResult(null);
    try {
      const res = await apiPost<CheckResponse>('/api/risk/check', {
        command: command.trim(),
        includeInspected,
      });
      setCheckResult(res);
    } catch (e) {
      setCheckError((e as Error).message || t('common.checkFailed'));
    } finally {
      setCheckBusy(false);
    }
  }, [command, includeInspected]);

  return { checkBusy, checkResult, checkError, runCheck };
}
