'use strict';

// (v1.11.101 / TODO 11.83) Prometheus text exposition format helper for
// the daemon's /api/metrics/prometheus endpoint.
//
// formatMetrics(workers, counters) takes a (possibly empty) collection
// of worker entries and a counter object, and returns a single string in
// the Prometheus text exposition format (version 0.0.4).
//
// Output layout (sections are emitted in this fixed order so a diff
// between two snapshots is stable):
//   c4_worker_rss_bytes        gauge   per-worker, sorted by name
//   c4_worker_cpu_percent      gauge   per-worker, sorted by name
//   c4_dispatch_total_count    counter daemon-wide
//   c4_escalation_total_count  counter daemon-wide
//
// Each worker entry contributes one rss row + one cpu row; rows for
// values that are null / undefined / NaN are skipped (Prometheus treats
// missing data points as expected, and 0 would be a misleading
// substitute for a sample that did not exist).
//
// Counter values that are missing from `counters` still emit their
// HELP / TYPE lines + a `0` sample so a scraping target always finds
// every series the daemon promises.
//
// Worker entry shape (the caller normalizes from manager.metrics() +
// manager.list()):
//   {
//     name:    string          required
//     tier:    string           optional (defaults to 'worker')
//     target:  string           optional (defaults to 'local')
//     rssBytes: number | null   optional (used as-is if present)
//     rssKb:    number | null   optional (converted to bytes; ignored
//                                if rssBytes is also present)
//     cpuPct:   number | null   optional
//   }

const HELP_RSS = 'Resident set size of a c4 worker process';
const HELP_CPU = 'CPU percent of a c4 worker process (last sample)';
const HELP_DISPATCH = 'Total autonomous dispatch events since daemon start';
const HELP_ESCALATION = 'Total escalation events since daemon start';

// Prometheus label values must escape backslash, double-quote, and
// newline (per the text exposition spec). Carriage returns are not
// listed in the spec but pass through harmlessly; we normalize them to
// \n so a CRLF-bearing name does not produce a literal CR in the
// scrape body.
function escapeLabelValue(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n?/g, '\\n')
    .replace(/\n/g, '\\n');
}

function _renderLabels(worker) {
  const name = escapeLabelValue(worker.name);
  const tier = escapeLabelValue(worker.tier || 'worker');
  const target = escapeLabelValue(worker.target || 'local');
  return 'name="' + name + '",tier="' + tier + '",target="' + target + '"';
}

// Accept any reasonable shape: an Array, an iterable, a Map (-> values),
// or a plain object (-> values). Returns a defensively-copied,
// name-sorted array so the format pass is stable + immune to caller
// mutation.
function _normalizeWorkers(workers) {
  let arr;
  if (workers == null) {
    arr = [];
  } else if (Array.isArray(workers)) {
    arr = workers.slice();
  } else if (workers instanceof Map) {
    arr = Array.from(workers.values());
  } else if (typeof workers[Symbol.iterator] === 'function') {
    arr = Array.from(workers);
  } else if (typeof workers === 'object') {
    arr = Object.values(workers);
  } else {
    arr = [];
  }
  arr = arr.filter((w) => w && typeof w === 'object' && w.name != null);
  arr.sort((a, b) => {
    const an = String(a.name);
    const bn = String(b.name);
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });
  return arr;
}

function _coerceRssBytes(worker) {
  if (typeof worker.rssBytes === 'number' && Number.isFinite(worker.rssBytes)) {
    return Math.round(worker.rssBytes);
  }
  if (typeof worker.rssKb === 'number' && Number.isFinite(worker.rssKb)) {
    return Math.round(worker.rssKb * 1024);
  }
  return null;
}

function _coerceCpuPct(worker) {
  if (typeof worker.cpuPct === 'number' && Number.isFinite(worker.cpuPct)) {
    return worker.cpuPct;
  }
  return null;
}

function _coerceCounter(counters, key) {
  if (!counters || typeof counters !== 'object') return 0;
  const v = counters[key];
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    return Math.round(v);
  }
  return 0;
}

function formatMetrics(workersInput, countersInput) {
  const workers = _normalizeWorkers(workersInput);
  const counters = countersInput && typeof countersInput === 'object' ? countersInput : {};

  const lines = [];

  lines.push('# HELP c4_worker_rss_bytes ' + HELP_RSS);
  lines.push('# TYPE c4_worker_rss_bytes gauge');
  for (const w of workers) {
    const rss = _coerceRssBytes(w);
    if (rss === null) continue;
    lines.push('c4_worker_rss_bytes{' + _renderLabels(w) + '} ' + rss);
  }

  lines.push('# HELP c4_worker_cpu_percent ' + HELP_CPU);
  lines.push('# TYPE c4_worker_cpu_percent gauge');
  for (const w of workers) {
    const cpu = _coerceCpuPct(w);
    if (cpu === null) continue;
    lines.push('c4_worker_cpu_percent{' + _renderLabels(w) + '} ' + cpu);
  }

  lines.push('# HELP c4_dispatch_total_count ' + HELP_DISPATCH);
  lines.push('# TYPE c4_dispatch_total_count counter');
  lines.push('c4_dispatch_total_count ' + _coerceCounter(counters, 'dispatch'));

  lines.push('# HELP c4_escalation_total_count ' + HELP_ESCALATION);
  lines.push('# TYPE c4_escalation_total_count counter');
  lines.push('c4_escalation_total_count ' + _coerceCounter(counters, 'escalation'));

  return lines.join('\n') + '\n';
}

module.exports = {
  formatMetrics,
  escapeLabelValue,
};
