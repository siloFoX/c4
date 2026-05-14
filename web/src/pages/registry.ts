// Registry of feature pages added for TODO 8.20 part B. Pages live in
// web/src/pages/<Name>.tsx and are surfaced through the Features tab in
// AppHeader. Each entry wires the page into a sidebar category
// (Operations / Automation / Cost / Config / Diagnostics) and gives a
// short description used for the empty state and page header.

import type { ComponentType } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  Brain,
  Coins,
  Cog,
  Feather,
  FileCheck2,
  FolderTree,
  GitBranch,
  Keyboard,
  Layers,
  LayoutGrid,
  Layers3,
  ListChecks,
  ListOrdered,
  Palette,
  Rocket,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Sparkles,
  Sunrise,
  ToggleRight,
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
  // (v1.10.493) labelKey + descriptionKey resolved through t() at
  // render time. The previous string fields are gone; consumers call
  // t(feature.labelKey) / t(feature.descriptionKey).
  labelKey: string;
  descriptionKey: string;
  category: FeatureCategory;
  Icon: IconType<SVGProps<SVGSVGElement>>;
  // Lazy loader so the bundle keeps code-splitting as pages grow.
  load: () => Promise<{ default: ComponentType }>;
}

export const FEATURES: FeatureDef[] = [
  {
    id: 'scribe',
    labelKey: 'feature.scribe.label',
    descriptionKey: 'feature.scribe.description',
    category: 'operations',
    Icon: Feather,
    load: () => import('./Scribe'),
  },
  {
    id: 'batch',
    labelKey: 'feature.batch.label',
    descriptionKey: 'feature.batch.description',
    category: 'operations',
    Icon: Layers3,
    load: () => import('./Batch'),
  },
  {
    id: 'cleanup',
    labelKey: 'feature.cleanup.label',
    descriptionKey: 'feature.cleanup.description',
    category: 'operations',
    Icon: Trash2,
    load: () => import('./Cleanup'),
  },
  {
    id: 'swarm',
    labelKey: 'feature.swarm.label',
    descriptionKey: 'feature.swarm.description',
    category: 'operations',
    Icon: GitBranch,
    load: () => import('./Swarm'),
  },
  {
    id: 'token-usage',
    labelKey: 'feature.tokenUsage.label',
    descriptionKey: 'feature.tokenUsage.description',
    category: 'cost',
    Icon: BarChart3,
    load: () => import('./TokenUsage'),
  },
  {
    id: 'plan',
    labelKey: 'feature.plan.label',
    descriptionKey: 'feature.plan.description',
    category: 'automation',
    Icon: Brain,
    load: () => import('./Plan'),
  },
  {
    id: 'morning',
    labelKey: 'feature.morning.label',
    descriptionKey: 'feature.morning.description',
    category: 'automation',
    Icon: Sunrise,
    load: () => import('./Morning'),
  },
  {
    id: 'auto',
    labelKey: 'feature.auto.label',
    descriptionKey: 'feature.auto.description',
    category: 'automation',
    Icon: Rocket,
    load: () => import('./Auto'),
  },
  {
    id: 'queue',
    labelKey: 'feature.queue.label',
    descriptionKey: 'feature.queue.description',
    category: 'automation',
    Icon: ListOrdered,
    load: () => import('./Queue'),
  },
  {
    id: 'templates',
    labelKey: 'feature.templates.label',
    descriptionKey: 'feature.templates.description',
    category: 'config',
    Icon: ScrollText,
    load: () => import('./Templates'),
  },
  {
    id: 'profiles',
    labelKey: 'feature.profiles.label',
    descriptionKey: 'feature.profiles.description',
    category: 'config',
    Icon: ListChecks,
    load: () => import('./Profiles'),
  },
  {
    id: 'config',
    labelKey: 'feature.config.label',
    descriptionKey: 'feature.config.description',
    category: 'config',
    Icon: Cog,
    load: () => import('./Config'),
  },
  {
    id: 'settings-page',
    labelKey: 'feature.settingsPage.label',
    descriptionKey: 'feature.settingsPage.description',
    category: 'config',
    Icon: SettingsIcon,
    load: () => import('./Settings'),
  },
  {
    id: 'workspaces',
    labelKey: 'feature.workspaces.label',
    descriptionKey: 'feature.workspaces.description',
    category: 'config',
    Icon: FolderTree,
    load: () => import('./Workspaces'),
  },
  {
    id: 'rbac',
    labelKey: 'feature.rbac.label',
    descriptionKey: 'feature.rbac.description',
    category: 'config',
    Icon: ShieldCheck,
    load: () => import('./Rbac'),
  },
  {
    id: 'design-system',
    labelKey: 'feature.designSystem.label',
    descriptionKey: 'feature.designSystem.description',
    category: 'config',
    Icon: Palette,
    load: () => import('./DesignSystem'),
  },
  {
    id: 'snapshots',
    labelKey: 'feature.snapshots.label',
    descriptionKey: 'feature.snapshots.description',
    category: 'config',
    Icon: Archive,
    load: () => import('./Snapshots'),
  },
  {
    id: 'keyboard-map',
    labelKey: 'feature.keyboardMap.label',
    descriptionKey: 'feature.keyboardMap.description',
    category: 'config',
    Icon: Keyboard,
    load: () => import('./KeyboardMap'),
  },
  {
    id: 'feature-flags',
    labelKey: 'feature.featureFlags.label',
    descriptionKey: 'feature.featureFlags.description',
    category: 'config',
    Icon: ToggleRight,
    load: () => import('./FeatureFlags'),
  },
  {
    id: 'notifications',
    labelKey: 'feature.notifications.label',
    descriptionKey: 'feature.notifications.description',
    category: 'diagnostics',
    Icon: Bell,
    load: () => import('./Notifications'),
  },
  {
    id: 'health',
    labelKey: 'feature.health.label',
    descriptionKey: 'feature.health.description',
    category: 'diagnostics',
    Icon: LayoutGrid,
    load: () => import('./Health'),
  },
  {
    id: 'validation',
    labelKey: 'feature.validation.label',
    descriptionKey: 'feature.validation.description',
    category: 'diagnostics',
    Icon: FileCheck2,
    load: () => import('./Validation'),
  },
  {
    id: 'risk',
    labelKey: 'feature.risk.label',
    descriptionKey: 'feature.risk.description',
    category: 'diagnostics',
    Icon: Shield,
    load: () => import('./Risk'),
  },
  {
    id: 'error-reports',
    labelKey: 'feature.errorReports.label',
    descriptionKey: 'feature.errorReports.description',
    category: 'diagnostics',
    Icon: AlertTriangle,
    load: () => import('./ErrorReports'),
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
