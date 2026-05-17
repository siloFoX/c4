import { useCallback, useMemo, useState } from 'react';
import { ListChecks, RefreshCw, ShieldCheck } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, CopyButton, EmptyState, ExportButton, FieldGroup, FormField, HeroCard, ListItem, NumberInput, PageHeader, Panel, SearchBar, Tooltip } from '../components/ui';
import { EmptyQueueIllustration } from '../components/illustrations';
import { cn } from '../lib/cn';
import { fuzzyFilter } from '../lib/fuzzyFilter';
import { t, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useToast } from '../lib/use-toast';
import { useProfiles } from '../lib/use-profiles';

// 8.20B Profiles. Read-only list from GET /api/profiles. Add/edit/remove
// endpoints are tracked as a follow-up TODO; the UI toasts "Not
// implemented yet" for those actions so the permission matrix is still
// browsable today.
// (v1.10.722) Toast slot adopted from lib/use-toast (shared infra).
// (v1.10.746) Fetch + state machine moved to lib/use-profiles.

export default function Profiles() {
  useLocale();
  const { items, loading, error, refresh } = useProfiles();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast, showToast, dismissToast } = useToast();

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const filtered = useMemo(
    () => fuzzyFilter(items, filter, (p) => `${p.name} ${p.description || ''}`),
    [items, filter],
  );

  const notImplemented = () =>
    showToast(t('profiles.toast.notImplemented'), 'info');

  return (
    <PageFrame
      title={t('profilesPage.title')}
      description={t('profilesPage.description')}
      actions={
        <>
          <Tooltip label={t('profiles.tooltip.filter')}>
            <SearchBar
              size="sm"
              className="w-full sm:w-48"
              placeholder={t('profilesPage.filter.placeholder')}
              value={filter}
              onChange={setFilter}
              ariaLabel={t('profilesPage.filter.label')}
            />
          </Tooltip>
          <Tooltip label={t('profiles.tooltip.add')}>
            <Button type="button" variant="outline" size="sm" onClick={notImplemented}>
              <ListChecks className="h-3.5 w-3.5" />
              <span>{t('profilesPage.add')}</span>
            </Button>
          </Tooltip>
          {/* (11.190) ExportButton adoption: download filtered profile
              rows for offline review. */}
          <ExportButton
            rows={filtered as unknown[]}
            columns={[
              { key: 'name', header: 'Profile' },
              { key: 'description', header: 'Description' },
            ]}
            filename="profiles"
            disabled={filtered.length === 0}
          />
          <Tooltip label={t('profiles.tooltip.refresh')}>
            <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('common.srOnlyRefresh')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageHeader
        breadcrumbs={[
          { id: 'home', label: 'Dashboard', href: '#feature=workers' },
        ]}
        backHref="#feature=workers"
        backLabel="Back to Workers"
        sticky={false}
        className="-mx-4 -mt-2 md:-mx-6 md:-mt-2"
        data-testid="profiles-page-header"
      />
      <HeroCard
        size="sm"
        tone="primary"
        icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
        title="Get started with profile presets"
        description="Bundles of allow / deny patterns a worker inherits via --profile <name>. Browse the built-in presets below, or create one tailored to your team."
      />
      <PageDescriptionBanner
        summaryKey="profiles.summary"
        cliKey="profiles.cli"
        exampleKey="profiles.example"
        useCasesKey="profiles.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={
            <span data-testid="profiles-empty-illustration">
              <EmptyQueueIllustration size={160} />
            </span>
          }
          title={t('profiles.empty')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => {
            const isOpen = expanded.has(p.name);
            const allow = Array.isArray(p.allow) ? p.allow : [];
            const deny = Array.isArray(p.deny) ? p.deny : [];
            return (
              <li key={p.name}>
                <Panel className="p-3">
                  <ListItem
                    className="p-0"
                    onClick={() => toggle(p.name)}
                    aria-expanded={isOpen}
                    active={isOpen}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn(text.mono, 'text-foreground')}>{p.name}</span>
                        {/* (v1.11.285, TODO 11.267) Profile name
                            doubles as the `--profile <name>` CLI
                            argument; copy button lets operators
                            paste it into their `c4 task ...`
                            invocation without retyping. */}
                        {/* aria-label deliberately omits the
                            profile name itself so existing
                            `getByRole('button', { name: /web/ })`
                            test selectors continue to resolve
                            to the row toggle, not this nested
                            copy chip. */}
                        <CopyButton
                          value={p.name}
                          label="id"
                          size="sm"
                          data-testid={`profiles-name-copy-${p.name}`}
                        />
                        {p.source && <Badge variant="outline">{p.source}</Badge>}
                        <Badge variant="outline">{allow.length} allow</Badge>
                        <Badge variant="outline">{deny.length} deny</Badge>
                      </span>
                    }
                    description={p.description || undefined}
                    trailing={
                      <span className={text.caption}>
                        {isOpen ? t('profiles.toggle.hide') : t('profiles.toggle.show')}
                      </span>
                    }
                  />
                  {isOpen && (
                    /* (v1.11.281, TODO 11.263) Fieldset migrated
                       to the new FieldGroup primitive: same
                       fieldset semantics + legend, plus the
                       canonical heading + description rhythm
                       and the grid layout built in. The
                       allow/deny pattern panels now sit inside
                       a 2-column grid via FieldGroup. */
                    <FieldGroup
                      title={t('profiles.list.allow') + ' / ' + t('profiles.list.deny')}
                      description="Allow + deny pattern lists. Operator-local edits land once the daemon endpoints exist."
                      layout="grid"
                      columns={2}
                      className="mt-3"
                      data-testid={`profiles-patterns-${p.name}`}
                    >
                      <PatternList label={t('profiles.list.allow')} items={allow} tone="ok" />
                      <PatternList label={t('profiles.list.deny')} items={deny} tone="danger" />
                    </FieldGroup>
                  )}
                  {/* (v1.11.287, TODO 11.269) Budget cap row:
                      operator-local placeholder for a per-profile
                      token budget cap (the daemon does not yet
                      consume this value; the slot is in place
                      for when --budget hooks land). NumberInput
                      with $ prefix + "tokens" suffix advertises
                      the unit semantics. */}
                  {isOpen && <ProfileBudgetRow name={p.name} />}
                  {isOpen && (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        {t('profiles.action.edit')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={notImplemented}>
                        {t('profiles.action.remove')}
                      </Button>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        )}
      </div>
    </PageFrame>
  );
}

// (v1.11.287, TODO 11.269) Operator-local budget cap field for a
// profile. NumberInput primitive with min/max + $ prefix + tokens
// unit. Stored as page-local state for now -- the daemon's profile
// schema doesn't have a budget field yet.
function ProfileBudgetRow({ name }: { name: string }) {
  const [budget, setBudget] = useState<number | undefined>(undefined);
  return (
    <div
      className="mt-3 flex flex-wrap items-end gap-3"
      data-testid={`profiles-budget-${name}`}
    >
      <FormField
        label="Budget cap"
        helperText="Per-profile token ceiling. Operator-local until the daemon adds a --budget field."
      >
        <NumberInput
          value={budget}
          onChange={setBudget}
          min={0}
          max={1000000}
          step={10000}
          prefix="$"
          unit="tokens"
          ariaLabel={`Budget cap for profile ${name}`}
          placeholder="0"
          size="sm"
        />
      </FormField>
    </div>
  );
}

function PatternList({ label, items, tone }: { label: string; items: string[]; tone: 'ok' | 'danger' }) {
  const color = tone === 'ok' ? 'text-success' : 'text-destructive';
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground">—</div>
      ) : (
        <ul className="space-y-0.5 font-mono">
          {items.map((pat, i) => (
            <li key={`${pat}-${i}`} className={color}>{pat}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
