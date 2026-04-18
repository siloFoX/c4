import { LogOut, Menu, X } from 'lucide-react';
import { IconButton } from '../ui';
import TopTabs, { type TopView } from './TopTabs';

interface AppHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  topView: TopView;
  onTopViewChange: (v: TopView) => void;
  authed: boolean;
  onLogout: () => void;
}

export default function AppHeader({
  sidebarOpen,
  onToggleSidebar,
  topView,
  onTopViewChange,
  authed,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-2 rounded-none border-b border-border bg-card px-4 py-3 md:px-6 md:py-4">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          className="md:hidden"
          aria-label={sidebarOpen ? 'Close worker list' : 'Open worker list'}
          onClick={onToggleSidebar}
          icon={
            sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )
          }
        />
        <h1 className="truncate text-lg font-semibold text-foreground md:text-xl">
          C4 Dashboard
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <TopTabs value={topView} onChange={onTopViewChange} />
        {authed && (
          <IconButton
            aria-label="Sign out"
            onClick={onLogout}
            icon={<LogOut className="h-4 w-4" />}
          />
        )}
      </div>
    </header>
  );
}
