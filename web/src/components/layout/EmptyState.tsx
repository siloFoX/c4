import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui';
import { t, useLocale } from '../../lib/i18n';

export default function EmptyState() {
  useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('empty.workerDetail.title')}</CardTitle>
        <CardDescription>
          {t('empty.workerDetail.description')}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
