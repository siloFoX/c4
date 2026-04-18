import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui';

export default function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Worker detail</CardTitle>
        <CardDescription>
          Select a worker from the sidebar to view details.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
