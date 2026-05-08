import { CardHeader } from './ui';
import { useLocale } from '../lib/i18n';
import SpecialistsListTitleBar from './SpecialistsListTitleBar';
import SpecialistsSearchFilters from './SpecialistsSearchFilters';

// (v1.10.618) Extracted from SpecialistsView. The master-pane
// card header — title row (with Add toggle + Refresh + add
// panel) + search + filter controls. Pure composite: parent
// owns add/filter state + handlers.

interface Props {
  loading: boolean;
  addOpen: boolean;
  actionError: string | null;
  onToggleAdd: () => void;
  onCloseAdd: () => void;
  onAdded: (newId: string) => void;
  onRefresh: () => void;
  filter: string;
  onFilter: (next: string) => void;
  tierFilter: string;
  onTierFilter: (next: string) => void;
  vetoOnly: boolean;
  onVetoOnly: (next: boolean) => void;
  filteredCount: number;
  totalCount: number;
}

export default function SpecialistsListCardHeader({
  loading,
  addOpen,
  actionError,
  onToggleAdd,
  onCloseAdd,
  onAdded,
  onRefresh,
  filter,
  onFilter,
  tierFilter,
  onTierFilter,
  vetoOnly,
  onVetoOnly,
  filteredCount,
  totalCount,
}: Props) {
  useLocale();
  return (
    <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
      <SpecialistsListTitleBar
        loading={loading}
        addOpen={addOpen}
        actionError={actionError}
        onToggleAdd={onToggleAdd}
        onCloseAdd={onCloseAdd}
        onAdded={onAdded}
        onRefresh={onRefresh}
      />
      <SpecialistsSearchFilters
        filter={filter}
        onFilter={onFilter}
        tierFilter={tierFilter}
        onTierFilter={onTierFilter}
        vetoOnly={vetoOnly}
        onVetoOnly={onVetoOnly}
        filteredCount={filteredCount}
        totalCount={totalCount}
      />
    </CardHeader>
  );
}
