import { Search, X } from 'lucide-react';
import { Input } from './ui';
import { t, useLocale } from '../lib/i18n';

// (v1.10.582) Extracted from MeetingsView. The full-text search
// input (left pane card header) — controlled input + X-clear
// button + "searching..." indicator. Pure controlled input:
// parent owns query state and search status flag.

interface Props {
  value: string;
  onChange: (next: string) => void;
  searching: boolean;
}

export default function MeetingsSearchInput({
  value,
  onChange,
  searching,
}: Props) {
  useLocale();
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('meetings.search.placeholder')}
          aria-label={t('meetings.action.search')}
          className="h-8 pl-7 pr-7 text-[12px]"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('meetings.action.clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {searching ? (
        <span className="text-[10px] text-muted-foreground">{t('meetings.searching')}</span>
      ) : null}
    </div>
  );
}
