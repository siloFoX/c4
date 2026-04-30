// Projects view (10.3). Pulls /api/projects and renders one card per
// project with active workers, queued tasks, and recent task history.

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, GitBranch, ListTodo, Activity } from 'lucide-react';
import { cn } from '../lib/cn';

interface ProjectWorker {
  name: string;
  status: string;
  branch: string | null;
  pid: number | null;
  intervention: string | null;
}

interface ProjectQueued {
  name: string;
  task: string;
  branch: string | null;
}

interface ProjectRecent {
  name: string;
  task?: string | null;
  branch?: string | null;
  completedAt?: string | null;
  status?: string;
}

interface Project {
  name: string;
  description?: string;
  root?: string | null;
  owners?: string[];
  workers: ProjectWorker[];
  queued: ProjectQueued[];
  recentTasks: ProjectRecent[];
}

interface Resp {
  projects?: Project[];
  error?: string;
}

export default function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Resp;
      if (data.error) setError(data.error);
      else { setProjects(data.projects || []); setError(null); }
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Briefcase size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Projects</h2>
        <span className="ml-auto text-[11px] text-muted">{projects.length} project(s)</span>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto pb-2 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
        {projects.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted md:col-span-2 xl:col-span-3">
            No projects mapped yet — add entries to <code className="rounded bg-surface-2 px-1.5 py-0.5">config.projects</code>.
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const isUnassigned = project.name === 'unassigned';
  return (
    <div className={cn(
      'flex flex-col gap-2 rounded-lg border bg-surface-2 p-3 shadow-soft',
      isUnassigned ? 'border-warning/30' : 'border-border',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold">{project.name}</div>
          {project.description && (
            <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{project.description}</div>
          )}
        </div>
        <span className={cn(
          'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          isUnassigned ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success',
        )}>
          {project.workers.length} active
        </span>
      </div>

      {project.root && (
        <div className="flex items-center gap-1 truncate text-[11px] text-muted">
          <GitBranch size={11} className="shrink-0" />
          <span className="truncate font-mono">{project.root}</span>
        </div>
      )}

      <Section icon={Activity} label="Workers" count={project.workers.length}>
        {project.workers.slice(0, 5).map((w) => (
          <div key={w.name} className="flex items-center justify-between gap-2 truncate text-[11px]">
            <span className="truncate font-mono">{w.name}</span>
            <span className="text-muted">{w.status}{w.intervention ? ` · ${w.intervention}` : ''}</span>
          </div>
        ))}
        {project.workers.length === 0 && <Empty />}
      </Section>

      <Section icon={ListTodo} label="Queued" count={project.queued.length}>
        {project.queued.slice(0, 5).map((q, i) => (
          <div key={i} className="truncate text-[11px]">
            <span className="font-mono text-foreground/80">{q.name}</span>
            <span className="ml-1 text-muted">{q.task}</span>
          </div>
        ))}
        {project.queued.length === 0 && <Empty />}
      </Section>

      <Section icon={Activity} label="Recent" count={project.recentTasks.length}>
        {project.recentTasks.slice(0, 5).map((r, i) => (
          <div key={i} className="truncate text-[11px]">
            <span className="text-muted/80">{r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '-'}</span>
            <span className="ml-1 text-foreground/80">{r.task || '(no task)'}</span>
          </div>
        ))}
        {project.recentTasks.length === 0 && <Empty />}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon, label, count, children,
}: { icon: typeof Briefcase; label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
        <Icon size={11} />
        {label}
        <span className="ml-auto text-muted/70">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-[11px] italic text-muted/70">none</div>;
}
