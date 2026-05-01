# cli-metrics — `c4 metrics` + `GET /metrics`

## Why

`worker-metrics.js` (cli-doctor base) sampled CPU/RSS but had no operator-facing surface. Web UI had MetricsBar but the CLI had nothing — ops watching a long-running fleet from a terminal had to `curl http://localhost:3456/list | jq` and parse manually.

## What changed

### `GET /metrics` (`src/daemon.js`)

Returns `manager.metrics()` (per-worker + daemon snapshot):

```json
{
  "daemon": { "platform", "pid", "uptimeSec", "rssKb", "heapUsedKb", "heapTotalKb", "cpus", "loadavg" },
  "workers": [{ "name", "status", "pid", "cpuPct", "rssKb", "threads" }, ...],
  "totals": { "liveWorkers", "totalWorkers", "totalCpuPct", "totalRssKb" }
}
```

### `c4 metrics` (`src/cli.js`)

Pretty-print formatter:

- Daemon header (pid / uptime / cpus / load / rss / heap)
- Totals row (live workers / cpu% / rss)
- Per-worker table (NAME / STATUS / PID / CPU% / RSS / THREADS)

`--json` flag passes through the raw payload.

### `pty-manager.metrics()`

Wires `worker-metrics` per-worker sampling into the response shape.

## Tests

- `tests/metrics-wireup.test.js` — 112 assertions on /metrics shape, threading, sample lifecycle.

## Live verification (2026-05-01)

```
$ c4 metrics
Daemon  pid=335219  uptime=16s  cpus=20  load=[0.18, 0.18, 0.18]
        rss=88.2 MB  heap=8.1 MB/10.0 MB
Workers 0 live / 0 total  cpu=0.0%  rss=0 KB
```
