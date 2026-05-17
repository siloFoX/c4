import { useState } from 'react';
import type { ReactNode } from 'react';
import { Palette, Inbox } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Alert,
  Avatar,
  AvatarShape,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  CodeBlock,
  Collapsible,
  CollapsibleGroup,
  DataList,
  DatePicker,
  DateRangePicker,
  Dialog,
  Drawer,
  DropdownMenu,
  Tabs,
  ToastProvider,
  useToast,
  EmptyState,
  FileTree,
  HScroll,
  Input,
  Kbd,
  NumberInput,
  Panel,
  Popover,
  Progress,
  Rating,
  ScrollArea,
  SearchBar,
  Select,
  Separator,
  LOADING_MOTION,
  Skeleton,
  StatCard,
  Stepper,
  Switch,
  TAG_PALETTE,
  TagInput,
  Textarea,
  Timeline,
  Tooltip,
} from '../components/ui';
import Spinner from '../components/Spinner';
import ColorBlindFilters from '../components/dev/ColorBlindFilters';
import { cn } from '../lib/cn';

// Design System docs page (patch 11.185). Inline live demo page showing
// the UI primitives with code snippets and variant matrices. Each demo
// block renders real component instances so the page doubles as a
// visual regression catch-net. Strings are intentionally inline (no
// i18n keys) - this is a docs surface for engineers, not end users.

interface DemoProps {
  name: string;
  description: string;
  code: string;
  children: ReactNode;
}

function Demo({ name, description, code, children }: DemoProps) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card/40 p-4">
      <header className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">{name}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Variants
        </span>
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-dashed border-border bg-background p-3">
          {children}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Code
        </span>
        <CodeBlock code={code} language="tsx" />
      </div>
    </section>
  );
}

function MissingPrimitive({ name }: { name: string }) {
  return (
    <section className="rounded-md border border-dashed border-border bg-card/30 p-3 text-xs text-muted-foreground">
      <strong className="text-foreground">{name}</strong> is not exported from
      <code className="mx-1 rounded bg-muted px-1">components/ui</code>
      yet - placeholder block, skipped gracefully.
    </section>
  );
}

function ButtonDemo() {
  const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive'] as const;
  const sizes = ['sm', 'md', 'lg'] as const;
  return (
    <Demo
      name="Button"
      description="Primary action element. Five variants x three sizes plus disabled."
      code={`<Button variant="default" size="md">Save</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button disabled>Disabled</Button>`}
    >
      <div className="flex flex-col gap-2">
        {variants.map((v) => (
          <div key={v} className="flex flex-wrap items-center gap-2">
            {sizes.map((s) => (
              <Button key={s} variant={v} size={s}>
                {v}/{s}
              </Button>
            ))}
          </div>
        ))}
        <Button disabled>Disabled</Button>
      </div>
    </Demo>
  );
}

function InputDemo() {
  return (
    <Demo
      name="Input"
      description="Single-line text input with optional label, hint, error."
      code={`<Input placeholder="Your name" />
<Input label="Email" hint="We never share it." />
<Input label="Token" error="Required" />
<Input placeholder="Disabled" disabled />`}
    >
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Input placeholder="Your name" />
        <Input label="Email" hint="We never share it." placeholder="you@example.com" />
        <Input label="Token" error="Required" />
        <Input placeholder="Disabled" disabled />
      </div>
    </Demo>
  );
}

function TextareaDemo() {
  return (
    <Demo
      name="Textarea"
      description="Multi-line text input with auto-resize when rows is omitted."
      code={`<Textarea placeholder="Write a note..." rows={3} />`}
    >
      <Textarea placeholder="Write a note..." rows={3} className="w-full max-w-sm" />
    </Demo>
  );
}

function SelectDemo() {
  const [value, setValue] = useState('opus');
  return (
    <Demo
      name="Select"
      description="Custom select with typeahead and keyboard nav."
      code={`<Select
  options={[{ value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }]}
  value={value}
  onChange={setValue}
/>`}
    >
      <Select
        className="w-48"
        options={[
          { value: 'opus', label: 'Opus' },
          { value: 'sonnet', label: 'Sonnet' },
          { value: 'haiku', label: 'Haiku' },
        ]}
        value={value}
        onChange={setValue}
        ariaLabel="Model"
      />
    </Demo>
  );
}

function SwitchDemo() {
  const [on, setOn] = useState(false);
  return (
    <Demo
      name="Switch"
      description="Boolean toggle with an optional inline label."
      code={`<Switch checked={on} onChange={setOn} label="Notifications" />`}
    >
      <Switch checked={on} onChange={setOn} label="Notifications" />
    </Demo>
  );
}

function ColorBlindAuditDemo() {
  // (v1.11.247, TODO 11.229) Side-by-side simulation of the tag
  // palette + signal Badge variants under each of the three
  // common dichromacies (protanopia / deuteranopia / tritanopia)
  // plus the "Normal" baseline. The wrappers apply an SVG
  // colour-matrix via `filter: url(#cb-*)` -- the filter defs
  // live in components/dev/ColorBlindFilters.tsx, mounted at the
  // top of the demo so all four rows reference the same ids.
  const SIMULATIONS = [
    { id: 'normal', label: 'Normal', className: '' },
    { id: 'protanopia', label: 'Protanopia (red)', className: 'cb-protanopia' },
    { id: 'deuteranopia', label: 'Deuteranopia (green)', className: 'cb-deuteranopia' },
    { id: 'tritanopia', label: 'Tritanopia (blue)', className: 'cb-tritanopia' },
  ];
  return (
    <Demo
      name="Colour-blindness audit"
      description="Tag palette + Badge variants rendered under each common dichromacy. The leading icon on every signal Badge is the secondary signal -- a colourblind operator still sees success vs warning vs danger via the icon shape, not just the hue."
      code={`<ColorBlindFilters />
<div className="cb-deuteranopia">
  <Badge variant="success">ok</Badge>
  <Badge variant="warning">busy</Badge>
  <Badge variant="destructive">err</Badge>
</div>`}
    >
      <ColorBlindFilters />
      <div className="flex w-full flex-col gap-3">
        {SIMULATIONS.map((sim) => (
          <div key={sim.id} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{sim.label}</span>
            <div className={cn('flex flex-wrap items-center gap-1.5', sim.className)}>
              {TAG_PALETTE.map((tone) => (
                <span
                  key={`${sim.id}-${tone.id}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border-transparent px-2 py-0.5 text-[11px] font-medium',
                    tone.subtle,
                  )}
                >
                  <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                  {tone.label}
                </span>
              ))}
              <span className="ml-2 inline-flex items-center gap-1.5">
                <Badge variant="success">ok</Badge>
                <Badge variant="warning">busy</Badge>
                <Badge variant="info">note</Badge>
                <Badge variant="destructive">err</Badge>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function TagPaletteDemo() {
  // (v1.11.242, TODO 11.224) Canonical 8-color tag palette. Every
  // status / category surface (Chip, Badge, StatusDot, TagInput
  // chips, tier badges in SpecialistsView) routes through this
  // set so adjacent surfaces stay visually harmonious. Ad-hoc
  // Tailwind hues (bg-green-500, bg-blue-500/10, ...) are out -- use
  // a palette entry instead.
  return (
    <Demo
      name="Tag palette (canonical 8 colors)"
      description="Single source of truth for tag / chip / badge / status colors. 5 status tones (brand/success/warning/info/danger) + 3 accent tones (accent/magenta/neutral). Each entry exposes subtle / solid / outline / dot class strings pinned to shadcn + chart tokens."
      code={`import { TAG_PALETTE, pickTagTone, getTagTone } from '../components/ui';

// Direct lookup by id
getTagTone('success').subtle  // -> 'bg-success/15 text-success'

// Deterministic pick by seed (e.g. tag name)
pickTagTone('reviewer').solid // stable hash -> one of the 8 tones`}
    >
      <div className="flex w-full flex-col gap-3">
        {(['subtle', 'solid', 'outline'] as const).map((surface) => (
          <div key={surface} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {surface}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {TAG_PALETTE.map((tone) => (
                <span
                  key={`${tone.id}-${surface}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border',
                    surface === 'subtle' && 'border-transparent',
                    surface === 'solid' && 'border-transparent',
                    tone[surface],
                  )}
                  title={`${tone.id} (${tone.arpsToken})`}
                >
                  <span
                    aria-hidden
                    className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
                  />
                  {tone.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function ChipDemo() {
  return (
    <Demo
      name="Chip"
      description="Small status pill - subtle / solid / outline x tones."
      code={`<Chip tone="primary">primary</Chip>
<Chip variant="solid" tone="success">success</Chip>
<Chip variant="outline" tone="danger">danger</Chip>`}
    >
      <Chip tone="neutral">neutral</Chip>
      <Chip tone="primary">primary</Chip>
      <Chip variant="solid" tone="success">success</Chip>
      <Chip variant="solid" tone="warning">warning</Chip>
      <Chip variant="outline" tone="danger">danger</Chip>
    </Demo>
  );
}

function BadgeDemo() {
  return (
    <Demo
      name="Badge"
      description="Inline label/count - default / secondary / success / warning / destructive / outline."
      code={`<Badge>default</Badge>
<Badge variant="success">success</Badge>
<Badge variant="destructive">error</Badge>`}
    >
      <Badge>default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="success">success</Badge>
      <Badge variant="warning">warning</Badge>
      <Badge variant="info">info</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="outline">outline</Badge>
    </Demo>
  );
}

function CardPanelDemo() {
  return (
    <Demo
      name="Card / Panel"
      description="Card is the page-level surface; Panel is the inline framed block. Card supports tone='success'|'warning'|'danger' for subdued status tints."
      code={`<Card><CardHeader><CardTitle>Stats</CardTitle></CardHeader>
  <CardContent>Body</CardContent></Card>
<Card tone="success"><CardContent>All checks passed.</CardContent></Card>
<Card tone="warning"><CardContent>Approaching limit.</CardContent></Card>
<Card tone="danger"><CardContent>Worker halted.</CardContent></Card>
<Panel className="p-3">Inline panel</Panel>`}
    >
      <Card className="w-64">
        <CardHeader className="p-3">
          <CardTitle>Stats</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 text-sm text-muted-foreground">
          Card body content.
        </CardContent>
      </Card>
      <Card tone="success" className="w-64">
        <CardContent className="p-3 text-sm">All checks passed.</CardContent>
      </Card>
      <Card tone="warning" className="w-64">
        <CardContent className="p-3 text-sm">Approaching limit.</CardContent>
      </Card>
      <Card tone="danger" className="w-64">
        <CardContent className="p-3 text-sm">Worker halted.</CardContent>
      </Card>
      <Panel className="w-64 p-3 text-sm text-muted-foreground">Inline panel.</Panel>
    </Demo>
  );
}

function AlertDemo() {
  const variants = ['info', 'success', 'warning', 'error', 'neutral'] as const;
  return (
    <Demo
      name="Alert"
      description="Inline banner with five variants: info / success / warning / error / neutral."
      code={`<Alert variant="info" title="Heads up">Body copy.</Alert>
<Alert variant="error" title="Failed">Retry the request.</Alert>`}
    >
      <div className="flex w-full flex-col gap-2">
        {variants.map((v) => (
          <Alert key={v} variant={v} title={v}>
            Alert body for the {v} variant.
          </Alert>
        ))}
      </div>
    </Demo>
  );
}

function EmptyStateDemo() {
  return (
    <Demo
      name="EmptyState"
      description="Centered illustration + title + optional action - shown when a list has no items."
      code={`<EmptyState icon={<Inbox />} title="No items" description="Add one to get started." />`}
    >
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title="No items"
        description="Add one to get started."
        action={{ label: 'Add item', onClick: () => undefined }}
      />
    </Demo>
  );
}

function StatCardDemo() {
  return (
    <Demo
      name="StatCard"
      description="KPI card with optional trend and tone."
      code={`<StatCard label="Workers" value={12} tone="primary" />`}
    >
      <StatCard label="Workers" value={12} tone="primary" noAnimation />
      <StatCard label="Tokens" value={'4.2k'} tone="success" hint="last 24h" noAnimation />
      <StatCard label="Errors" value={3} tone="warning" noAnimation />
    </Demo>
  );
}

function TooltipDemo() {
  return (
    <Demo
      name="Tooltip"
      description="Small label triggered on hover/focus, dismissed by Escape."
      code={`<Tooltip label="Save changes"><Button>Hover me</Button></Tooltip>`}
    >
      <Tooltip label="Save changes">
        <Button variant="outline">Hover me</Button>
      </Tooltip>
    </Demo>
  );
}

function PopoverDemo() {
  return (
    <Demo
      name="Popover"
      description="Floating panel anchored to a trigger - click to toggle."
      code={`<Popover trigger={<Button>Open</Button>} content={<div>Body</div>} />`}
    >
      <Popover
        trigger={<Button variant="outline">Open popover</Button>}
        content={
          <div className="p-2 text-sm text-foreground">
            Popover content body.
          </div>
        }
      />
    </Demo>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Demo
      name="Dialog"
      description="Modal with focus trap + backdrop dismiss."
      code={`<Dialog open={open} onClose={...} title="Confirm">Body</Dialog>`}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm action"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Confirm</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This is a dialog rendered into a portal.
        </p>
      </Dialog>
    </Demo>
  );
}

// (v1.11.297, TODO 11.279) Drawer demo. Shows all four
// anchor sides + the new height prop so designers can scan the
// motion + size shape per side before adopting in a page.
function DrawerDemo() {
  const [open, setOpen] = useState<null | 'left' | 'right' | 'top' | 'bottom'>(
    null,
  );
  return (
    <Demo
      name="Drawer"
      description="Side-anchored panel with focus trap, slide animation (motion-safe), and four anchor sides."
      code={`<Drawer open={open} onOpenChange={setOpen} side="left">body</Drawer>`}
    >
      <div className="flex flex-wrap gap-2">
        {(['left', 'right', 'top', 'bottom'] as const).map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(s)}
          >
            Open {s}
          </Button>
        ))}
      </div>
      <Drawer
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        side={open ?? 'right'}
        title={`${open ?? 'right'} drawer`}
        description="Focus trap is active. Press Escape, click the X, or click the backdrop to close."
        {...(open === 'top' || open === 'bottom' ? { height: '40%' } : {})}
      >
        <p className="text-sm text-muted-foreground">
          The slide animation respects the operator's
          prefers-reduced-motion setting.
        </p>
      </Drawer>
    </Demo>
  );
}

// (v1.11.298, TODO 11.280) Toast demo. Wraps a small inner
// trigger in a ToastProvider so pushToast is scoped to this
// demo and does not collide with the legacy toast portal used
// by Profiles / Templates / Settings. Shows the three kinds +
// an action-button toast.
function ToastDemoInner() {
  const { pushToast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          pushToast({ kind: 'success', message: 'Profile saved.' })
        }
      >
        Success
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          pushToast({
            kind: 'error',
            message: 'Save failed: network timeout.',
            durationMs: 8000,
          })
        }
      >
        Error
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          pushToast({ kind: 'info', message: 'Background job started.' })
        }
      >
        Info
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          pushToast({
            kind: 'success',
            message: 'Snapshot deleted.',
            action: {
              label: 'Undo',
              onClick: () =>
                pushToast({ kind: 'info', message: 'Snapshot restored.' }),
            },
          })
        }
      >
        With action
      </Button>
    </div>
  );
}

function ToastDemo() {
  return (
    <Demo
      name="Toast"
      description="Top-right stack with auto-dismiss, action button slot, and Esc-to-dismiss. Press Esc to close the most recent toast."
      code={`<ToastProvider>{...children that call useToast().pushToast(...)}</ToastProvider>`}
    >
      <ToastProvider defaultDurationMs={4000} visibleLimit={3}>
        <ToastDemoInner />
      </ToastProvider>
    </Demo>
  );
}

// (v1.11.299, TODO 11.281) Tabs demo. Renders all four
// variant x overflow permutations so designers can scan the
// pill vs line shape and the scroll vs wrap behaviour before
// adopting the primitive on a settings / health / detail page.
const TABS_ITEMS = [
  { value: 'overview', label: 'Overview' },
  { value: 'limits', label: 'Limits' },
  { value: 'audit', label: 'Audit log' },
  { value: 'webhooks', label: 'Webhooks' },
  { value: 'experiments', label: 'Experiments' },
];

function TabsDemo() {
  const [pillValue, setPillValue] = useState('overview');
  const [lineValue, setLineValue] = useState('overview');
  return (
    <Demo
      name="Tabs"
      description='Two visual variants ("pill" / "line") + overflow modes ("scroll" / "wrap"). Keyboard ArrowLeft/Right cycles with wrap; the active tab auto-scrolls into view.'
      code={`<Tabs value={...} onChange={...} items={...} variant="line" />`}
    >
      <div className="flex flex-col gap-3">
        <Tabs
          ariaLabel="pill variant"
          value={pillValue}
          onChange={setPillValue}
          items={TABS_ITEMS}
          variant="pill"
        />
        <Tabs
          ariaLabel="line variant"
          value={lineValue}
          onChange={setLineValue}
          items={TABS_ITEMS}
          variant="line"
        />
      </div>
    </Demo>
  );
}

function DropdownMenuDemo() {
  return (
    <Demo
      name="DropdownMenu"
      description="Menu anchored to a trigger with typeahead + arrow key nav."
      code={`<DropdownMenu trigger={<Button>Menu</Button>} items={[{ key:'a', label:'A', onSelect:...}]} />`}
    >
      <DropdownMenu
        trigger={<Button variant="outline">Menu</Button>}
        items={[
          { key: 'edit', label: 'Edit', onSelect: () => undefined },
          { key: 'copy', label: 'Copy', onSelect: () => undefined },
          { key: 'delete', label: 'Delete', variant: 'danger', onSelect: () => undefined },
        ]}
      />
    </Demo>
  );
}

function DataListDemo() {
  return (
    <Demo
      name="DataList"
      description="Key/value pairs with optional copy chip."
      code={`<DataList items={[{ id:'id', label:'ID', value:'abc-123', copyValue:'abc-123' }]} />`}
    >
      <DataList
        className="w-full max-w-sm"
        items={[
          { id: 'id', label: 'ID', value: 'abc-123', copyValue: 'abc-123' },
          { id: 'status', label: 'Status', value: 'idle' },
          { id: 'branch', label: 'Branch', value: 'c4/auto-foo', truncate: true },
        ]}
      />
    </Demo>
  );
}

function TimelineDemo() {
  return (
    <Demo
      name="Timeline"
      description="Vertical event list with tone-coloured dots."
      code={`<Timeline items={[{ id:'1', timestamp:..., title:'Created' }]} />`}
    >
      <Timeline
        className="w-full max-w-sm"
        items={[
          { id: '1', timestamp: '2026-05-14T09:00:00Z', title: 'Created', tone: 'primary' },
          { id: '2', timestamp: '2026-05-14T09:05:00Z', title: 'Running', tone: 'success' },
          { id: '3', timestamp: '2026-05-14T09:10:00Z', title: 'Failed', tone: 'danger' },
        ]}
      />
    </Demo>
  );
}

function StepperDemo() {
  return (
    <Demo
      name="Stepper"
      description="Progress through ordered steps. Horizontal or vertical."
      code={`<Stepper steps={[{id:'a',label:'Plan'},{id:'b',label:'Run'}]} currentIndex={1} />`}
    >
      <Stepper
        className="w-full max-w-md"
        steps={[
          { id: 'plan', label: 'Plan' },
          { id: 'run', label: 'Run' },
          { id: 'ship', label: 'Ship' },
        ]}
        currentIndex={1}
      />
    </Demo>
  );
}

function BreadcrumbsDemo() {
  return (
    <Demo
      name="Breadcrumbs"
      description="Hierarchical navigation trail with optional ellipsis collapsing."
      code={`<Breadcrumbs items={[{ id:'a', label:'Home', href:'/' }, { id:'b', label:'Docs' }]} />`}
    >
      <Breadcrumbs
        items={[
          { id: 'home', label: 'Home', href: '#' },
          { id: 'docs', label: 'Docs', href: '#' },
          { id: 'page', label: 'Design System' },
        ]}
      />
    </Demo>
  );
}

function ScrollAreaDemo() {
  return (
    <Demo
      name="ScrollArea"
      description="Wrapper that constrains overflow and styles the scrollbar."
      code={`<ScrollArea className="h-32 w-48 border p-2">{rows}</ScrollArea>`}
    >
      <ScrollArea className="h-32 w-56 rounded-md border border-border p-2 text-xs">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="py-0.5 text-muted-foreground">
            Row {i + 1}
          </div>
        ))}
      </ScrollArea>
    </Demo>
  );
}

function FileTreeDemo() {
  return (
    <Demo
      name="FileTree"
      description="ARIA tree pattern - folders, files, keyboard nav."
      code={`<FileTree nodes={[{ id:'src', name:'src', type:'folder', children:[...] }]} />`}
    >
      <FileTree
        className="w-64"
        ariaLabel="Sample tree"
        defaultExpanded={['src']}
        nodes={[
          {
            id: 'src',
            name: 'src',
            type: 'folder',
            children: [
              { id: 'app', name: 'App.tsx', type: 'file' },
              { id: 'idx', name: 'index.tsx', type: 'file' },
            ],
          },
          { id: 'pkg', name: 'package.json', type: 'file' },
        ]}
      />
    </Demo>
  );
}

function DatePickerDemo() {
  const [date, setDate] = useState<Date | null>(null);
  const [range, setRange] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });
  return (
    <Demo
      name="DatePicker / DateRangePicker"
      description="Calendar trigger pickers - single date or [from, to] range."
      code={`<DatePicker value={date} onChange={setDate} />
<DateRangePicker value={range} onChange={setRange} />`}
    >
      <DatePicker value={date} onChange={setDate} ariaLabel="Date" />
      <DateRangePicker value={range} onChange={setRange} ariaLabel="Date range" />
    </Demo>
  );
}

function RatingDemo() {
  const [v, setV] = useState(3);
  return (
    <Demo
      name="Rating"
      description="Star rating input - half-step optional."
      code={`<Rating value={v} onChange={setV} />`}
    >
      <Rating value={v} onChange={setV} />
    </Demo>
  );
}

function NumberInputDemo() {
  const [n, setN] = useState<number | undefined>(5);
  return (
    <Demo
      name="NumberInput"
      description="Numeric input with stepper buttons and clamp on blur."
      code={`<NumberInput value={n} onChange={setN} min={0} max={10} />`}
    >
      <NumberInput value={n} onChange={setN} min={0} max={10} ariaLabel="Count" />
    </Demo>
  );
}

function SearchBarDemo() {
  const [q, setQ] = useState('');
  return (
    <Demo
      name="SearchBar"
      description="Debounced search input with clear button."
      code={`<SearchBar value={q} onChange={setQ} placeholder="Search" />`}
    >
      <SearchBar value={q} onChange={setQ} placeholder="Search" ariaLabel="Search" />
    </Demo>
  );
}

function TagInputDemo() {
  const [tags, setTags] = useState<string[]>(['foo', 'bar']);
  return (
    <Demo
      name="TagInput"
      description="Multi-tag input. Enter / comma commit; backspace removes."
      code={`<TagInput value={tags} onChange={setTags} placeholder="Add tag..." />`}
    >
      <TagInput
        className="w-full max-w-sm"
        value={tags}
        onChange={setTags}
        ariaLabel="Tags"
      />
    </Demo>
  );
}

function HScrollDemo() {
  return (
    <Demo
      name="HScroll"
      description="Horizontal scroll list with optional snap + arrows."
      code={`<HScroll arrows snap>{children}</HScroll>`}
    >
      <HScroll className="w-full max-w-md" arrows snap>
        {Array.from({ length: 8 }).map((_, i) => (
          <Panel key={i} className="w-32 shrink-0 p-3 text-sm">
            Item {i + 1}
          </Panel>
        ))}
      </HScroll>
    </Demo>
  );
}

function LoadingMotionDemo() {
  // (v1.11.243, TODO 11.225) Side-by-side visual diff between the
  // Skeleton shimmer and the Spinner rotate so a reviewer can
  // confirm by eye that the unified loading-motion contract is in
  // effect. The summary line surfaces the underlying numbers so
  // the demo doubles as engineering reference.
  const summary = `skeleton ${LOADING_MOTION.skeleton.durationMs}ms ${LOADING_MOTION.skeleton.easing} · spinner ${LOADING_MOTION.spinner.durationMs}ms ${LOADING_MOTION.spinner.easing}`;
  return (
    <Demo
      name="Loading motion (skeleton + spinner harmony)"
      description={`Shared duration + easing contract for the two loading primitives. ${summary}. Both drop the animation under prefers-reduced-motion: reduce.`}
      code={`import { LOADING_MOTION, getLoadingMotionStyle } from '../components/ui';

LOADING_MOTION.skeleton // { durationMs: 1800, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
LOADING_MOTION.spinner  // { durationMs: 1200, easing: 'linear' }

// Both primitives consume useReducedMotion() and emit
// data-motion-reduced when the reduce gate fires.`}
    >
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Skeleton</span>
            <code className="rounded bg-muted px-1 text-[10px]">
              {LOADING_MOTION.skeleton.durationMs}ms
            </code>
          </div>
          <Skeleton variant="line" />
          <Skeleton variant="line" className="w-4/5" />
          <Skeleton variant="line" className="w-3/5" />
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Spinner</span>
            <code className="rounded bg-muted px-1 text-[10px]">
              {LOADING_MOTION.spinner.durationMs}ms
            </code>
          </div>
          <div className="flex items-center gap-3 text-primary">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </div>
          <span className="text-[10px] text-muted-foreground">
            1.5 rotations per shimmer pulse (3:2 period ratio).
          </span>
        </div>
      </div>
    </Demo>
  );
}

function ProgressDemo() {
  return (
    <Demo
      name="Progress"
      description="Linear progress bar - determinate, indeterminate, tone variants."
      code={`<Progress value={42} label />
<Progress indeterminate variant="success" />`}
    >
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Progress value={42} label />
        <Progress value={75} variant="success" label />
        <Progress indeterminate variant="warning" />
      </div>
    </Demo>
  );
}

function AvatarDemo() {
  return (
    <Demo
      name="Avatar / AvatarShape"
      description="Initials-based avatar in three sizes; AvatarShape is the loading skeleton."
      code={`<Avatar name="Ada Lovelace" />
<AvatarShape size="md" />`}
    >
      <Avatar name="Ada Lovelace" size="sm" />
      <Avatar name="Linus Torvalds" size="md" />
      <Avatar name="Grace Hopper" size="lg" />
      <AvatarShape size="md" />
    </Demo>
  );
}

function KbdDemo() {
  return (
    <Demo
      name="Kbd"
      description="Keyboard shortcut chip - e.g. Ctrl+B."
      code={`<Kbd keys={['Ctrl', 'B']} />`}
    >
      <Kbd keys={['Ctrl', 'B']} />
      <Kbd keys={['Cmd', 'Shift', 'P']} />
    </Demo>
  );
}

function SeparatorDemo() {
  return (
    <Demo
      name="Separator"
      description="Horizontal or vertical divider line."
      code={`<Separator />
<Separator orientation="vertical" />`}
    >
      <div className="flex w-full max-w-sm flex-col gap-2">
        <span className="text-xs text-muted-foreground">Above</span>
        <Separator />
        <span className="text-xs text-muted-foreground">Below</span>
      </div>
    </Demo>
  );
}

const CATEGORIES: { label: string; demos: ReactNode }[] = [
  {
    label: 'Inputs',
    demos: (
      <>
        <InputDemo />
        <TextareaDemo />
        <SelectDemo />
        <SwitchDemo />
        <NumberInputDemo />
        <SearchBarDemo />
        <TagInputDemo />
        <DatePickerDemo />
        <RatingDemo />
      </>
    ),
  },
  {
    label: 'Buttons',
    demos: (
      <>
        <ButtonDemo />
      </>
    ),
  },
  {
    label: 'Display',
    demos: (
      <>
        <TagPaletteDemo />
        <ColorBlindAuditDemo />
        <ChipDemo />
        <BadgeDemo />
        <CardPanelDemo />
        <StatCardDemo />
        <AvatarDemo />
        <KbdDemo />
        <SeparatorDemo />
        <DataListDemo />
        <TimelineDemo />
        <LoadingMotionDemo />
        <ProgressDemo />
      </>
    ),
  },
  {
    label: 'Feedback',
    demos: (
      <>
        <AlertDemo />
        <EmptyStateDemo />
      </>
    ),
  },
  {
    label: 'Layout',
    demos: (
      <>
        <ScrollAreaDemo />
        <HScrollDemo />
      </>
    ),
  },
  {
    label: 'Navigation',
    demos: (
      <>
        <BreadcrumbsDemo />
        <StepperDemo />
        <TooltipDemo />
        <PopoverDemo />
        <DialogDemo />
        <DrawerDemo />
        <ToastDemo />
        <TabsDemo />
        <DropdownMenuDemo />
        <FileTreeDemo />
      </>
    ),
  },
];

export default function DesignSystem() {
  return (
    <PageFrame
      title="Design System"
      description="Live demos of the UI primitives in web/src/components/ui. Tokens follow the ARPS palette source-of-truth (arps-design-system-v1/USAGE.md)."
    >
      <Alert
        variant="info"
        icon={<Palette className="h-4 w-4" aria-hidden="true" />}
        title="Reference"
      >
        Tokens (colors, spacing, radii) inherit from the ARPS design system.
        See <code className="rounded bg-muted px-1">arps-design-system-v1/USAGE.md</code>.
      </Alert>
      <CollapsibleGroup exclusive={false} defaultOpenId="cat-inputs">
        {CATEGORIES.map((cat, idx) => (
          <Collapsible
            key={cat.label}
            title={cat.label}
            defaultOpen={idx === 0}
            className={cn('w-full')}
          >
            <div className="flex flex-col gap-4">{cat.demos}</div>
          </Collapsible>
        ))}
      </CollapsibleGroup>
    </PageFrame>
  );
}
