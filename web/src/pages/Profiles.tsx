import { useCallback, useMemo, useState } from 'react';
import { ListChecks, RefreshCw, ShieldCheck } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, CopyButton, EmptyState, ExportButton, FieldGroup, FileDrop, FormField, HeroCard, ListItem, NumberInput, PageHeader, Panel, RadioGroup, SearchBar, Tabs, TabsPanel, TagInput, Tooltip, type TabsItem } from '../components/ui';
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

type ProfilesTabKey = 'all' | 'builtin' | 'custom';

export default function Profiles() {
  useLocale();
  const { items, loading, error, refresh } = useProfiles();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ProfilesTabKey>('all');
  // (v1.11.335, TODO 11.317) Deletion confirm dialog state.
  // The daemon's profile remove endpoint doesn't exist yet
  // (the dispatched action toasts "Not implemented"), but
  // the ConfirmDialog flow already gives the operator the
  // confirmation surface they would expect once the endpoint
  // lands.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
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

  // (v1.11.335, TODO 11.317) Source-based grouping. Built-in
  // profiles ship with the daemon (source === 'builtin'),
  // custom profiles are operator-defined. The Tabs let the
  // operator focus on one side at a time without typing a
  // filter.
  const isBuiltin = (source: string | undefined | null) =>
    (source ?? '').toLowerCase() === 'builtin';

  const tabFiltered = useMemo(() => {
    if (activeTab === 'builtin') return filtered.filter((p) => isBuiltin(p.source));
    if (activeTab === 'custom') return filtered.filter((p) => !isBuiltin(p.source));
    return filtered;
  }, [filtered, activeTab]);

  const tabCounts = useMemo(
    () => ({
      all: filtered.length,
      builtin: filtered.filter((p) => isBuiltin(p.source)).length,
      custom: filtered.filter((p) => !isBuiltin(p.source)).length,
    }),
    [filtered],
  );

  const tabItems: TabsItem[] = [
    { value: 'all', label: `All (${tabCounts.all})` },
    { value: 'builtin', label: `Built-in (${tabCounts.builtin})` },
    { value: 'custom', label: `Custom (${tabCounts.custom})` },
  ];

  const notImplemented = () =>
    showToast(t('profiles.toast.notImplemented'), 'info');

  const requestDelete = useCallback((name: string) => {
    setPendingDelete(name);
  }, []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const confirmDelete = useCallback(() => {
    // Daemon endpoint not implemented yet -- close the dialog
    // and surface the same "Not implemented" toast the prior
    // path used. When the endpoint lands, this is where the
    // DELETE /api/profiles/<name> call goes.
    setPendingDelete(null);
    notImplemented();
  }, []);

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
      {/* (v1.11.288, TODO 11.270) Profile import FileDrop:
          operator can drop a JSON / YAML profile definition to
          stage it for import. The daemon's profile add endpoint
          doesn't exist yet (notImplemented toast in the row
          actions), so the drop currently just logs; the slot is
          in place for when the endpoint lands. */}
      <FileDrop
        label="Import profile"
        hint="Drop a JSON or YAML profile definition. Max 256 KB."
        accept="application/json,application/yaml,.json,.yaml,.yml"
        maxSize={256 * 1024}
        data-testid="profiles-import-filedrop"
        onAdd={(files) => {
          // eslint-disable-next-line no-console
          console.log('[profiles] import staged', files[0]?.name);
        }}
      />
      {error && <ErrorPanel message={error} />}
      {loading && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}
      {/* (v1.11.335, TODO 11.317) Source-grouping Tabs. Active
          tab filters the list to its subset; count chips on
          each tab label give the operator a heads-up on how
          many profiles live in each bucket. */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v as ProfilesTabKey)}
        items={tabItems}
        ariaLabel="Profile groups"
        data-testid="profiles-tabs"
      >
        <TabsPanel value={activeTab} className="mt-3">
          {!loading && tabFiltered.length === 0 ? (
            <EmptyState
              icon={
                <span data-testid="profiles-empty-illustration">
                  <EmptyQueueIllustration size={160} />
                </span>
              }
              title={t('profiles.empty')}
            />
          ) : (
            <ul className="flex flex-col gap-2" data-section="profiles-list">
              {tabFiltered.map((p) => {
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
                      {/* (v1.11.335, TODO 11.317) Remove flow now
                          opens a ConfirmDialog instead of firing the
                          notImplemented toast directly. The actual
                          DELETE wires up once the daemon endpoint
                          lands; the confirmation surface ships now
                          so the operator sees the destructive
                          intent path. */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => requestDelete(p.name)}
                        data-testid={`profiles-remove-${p.name}`}
                      >
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
        </TabsPanel>
      </Tabs>

      {/* (v1.11.335, TODO 11.317) Shared ConfirmDialog for the
          destructive "Remove profile" action. The dialog is
          rendered at the page level so the open/closed state
          is owned by Profiles and not by each row. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove profile"
        description={
          pendingDelete
            ? `This will remove the "${pendingDelete}" profile and any workers that inherit from it will fall back to the default allow/deny set.`
            : ''
        }
        confirmLabel={t('profiles.action.remove')}
        cancelLabel={t('common.cancel') || 'Cancel'}
        destructive
        initialFocus="cancel"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

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
//
// (v1.11.291, TODO 11.273) Adds a per-profile TagInput "Labels"
// row. Operator-local until the daemon's profile schema accepts
// labels. Replaces the prior ad-hoc taggability with the canonical
// primitive (chip rendering + Backspace removal + comma/Enter add
// + dedupe + 8-tag cap).
function ProfileBudgetRow({ name }: { name: string }) {
  const [budget, setBudget] = useState<number | undefined>(undefined);
  const [labels, setLabels] = useState<string[]>([]);
  // (v1.11.335, TODO 11.317) Per-profile role picker.
  // Operator-local until the daemon's profile schema accepts a
  // role field; in the meantime the picker captures the
  // intent ("which actor inherits this profile?") inline so
  // the operator does not have to context-switch to the RBAC
  // page.
  const [role, setRole] = useState<string>('worker');
  return (
    <div
      className="mt-3 flex flex-col gap-3"
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
      <FormField
        label="Labels"
        helperText="Free-form tags for filtering. Press Enter or comma to add; Backspace removes."
      >
        <TagInput
          value={labels}
          onChange={setLabels}
          maxTags={8}
          ariaLabel={`Labels for profile ${name}`}
          placeholder="Add label..."
          data-testid={`profiles-labels-${name}`}
          normalize={(raw) => raw.trim().toLowerCase()}
        />
      </FormField>
      {/* (v1.11.335, TODO 11.317) RadioGroup picker for the
          actor role that inherits this profile. Three options
          map to the canonical c4 roles (admin / manager /
          worker). The picker is operator-local until the
          daemon's profile schema accepts a role field. */}
      <FormField
        label="Inherits to role"
        helperText="Which role inherits the profile's allow/deny set."
      >
        <RadioGroup
          name={`profiles-role-${name}`}
          value={role}
          onChange={setRole}
          ariaLabel={`Inheriting role for profile ${name}`}
          data-testid={`profiles-role-${name}`}
          orientation="horizontal"
          items={[
            { value: 'admin', label: 'Admin' },
            { value: 'manager', label: 'Manager' },
            { value: 'worker', label: 'Worker' },
          ]}
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
