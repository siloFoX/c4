# metricsbar-wireup — mount MetricsBar in App.tsx

## Why

The MetricsBar component (cli-doctor base) was shipped but not mounted. This wireup adds it to App.tsx so every tab shows live daemon CPU/RSS/load at a glance.

## What changed

`web/src/App.tsx`:

```diff
+ import MetricsBar from './components/MetricsBar';
...
  <div className="flex h-screen flex-col bg-background text-foreground">
    <HelpUIRoot />
    <AppHeader ... />
+   <MetricsBar />
    {/* existing tab body */}
  </div>
```

`MetricsBar` polls `/api/metrics` every 5s, renders a thin strip below the header with daemon `pid uptime cpus load rss` + per-worker totals.

## Live verification (2026-05-01)

`verify-metricsbar.js` (3/3 pass): App.tsx imports MetricsBar, page renders without console errors, /api/metrics endpoint returns 200.
