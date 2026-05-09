import { useCallback, useState } from 'react';
import { apiGet } from './api';

// (v1.10.683) Extracted from SpecialistsAuditPanel. The
// daemon-wide hash-chain integrity check — GET
// /api/audit/verify[?includeRotated=1]. Always returns
// the four-field result so the JSX can render the
// "valid" / "corrupted at line N" banner uniformly. On
// network failure the hook stamps a `{ valid: false }`
// fallback so the banner still updates instead of
// silently freezing.

export interface AuditVerifyResult {
  valid: boolean;
  corruptedAt: number | null;
  total: number;
  rotatedTotal: number;
}

interface AuditVerifyState {
  verifyBusy: boolean;
  verifyResult: AuditVerifyResult | null;
  handleVerify: (includeRotated: boolean) => Promise<void>;
}

export function useAuditVerify(): AuditVerifyState {
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);

  const handleVerify = useCallback(async (includeRotated: boolean) => {
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const qs = includeRotated ? '?includeRotated=1' : '';
      const res = await apiGet<AuditVerifyResult>(`/api/audit/verify${qs}`);
      setVerifyResult(res);
    } catch {
      setVerifyResult({ valid: false, corruptedAt: null, total: 0, rotatedTotal: 0 });
    } finally {
      setVerifyBusy(false);
    }
  }, []);

  return { verifyBusy, verifyResult, handleVerify };
}
