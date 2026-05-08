import { t, useLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// (v1.10.597) Extracted from SpecialistsView. The detail-pane
// metadata block — 4-column tier/brain/model/effort grid +
// domains/triggers/deliverables fields. Pure display: takes
// the full Specialist record.

interface Props {
  specialist: Specialist;
}

export default function SpecialistsMetadataPanel({ specialist }: Props) {
  useLocale();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground">{t('specialists.label.tier')}</div>
          <div className="font-medium">{specialist.tier}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('specialists.label.brain')}</div>
          <div className="font-medium">{specialist.brain.adapter}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('specialists.label.model')}</div>
          <div className="font-medium">{specialist.brain.model || '-'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('specialists.label.effort')}</div>
          <div className="font-medium">{specialist.brain.effort || '-'}</div>
        </div>
      </div>

      <div className="text-xs">
        <div className="text-muted-foreground">{t('specialists.label.domains')}</div>
        <div className="font-medium">{specialist.domain.join(', ')}</div>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground">{t('specialists.label.triggersStages')}</div>
        <div className="font-medium">{specialist.triggers.stages.join(', ')}</div>
      </div>
      <div className="text-xs">
        <div className="text-muted-foreground">{t('specialists.label.triggersKeywords')}</div>
        <div className="font-medium">{specialist.triggers.keywords.join(', ')}</div>
      </div>
      {specialist.deliverables.length > 0 ? (
        <div className="text-xs">
          <div className="text-muted-foreground">{t('specialists.label.deliverables')}</div>
          <ul className="mt-1 list-disc pl-5 font-medium">
            {specialist.deliverables.map((d) => (<li key={d}>{d}</li>))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
