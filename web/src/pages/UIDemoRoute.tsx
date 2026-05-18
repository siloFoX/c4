import { useState } from 'react';
import type { ReactNode } from 'react';
import PageFrame from './PageFrame';
import {
  Alert,
  AspectRatio,
  Avatar,
  Badge,
  BadgeCounter,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Kbd,
  Panel,
  Progress,
  RadioGroup,
  Separator,
  Spinner,
  StatusDot,
  StatusPill,
  Switch,
  Textarea,
  Tooltip,
  VisuallyHidden,
} from '../components/ui';
import { useFeatureFlag } from '../lib/feature-flags';

// (v1.11.325, TODO 11.307) UIDemoRoute -- storybook-style
// gallery rendering every UI primitive with its main
// variants in a single scrollable page. Targeted at
// visual QA passes (one-shot screenshot diffs, dark/light
// theme sweeps, density audits) where the existing
// DesignSystem.tsx interactive demo is overkill.
//
// Gated behind the `uiDemoRoute` feature flag (default
// off). When the flag is off, the page renders a
// short "enable the flag" message instead of the
// gallery so the route can be enumerated by the feature
// registry without exposing the primitives surface to
// production users.
//
// Each primitive section is intentionally compact and
// non-interactive (no state machines, no async data
// loaders) so the page renders predictably for
// screenshot comparison.

function DemoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-section="ui-demo-section"
      data-demo-section={title}
      className="flex flex-col gap-3 border-b border-border pb-6 last:border-b-0"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

function FlagDisabled() {
  return (
    <div
      data-section="ui-demo-disabled"
      className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground"
    >
      <p className="font-medium text-foreground">
        UI demo route is disabled.
      </p>
      <p className="mt-1">
        Enable the <code className="rounded bg-muted px-1">uiDemoRoute</code>{' '}
        feature flag from the Feature Flags page to view the primitive
        gallery.
      </p>
    </div>
  );
}

export default function UIDemoRoute() {
  const [enabled] = useFeatureFlag('uiDemoRoute');
  const [switchValue, setSwitchValue] = useState(true);
  const [checkboxValue, setCheckboxValue] = useState(true);
  const [radioValue, setRadioValue] = useState('mid');

  return (
    <PageFrame
      title="UI Demo"
      description="Storybook-style primitive gallery for visual QA. Behind the uiDemoRoute feature flag."
    >
      {!enabled ? (
        <FlagDisabled />
      ) : (
        <div
          data-section="ui-demo-root"
          data-demo-enabled="true"
          className="flex flex-col gap-6"
        >
          <DemoSection title="Buttons">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </DemoSection>

          <DemoSection title="Badges and Chips">
            <Badge variant="default">Default</Badge>
            <Badge variant="muted">Muted</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Chip>Chip</Chip>
            <BadgeCounter value={3} />
            <BadgeCounter value={42} />
            <BadgeCounter value={999} />
          </DemoSection>

          <DemoSection title="Status">
            <StatusDot tone="success" />
            <StatusDot tone="warning" />
            <StatusDot tone="danger" />
            <StatusDot tone="muted" />
            <StatusPill tone="success">Healthy</StatusPill>
            <StatusPill tone="warning">Degraded</StatusPill>
            <StatusPill tone="danger">Down</StatusPill>
          </DemoSection>

          <DemoSection title="Avatars">
            <Avatar name="Alice" size="xs" />
            <Avatar name="Bob" size="sm" />
            <Avatar name="Carla" size="md" />
            <Avatar name="Dan" size="lg" />
          </DemoSection>

          <DemoSection title="Form controls">
            <div className="flex w-64 flex-col gap-2">
              <Input placeholder="Default input" />
              <Textarea placeholder="Default textarea" rows={2} />
            </div>
            <div className="flex flex-col gap-2">
              <Switch
                checked={switchValue}
                onChange={setSwitchValue}
                label="Toggle me"
              />
              <Checkbox
                checked={checkboxValue}
                onChange={setCheckboxValue}
                label="Checked"
              />
              <Checkbox
                checked={false}
                onChange={() => {}}
                label="Unchecked"
              />
            </div>
            <RadioGroup
              value={radioValue}
              onChange={setRadioValue}
              items={[
                { value: 'low', label: 'Low' },
                { value: 'mid', label: 'Mid' },
                { value: 'high', label: 'High' },
              ]}
            />
          </DemoSection>

          <DemoSection title="Feedback">
            <Alert variant="info">Information message</Alert>
            <Alert variant="success">Success message</Alert>
            <Alert variant="warning">Warning message</Alert>
            <Alert variant="danger">Danger message</Alert>
            <Progress value={25} className="w-40" />
            <Progress value={75} className="w-40" />
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </DemoSection>

          <DemoSection title="States">
            <Card className="w-72">
              <CardHeader>
                <CardTitle>Card primitive</CardTitle>
              </CardHeader>
              <CardContent>
                A small card body to demonstrate spacing.
              </CardContent>
            </Card>
            <Panel className="w-72 p-4">
              <p className="text-sm">Panel primitive</p>
            </Panel>
            <EmptyState
              title="Nothing here"
              description="No items yet."
              className="w-72"
            />
            <ErrorState
              title="Something went wrong"
              description="Demo error state."
              className="w-72"
            />
          </DemoSection>

          <DemoSection title="Layout helpers">
            <AspectRatio ratio="16:9" className="w-64 bg-muted">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                16:9
              </div>
            </AspectRatio>
            <AspectRatio ratio="1:1" className="w-32 bg-muted">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                1:1
              </div>
            </AspectRatio>
          </DemoSection>

          <DemoSection title="Navigation and misc">
            <Breadcrumbs
              items={[
                { label: 'Home', href: '#' },
                { label: 'Section', href: '#' },
                { label: 'Current' },
              ]}
            />
            <Kbd>Ctrl</Kbd>
            <span className="text-sm text-muted-foreground">+</span>
            <Kbd>K</Kbd>
            <Tooltip content="Tooltip content">
              <Button variant="ghost">Hover me</Button>
            </Tooltip>
            <Separator className="w-32" />
          </DemoSection>

          <VisuallyHidden>
            End of UI demo gallery. Use the Feature Flags page to disable
            the uiDemoRoute flag.
          </VisuallyHidden>
        </div>
      )}
    </PageFrame>
  );
}
