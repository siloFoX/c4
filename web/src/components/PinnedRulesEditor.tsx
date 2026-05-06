import { useCallback, useEffect, useState } from 'react';
import { Pin, RefreshCcw, Save } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { PinnedMemory } from '../types';
import { Button, Card, CardContent, CardHeader } from './ui';

// 8.46 — Persistent Rules editor for a single worker.
//
// Mounts inside WorkerDetail (or any per-worker surface); hits the 8.46
// API routes POST/GET /api/workers/:name/pinned-memory. The textarea is
// labeled "Persistent Rules" because that is the operator-facing term
// used in the spec and the one tests grep for.

interface PinnedRulesEditorProps {
  workerName: string;
}

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'No template' },
  { value: 'manager', label: 'role-manager' },
  { value: 'worker', label: 'role-worker' },
  { value: 'attached', label: 'role-attached' },
];

export default function PinnedRulesEditor({ workerName }: PinnedRulesEditorProps) {
  useLocale();
  const [rulesText, setRulesText] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!workerName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/workers/${encodeURIComponent(workerName)}/pinned-memory`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        pinnedMemory: PinnedMemory;
        lastRefreshAt: number | null;
      };
      const rules = Array.isArray(data.pinnedMemory?.userRules)
        ? data.pinnedMemory.userRules
        : [];
      setRulesText(rules.join('\n\n---\n\n'));
      setDefaultTemplate(data.pinnedMemory?.defaultTemplate || '');
      setLastRefreshAt(data.lastRefreshAt ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workerName]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (options: { refresh: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const userRules = rulesText
        .split(/\n\s*---\s*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      const res = await apiFetch(
        `/api/workers/${encodeURIComponent(workerName)}/pinned-memory`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userRules,
            defaultTemplate: defaultTemplate || null,
            refresh: options.refresh,
          }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { lastRefreshAt: number | null };
      setLastRefreshAt(data.lastRefreshAt ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [rulesText, defaultTemplate, workerName]);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 p-4">
        <Pin aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('pinnedRules.title')}</span>
        {lastRefreshAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            {tFormat('pinnedRules.lastRefresh', {
              time: new Date(lastRefreshAt).toLocaleTimeString(),
            })}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <p className="text-xs text-muted-foreground">
          {t('pinnedRules.description').split('{separator}').map((seg, i, arr) => (
            <span key={i}>
              {seg}
              {i < arr.length - 1 ? <code>---</code> : null}
            </span>
          ))}
        </p>

        <label className="block text-xs font-medium text-muted-foreground">
          {t('pinnedRules.roleField.label')}
          <select
            aria-label={t('pinnedRules.role.label')}
            value={defaultTemplate}
            onChange={(e) => setDefaultTemplate(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            disabled={loading || saving}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-muted-foreground">
          {t('pinnedRules.listField.label')}
          <textarea
            aria-label={t('pinnedRules.list.label')}
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            placeholder={t('pinnedRules.placeholder')}
            rows={8}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-sm"
            disabled={loading || saving}
          />
        </label>

        {error && (
          <div role="alert" className="text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => save({ refresh: false })}
            disabled={loading || saving}
          >
            <Save aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {t('pinnedRules.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => save({ refresh: true })}
            disabled={loading || saving}
          >
            <RefreshCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {t('pinnedRules.saveAndRefresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
