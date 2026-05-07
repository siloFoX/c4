import { Panel } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { TYPE_FILL } from './WorkflowGraph';
import type { WorkflowNode } from './WorkflowEditor';

// (v1.10.569) Extracted from WorkflowEditor. The right-pane
// node properties inspector — shown when a graph node is
// selected; renders an empty hint otherwise. Pure display.

interface Props {
  node: WorkflowNode | null;
}

export default function WorkflowNodeProperties({ node }: Props) {
  useLocale();
  if (!node) {
    return (
      <Panel className="text-sm text-muted-foreground">
        {t('workflows.editor.selectNode')}
      </Panel>
    );
  }
  return (
    <Panel className="text-sm text-foreground">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-base font-semibold text-foreground">
          {node.name || node.id}
        </h4>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          style={{ background: TYPE_FILL[node.type] || '#444' }}
        >
          {node.type}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{tFormat('workflowEditor.idPrefix', { id: node.id })}</div>
      <div className="mt-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          config
        </div>
        <pre tabIndex={0} className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-background p-2 text-xs text-foreground">
          {JSON.stringify(node.config || {}, null, 2)}
        </pre>
      </div>
    </Panel>
  );
}
