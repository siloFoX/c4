// Registry of feature pages added for TODO 8.20 part B. Pages live in
// web/src/pages/<Name>.tsx and are surfaced through the Features tab in
// AppHeader. Each entry wires the page into a sidebar category
// (Operations / Automation / Cost / Config / Diagnostics) and gives a
// short description used for the empty state and page header.

import type { ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  Brain,
  Coins,
  Feather,
  FileCheck2,
  GitBranch,
  Layers,
  LayoutGrid,
  Layers3,
  ListChecks,
  Rocket,
  ScrollText,
  Sparkles,
  Sunrise,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { ComponentType as IconType, SVGProps } from 'react';

export type FeatureCategory =
  | 'operations'
  | 'automation'
  | 'cost'
  | 'config'
  | 'diagnostics';

export const CATEGORY_LABEL: Record<FeatureCategory, string> = {
  operations: 'Operations',
  automation: 'Automation',
  cost: 'Cost',
  config: 'Config',
  diagnostics: 'Diagnostics',
};

export const CATEGORY_ICON: Record<
  FeatureCategory,
  IconType<SVGProps<SVGSVGElement>>
> = {
  operations: Wrench,
  automation: Sparkles,
  cost: Coins,
  config: Layers,
  diagnostics: Activity,
};

// Ordered so the sidebar renders categories in the order the task spec
// lists (Operations, Cost, Automation, Config, Diagnostics).
export const CATEGORY_ORDER: FeatureCategory[] = [
  'operations',
  'cost',
  'automation',
  'config',
  'diagnostics',
];

export interface FeatureDef {
  id: string;
  label: string;
  description: string;
  category: FeatureCategory;
  Icon: IconType<SVGProps<SVGSVGElement>>;
  // Lazy loader so the bundle keeps code-splitting as pages grow.
  load: () => Promise<{ default: ComponentType }>;
}

export const FEATURES: FeatureDef[] = [
  {
    id: 'scribe',
    label: 'Scribe',
    description: 'Session context recorder — start/stop/scan and view snapshots.',
    category: 'operations',
    Icon: Feather,
    load: () => import('./Scribe'),
  },
  {
    id: 'batch',
    label: 'Batch',
    description: 'Dispatch N workers with the same task or one per line.',
    category: 'operations',
    Icon: Layers3,
    load: () => import('./Batch'),
  },
  {
    id: 'cleanup',
    label: 'Cleanup',
    description: 'Remove orphan worktrees and dead c4/ branches.',
    category: 'operations',
    Icon: Trash2,
    load: () => import('./Cleanup'),
  },
  {
    id: 'swarm',
    label: 'Swarm',
    description: 'Swarm tree and per-node status for a worker.',
    category: 'operations',
    Icon: GitBranch,
    load: () => import('./Swarm'),
  },
  {
    id: 'token-usage',
    label: 'Token usage',
    description: 'Token consumption per worker / day with tier quota caps.',
    category: 'cost',
    Icon: BarChart3,
    load: () => import('./TokenUsage'),
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Dispatch a planner task and render the resulting plan.md.',
    category: 'automation',
    Icon: Brain,
    load: () => import('./Plan'),
  },
  {
    id: 'morning',
    label: 'Morning report',
    description: 'Generate the daily morning report — what happened, what is open.',
    category: 'automation',
    Icon: Sunrise,
    load: () => import('./Morning'),
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Spawn an autonomous manager + scribe for a given task.',
    category: 'automation',
    Icon: Rocket,
    load: () => import('./Auto'),
  },
  {
    id: 'templates',
    label: 'Templates',
    description: 'Worker templates — reusable agent/model/effort presets.',
    category: 'config',
    Icon: ScrollText,
    load: () => import('./Templates'),
  },
  {
    id: 'profiles',
    label: 'Profiles',
    description: 'Permission profiles — allow/deny matrix for worker scopes.',
    category: 'config',
    Icon: ListChecks,
    load: () => import('./Profiles'),
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Daemon status, uptime, queue depth and loaded modules.',
    category: 'diagnostics',
    Icon: LayoutGrid,
    load: () => import('./Health'),
  },
  {
    id: 'validation',
    label: 'Validation',
    description: 'Per-worker validation object — tests / typecheck / lint summary.',
    category: 'diagnostics',
    Icon: FileCheck2,
    load: () => import('./Validation'),
  },
];

export function findFeature(id: string | null): FeatureDef | undefined {
  if (!id) return undefined;
  return FEATURES.find((f) => f.id === id);
}

export function featuresByCategory(): Record<FeatureCategory, FeatureDef[]> {
  const out: Record<FeatureCategory, FeatureDef[]> = {
    operations: [],
    automation: [],
    cost: [],
    config: [],
    diagnostics: [],
  };
  for (const f of FEATURES) out[f.category].push(f);
  return out;
}
