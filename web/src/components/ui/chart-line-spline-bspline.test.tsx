import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineSplineBspline,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_HEIGHT,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_PADDING,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_TICK_COUNT,
  DEFAULT_CHART_LINE_SPLINE_BSPLINE_WIDTH,
  buildLineSplineBsplineBezierPath,
  buildLineSplineBsplineClampedControlPoints,
  classifyLineSplineBsplineResidualSign,
  computeLineSplineBsplineLayout,
  convertCubicBSplineSegmentToBezier,
  describeLineSplineBsplineChart,
  evaluateCubicBSplineSegment,
  getLineSplineBsplineDefaultColor,
  getLineSplineBsplineFinitePoints,
  interpolateLineSplineBsplineSmoothedAt,
  normaliseLineSplineBsplineSamplesPerSegment,
  runLineBSpline,
  sampleLineSplineBsplineCurve,
  type ChartLineSplineBsplineSeries,
} from './chart-line-spline-bspline';

afterEach(() => {
  cleanup();
});

describe('chart-line-spline-bspline defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_TICK_COUNT).toBeGreaterThan(0);
  });
  it('samples per segment default is at least 2', () => {
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT).toBeGreaterThanOrEqual(2);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE.length).toBe(10);
  });
  it('degree is cubic (3)', () => {
    expect(DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE).toBe(3);
  });
});

describe('getLineSplineBsplineDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE.length;
    expect(getLineSplineBsplineDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[0],
    );
    expect(getLineSplineBsplineDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[0],
    );
    expect(getLineSplineBsplineDefaultColor(len + 1)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[1],
    );
  });
  it('handles non-finite and negative indices', () => {
    expect(getLineSplineBsplineDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[0],
    );
    expect(getLineSplineBsplineDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_PALETTE[0],
    );
  });
});

describe('getLineSplineBsplineFinitePoints', () => {
  it('drops non-finite values', () => {
    const filtered = getLineSplineBsplineFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(filtered.length).toBe(2);
    expect(filtered[0]!.x).toBe(0);
    expect(filtered[1]!.x).toBe(2);
  });
  it('null returns empty array', () => {
    expect(getLineSplineBsplineFinitePoints(null)).toEqual([]);
    expect(getLineSplineBsplineFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineSplineBsplineSamplesPerSegment', () => {
  it('defaults for non-finite', () => {
    expect(normaliseLineSplineBsplineSamplesPerSegment(NaN)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT,
    );
    expect(normaliseLineSplineBsplineSamplesPerSegment(undefined)).toBe(
      DEFAULT_CHART_LINE_SPLINE_BSPLINE_SAMPLES_PER_SEGMENT,
    );
  });
  it('clamps to [2, 256]', () => {
    expect(normaliseLineSplineBsplineSamplesPerSegment(1)).toBe(2);
    expect(normaliseLineSplineBsplineSamplesPerSegment(-5)).toBe(2);
    expect(normaliseLineSplineBsplineSamplesPerSegment(500)).toBe(256);
  });
  it('floors fractional values', () => {
    expect(normaliseLineSplineBsplineSamplesPerSegment(8.7)).toBe(8);
  });
  it('identity in range', () => {
    expect(normaliseLineSplineBsplineSamplesPerSegment(16)).toBe(16);
    expect(normaliseLineSplineBsplineSamplesPerSegment(64)).toBe(64);
  });
});

describe('classifyLineSplineBsplineResidualSign', () => {
  it('positive / negative / zero', () => {
    expect(classifyLineSplineBsplineResidualSign(1)).toBe('positive');
    expect(classifyLineSplineBsplineResidualSign(-1)).toBe('negative');
    expect(classifyLineSplineBsplineResidualSign(0)).toBe('zero');
  });
  it('null and non-finite', () => {
    expect(classifyLineSplineBsplineResidualSign(null)).toBe('zero');
    expect(classifyLineSplineBsplineResidualSign(NaN)).toBe('zero');
    expect(classifyLineSplineBsplineResidualSign(Infinity)).toBe('zero');
  });
});

describe('buildLineSplineBsplineClampedControlPoints', () => {
  it('empty returns empty', () => {
    expect(buildLineSplineBsplineClampedControlPoints([])).toEqual([]);
  });
  it('single returns single (degenerate)', () => {
    expect(
      buildLineSplineBsplineClampedControlPoints([{ x: 1, y: 2 }]),
    ).toEqual([{ x: 1, y: 2 }]);
  });
  it('duplicates first twice and last twice', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
    ];
    const padded = buildLineSplineBsplineClampedControlPoints(raw);
    expect(padded.length).toBe(raw.length + 4);
    expect(padded[0]).toEqual(raw[0]);
    expect(padded[1]).toEqual(raw[0]);
    expect(padded[2]).toEqual(raw[0]);
    expect(padded[padded.length - 1]).toEqual(raw[raw.length - 1]);
    expect(padded[padded.length - 2]).toEqual(raw[raw.length - 1]);
    expect(padded[padded.length - 3]).toEqual(raw[raw.length - 1]);
  });
});

describe('evaluateCubicBSplineSegment', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 1, y: 2 };
  const p2 = { x: 2, y: 5 };
  const p3 = { x: 3, y: 1 };

  it('at t=0 returns (P0 + 4*P1 + P2) / 6', () => {
    const v = evaluateCubicBSplineSegment(p0, p1, p2, p3, 0);
    expect(v.x).toBeCloseTo((0 + 4 + 2) / 6, 10);
    expect(v.y).toBeCloseTo((0 + 8 + 5) / 6, 10);
  });
  it('at t=1 returns (P1 + 4*P2 + P3) / 6', () => {
    const v = evaluateCubicBSplineSegment(p0, p1, p2, p3, 1);
    expect(v.x).toBeCloseTo((1 + 8 + 3) / 6, 10);
    expect(v.y).toBeCloseTo((2 + 20 + 1) / 6, 10);
  });
  it('constant control points -> constant output across t', () => {
    const c = { x: 7, y: 11 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const v = evaluateCubicBSplineSegment(c, c, c, c, t);
      expect(v.x).toBeCloseTo(7, 10);
      expect(v.y).toBeCloseTo(11, 10);
    }
  });
  it('basis function partition of unity (sum=6/6=1 weight) verified through constant', () => {
    // Sum of B-spline basis at any t equals 1, so a constant value
    // c is reproduced exactly regardless of basis weights. This
    // tests the partition-of-unity property indirectly.
    const c = { x: 42, y: -3 };
    const v = evaluateCubicBSplineSegment(c, c, c, c, 0.5);
    expect(v.x).toBeCloseTo(42, 10);
    expect(v.y).toBeCloseTo(-3, 10);
  });
  it('clamps t outside [0, 1] and handles non-finite', () => {
    const a = evaluateCubicBSplineSegment(p0, p1, p2, p3, -1);
    const at0 = evaluateCubicBSplineSegment(p0, p1, p2, p3, 0);
    expect(a.x).toBeCloseTo(at0.x, 10);
    const b = evaluateCubicBSplineSegment(p0, p1, p2, p3, 2);
    const at1 = evaluateCubicBSplineSegment(p0, p1, p2, p3, 1);
    expect(b.x).toBeCloseTo(at1.x, 10);
    const nan = evaluateCubicBSplineSegment(p0, p1, p2, p3, NaN);
    expect(nan.x).toBeCloseTo(at0.x, 10);
  });
  it('midpoint t=0.5 has expected mathematical value', () => {
    // At t=0.5:
    //   B(0.5) = (1/6) * [
    //     (0.5)^3 * P0
    //     + (3*0.125 - 6*0.25 + 4) * P1
    //     + (-3*0.125 + 3*0.25 + 1.5 + 1) * P2
    //     + 0.125 * P3
    //   ]
    //   = (1/6) * [0.125 * P0 + 2.875 * P1 + 2.875 * P2 + 0.125 * P3]
    const v = evaluateCubicBSplineSegment(p0, p1, p2, p3, 0.5);
    const expectedX =
      (0.125 * 0 + 2.875 * 1 + 2.875 * 2 + 0.125 * 3) / 6;
    const expectedY =
      (0.125 * 0 + 2.875 * 2 + 2.875 * 5 + 0.125 * 1) / 6;
    expect(v.x).toBeCloseTo(expectedX, 10);
    expect(v.y).toBeCloseTo(expectedY, 10);
  });
});

describe('convertCubicBSplineSegmentToBezier', () => {
  it('matches canonical formula', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 1, y: 2 };
    const p2 = { x: 2, y: 5 };
    const p3 = { x: 3, y: 1 };
    const bez = convertCubicBSplineSegmentToBezier(p0, p1, p2, p3);
    expect(bez.b0.x).toBeCloseTo((0 + 4 + 2) / 6, 10);
    expect(bez.b0.y).toBeCloseTo((0 + 8 + 5) / 6, 10);
    expect(bez.b1.x).toBeCloseTo((2 * 1 + 2) / 3, 10);
    expect(bez.b1.y).toBeCloseTo((2 * 2 + 5) / 3, 10);
    expect(bez.b2.x).toBeCloseTo((1 + 4) / 3, 10);
    expect(bez.b2.y).toBeCloseTo((2 + 10) / 3, 10);
    expect(bez.b3.x).toBeCloseTo((1 + 8 + 3) / 6, 10);
    expect(bez.b3.y).toBeCloseTo((2 + 20 + 1) / 6, 10);
  });
  it('constant control points yields all-equal Bezier controls', () => {
    const c = { x: 7, y: 7 };
    const bez = convertCubicBSplineSegmentToBezier(c, c, c, c);
    expect(bez.b0).toEqual({ x: 7, y: 7 });
    expect(bez.b1).toEqual({ x: 7, y: 7 });
    expect(bez.b2).toEqual({ x: 7, y: 7 });
    expect(bez.b3).toEqual({ x: 7, y: 7 });
  });
  it('endpoint Bezier controls match the spline at t=0 and t=1', () => {
    // The Bezier b0 should equal evaluateCubicBSplineSegment(t=0)
    // and b3 should equal evaluateCubicBSplineSegment(t=1).
    const p0 = { x: -1, y: 0 };
    const p1 = { x: 0, y: 3 };
    const p2 = { x: 1, y: 4 };
    const p3 = { x: 2, y: 0 };
    const bez = convertCubicBSplineSegmentToBezier(p0, p1, p2, p3);
    const at0 = evaluateCubicBSplineSegment(p0, p1, p2, p3, 0);
    const at1 = evaluateCubicBSplineSegment(p0, p1, p2, p3, 1);
    expect(bez.b0.x).toBeCloseTo(at0.x, 10);
    expect(bez.b0.y).toBeCloseTo(at0.y, 10);
    expect(bez.b3.x).toBeCloseTo(at1.x, 10);
    expect(bez.b3.y).toBeCloseTo(at1.y, 10);
  });
});

describe('buildLineSplineBsplineBezierPath', () => {
  it('empty input returns empty string', () => {
    expect(buildLineSplineBsplineBezierPath([])).toBe('');
  });
  it('single point returns M command', () => {
    const path = buildLineSplineBsplineBezierPath([{ x: 3, y: 5 }]);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('3.000');
    expect(path).toContain('5.000');
  });
  it('two points (insufficient for cubic) -> empty when only 2 + 4 padded gives 6 -> 3 segments', () => {
    // With 2 raw points + 4 padded = 6 control points -> 3 segments
    const path = buildLineSplineBsplineBezierPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      { clamp: true },
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path.startsWith('M ')).toBe(true);
    // 3 segments -> 3 cubic Bezier (C) commands
    const cCount = (path.match(/C/g) ?? []).length;
    expect(cCount).toBe(3);
  });
  it('returns M+C commands with clamping', () => {
    const path = buildLineSplineBsplineBezierPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 5 },
        { x: 3, y: 1 },
      ],
      { clamp: true },
    );
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('C ');
  });
  it('open (no clamping) yields fewer segments than clamped', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
      { x: 4, y: 16 },
    ];
    const clamped = buildLineSplineBsplineBezierPath(raw, { clamp: true });
    const open = buildLineSplineBsplineBezierPath(raw, { clamp: false });
    const cClamped = (clamped.match(/C/g) ?? []).length;
    const cOpen = (open.match(/C/g) ?? []).length;
    // Clamped adds 4 control points (2 on each side) -> 4 more segments
    expect(cClamped).toBe(cOpen + 4);
  });
  it('project callback transforms coordinates', () => {
    const project = (p: { x: number; y: number }) => ({
      px: p.x * 100,
      py: p.y * 100,
    });
    const path = buildLineSplineBsplineBezierPath(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
      ],
      { clamp: true, project },
    );
    expect(path).toContain('M 0.000 0.000');
    expect(path.length).toBeGreaterThan('M 0.000 0.000'.length);
  });
});

describe('sampleLineSplineBsplineCurve', () => {
  it('empty input returns empty', () => {
    expect(sampleLineSplineBsplineCurve([])).toEqual([]);
  });
  it('single point returns degenerate single sample', () => {
    expect(
      sampleLineSplineBsplineCurve([{ x: 1, y: 2 }]),
    ).toEqual([{ x: 1, y: 2 }]);
  });
  it('returns samples for multiple points', () => {
    const samples = sampleLineSplineBsplineCurve(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
      ],
      { clamp: true, samplesPerSegment: 8 },
    );
    expect(samples.length).toBeGreaterThan(10);
  });
  it('clamped curve starts exactly at first point and ends exactly at last point', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
      { x: 4, y: 16 },
    ];
    const samples = sampleLineSplineBsplineCurve(raw, {
      clamp: true,
      samplesPerSegment: 8,
    });
    expect(samples[0]!.x).toBeCloseTo(0, 10);
    expect(samples[0]!.y).toBeCloseTo(0, 10);
    const last = samples[samples.length - 1]!;
    expect(last.x).toBeCloseTo(4, 10);
    expect(last.y).toBeCloseTo(16, 10);
  });
  it('constant input produces constant curve samples', () => {
    const raw = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ];
    const samples = sampleLineSplineBsplineCurve(raw, {
      clamp: true,
      samplesPerSegment: 8,
    });
    for (const s of samples) {
      expect(s.y).toBeCloseTo(5, 10);
    }
  });
  it('samples per segment count is honoured', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
    ];
    const a = sampleLineSplineBsplineCurve(raw, {
      clamp: true,
      samplesPerSegment: 4,
    });
    const b = sampleLineSplineBsplineCurve(raw, {
      clamp: true,
      samplesPerSegment: 16,
    });
    // More samples per segment -> more total curve samples.
    expect(b.length).toBeGreaterThan(a.length);
  });
});

describe('interpolateLineSplineBsplineSmoothedAt', () => {
  it('empty samples -> null', () => {
    expect(interpolateLineSplineBsplineSmoothedAt([], 0)).toBeNull();
  });
  it('non-finite x -> null', () => {
    expect(
      interpolateLineSplineBsplineSmoothedAt([{ x: 0, y: 0 }], NaN),
    ).toBeNull();
  });
  it('outside range -> null', () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(interpolateLineSplineBsplineSmoothedAt(samples, -1)).toBeNull();
    expect(interpolateLineSplineBsplineSmoothedAt(samples, 5)).toBeNull();
  });
  it('linear interpolation between samples', () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ];
    const v = interpolateLineSplineBsplineSmoothedAt(samples, 0.5);
    expect(v).toBeCloseTo(1, 10);
  });
  it('single matching sample returns its y', () => {
    expect(
      interpolateLineSplineBsplineSmoothedAt([{ x: 3, y: 7 }], 3),
    ).toBeCloseTo(7, 10);
  });
});

describe('runLineBSpline', () => {
  it('empty samples for null input', () => {
    const r = runLineBSpline(null);
    expect(r.samples).toEqual([]);
    expect(r.controlCount).toBe(0);
    expect(r.segmentCount).toBe(0);
  });
  it('records control + segment counts', () => {
    const r = runLineBSpline([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
      { x: 4, y: 16 },
    ]);
    expect(r.controlCount).toBe(5);
    // Clamped: cps = 5 + 4 = 9 -> 6 segments
    expect(r.segmentCount).toBe(6);
    expect(r.clamp).toBe(true);
  });
  it('constant input -> all smoothed equal to constant', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ x: i, y: 7 }));
    const r = runLineBSpline(data);
    for (const s of r.samples) {
      expect(s.smoothed).not.toBeNull();
      expect(s.smoothed!).toBeCloseTo(7, 8);
      expect(s.residual!).toBeCloseTo(0, 8);
    }
  });
  it('clamped: first and last smoothed match raw exactly', () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 3, y: 5 },
      { x: 4, y: 4 },
    ];
    const r = runLineBSpline(data, { clamp: true });
    expect(r.samples[0]!.smoothed).not.toBeNull();
    expect(r.samples[0]!.smoothed!).toBeCloseTo(1, 8);
    expect(r.samples[r.samples.length - 1]!.smoothed!).toBeCloseTo(4, 8);
  });
  it('sorts ascending and drops non-finite', () => {
    const r = runLineBSpline([
      { x: 5, y: 1 },
      { x: NaN, y: 0 },
      { x: 1, y: 3 },
      { x: 3, y: 2 },
      { x: 0, y: 4 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 3, 5]);
  });
  it('open (no clamping) interior smoothed for linear input reproduces line', () => {
    // For a uniform B-spline, linear control points yield a curve
    // that lies exactly on the linear function in the interior (linear
    // precision property). We test that interior samples have ~zero
    // residual.
    const data = Array.from({ length: 8 }, (_, i) => ({
      x: i,
      y: 2 * i + 1,
    }));
    const r = runLineBSpline(data, { clamp: false });
    // The first and last samples may lie outside the curve's x range
    // when clamp=false, so they may be null. Interior samples should
    // be near-zero residual.
    let interiorHit = 0;
    for (let i = 2; i < data.length - 2; i += 1) {
      const s = r.samples[i]!;
      if (s.smoothed !== null) {
        interiorHit += 1;
        expect(s.residual!).toBeCloseTo(0, 5);
      }
    }
    expect(interiorHit).toBeGreaterThan(0);
  });
  it('returns curveSamples in addition to per-control samples', () => {
    const data = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
    ];
    const r = runLineBSpline(data, { samplesPerSegment: 8 });
    expect(r.curveSamples.length).toBeGreaterThan(0);
    expect(r.samplesPerSegment).toBe(8);
  });
});

describe('computeLineSplineBsplineLayout', () => {
  const series: ChartLineSplineBsplineSeries[] = [
    {
      id: 'a',
      label: 'A',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
        { x: 4, y: 16 },
      ],
    },
  ];

  it('empty series returns ok=false', () => {
    const layout = computeLineSplineBsplineLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
    expect(layout.series.length).toBe(0);
  });

  it('degenerate canvas returns ok=false', () => {
    const layout = computeLineSplineBsplineLayout({
      series,
      width: 10,
      height: 10,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden returns ok=false', () => {
    const layout = computeLineSplineBsplineLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds layout with control + smoothed paths', () => {
    const layout = computeLineSplineBsplineLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series.length).toBe(1);
    expect(layout.series[0]!.controlPath).toContain('M ');
    expect(layout.series[0]!.smoothedPath).toContain('M ');
    expect(layout.series[0]!.smoothedPath).toContain('C ');
  });

  it('exposes control + segment + curve sample counts', () => {
    const layout = computeLineSplineBsplineLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      samplesPerSegment: 10,
    });
    expect(layout.series[0]!.controlCount).toBe(5);
    expect(layout.series[0]!.segmentCount).toBe(6);
    expect(layout.series[0]!.samplesPerSegment).toBe(10);
    expect(layout.series[0]!.curveSampleCount).toBeGreaterThan(0);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineSplineBsplineSeries[] = [
      ...series,
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 5 },
          { x: 3, y: 10 },
        ],
      },
    ];
    const layout = computeLineSplineBsplineLayout({
      series: multi,
      hiddenSeries: ['b'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(1);
    expect(layout.series.length).toBe(1);
    expect(layout.series[0]!.id).toBe('a');
  });

  it('per-series clamp override beats chart-level', () => {
    const layout = computeLineSplineBsplineLayout({
      series: [
        {
          id: 'open',
          label: 'Open',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 4 },
            { x: 3, y: 9 },
          ],
          clamp: false,
        },
        {
          id: 'clamped',
          label: 'Clamped',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 4 },
            { x: 3, y: 9 },
          ],
          clamp: true,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      clamp: true,
    });
    expect(layout.series[0]!.clamp).toBe(false);
    expect(layout.series[1]!.clamp).toBe(true);
  });

  it('per-series samplesPerSegment override beats chart-level', () => {
    const layout = computeLineSplineBsplineLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 4 },
            { x: 3, y: 9 },
          ],
          samplesPerSegment: 32,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      samplesPerSegment: 8,
    });
    expect(layout.series[0]!.samplesPerSegment).toBe(32);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineSplineBsplineLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -10,
      xMax: 10,
      yMin: -100,
      yMax: 100,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(10);
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(100);
  });

  it('totalPoints sums finite control points', () => {
    const multi: ChartLineSplineBsplineSeries[] = [
      ...series,
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 4 },
        ],
      },
    ];
    const layout = computeLineSplineBsplineLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(8);
  });

  it('residual segments only include points with smoothed value', () => {
    const layout = computeLineSplineBsplineLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const layoutSeries = layout.series[0]!;
    for (const seg of layoutSeries.residualSegments) {
      expect(seg.sign).toMatch(/^(positive|negative|zero)$/);
    }
  });
});

describe('describeLineSplineBsplineChart', () => {
  it('no data returns No data', () => {
    expect(describeLineSplineBsplineChart(null)).toBe('No data');
    expect(describeLineSplineBsplineChart([])).toBe('No data');
  });
  it('summary contains clamped or open and segment count', () => {
    const s = describeLineSplineBsplineChart([
      {
        id: 'a',
        label: 'A',
        data: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 4 },
          { x: 3, y: 9 },
        ],
      },
    ]);
    expect(s).toContain('cubic B-spline');
    expect(s).toMatch(/clamped|open/);
    expect(s).toContain('segments');
  });
  it('handles hidden filter', () => {
    const s = describeLineSplineBsplineChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 4 },
            { x: 3, y: 9 },
          ],
        },
      ],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineSplineBspline> render', () => {
  const series: ChartLineSplineBsplineSeries[] = [
    {
      id: 'a',
      label: 'Series A',
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
        { x: 4, y: 16 },
      ],
    },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineSplineBspline series={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-spline-bspline"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineSplineBspline series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-spline-bspline-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders smoothed path with data-kind=smoothed', () => {
    render(<ChartLineSplineBspline series={series} />);
    const smoothed = document.querySelector(
      '[data-section="chart-line-spline-bspline-smoothed-path"]',
    );
    expect(smoothed).not.toBeNull();
    expect(smoothed!.getAttribute('data-kind')).toBe('smoothed');
    expect(smoothed!.getAttribute('d')).toContain('C');
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineSplineBspline series={series} showRaw={false} />);
    const raw = document.querySelector(
      '[data-section="chart-line-spline-bspline-raw-path"]',
    );
    expect(raw).toBeNull();
  });

  it('omits control polygon by default', () => {
    render(<ChartLineSplineBspline series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-control-polygon"]',
      ),
    ).toBeNull();
  });

  it('renders control polygon when showControlPolygon=true', () => {
    render(
      <ChartLineSplineBspline series={series} showControlPolygon={true} />,
    );
    const cp = document.querySelector(
      '[data-section="chart-line-spline-bspline-control-polygon"]',
    );
    expect(cp).not.toBeNull();
    expect(cp!.getAttribute('data-kind')).toBe('control');
  });

  it('omits residual sticks by default', () => {
    render(<ChartLineSplineBspline series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-residual-stick"]',
      ),
    ).toBeNull();
  });

  it('renders residual sticks when showResidualSticks=true', () => {
    render(
      <ChartLineSplineBspline series={series} showResidualSticks={true} />,
    );
    const sticks = document.querySelectorAll(
      '[data-section="chart-line-spline-bspline-residual-stick"]',
    );
    expect(sticks.length).toBeGreaterThan(0);
  });

  it('omits dots by default and shows them with showDots=true', () => {
    const { rerender } = render(<ChartLineSplineBspline series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-spline-bspline-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineSplineBspline series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-spline-bspline-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows degree + clamp + segment + control counts', () => {
    render(<ChartLineSplineBspline series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-spline-bspline-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-badge-degree"]',
      )?.textContent,
    ).toBe(`d=${DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE}`);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-badge-clamp"]',
      )?.textContent,
    ).toBe('clamped');
    expect(
      document
        .querySelector(
          '[data-section="chart-line-spline-bspline-badge-segments"]',
        )
        ?.textContent?.startsWith('seg='),
    ).toBe(true);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-spline-bspline-badge-control"]',
        )
        ?.textContent?.startsWith('cp='),
    ).toBe(true);
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(
      <ChartLineSplineBspline series={series} showConfigBadge={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-badge"]',
      ),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineSplineBspline series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-spline-bspline"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-spline-bspline-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-spline-bspline-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('cubic B-spline');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineSplineBspline series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-spline-bspline"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(
      0,
    );
    expect(root!.getAttribute('data-clamp')).toBe('true');
    expect(Number(root!.getAttribute('data-samples-per-segment'))).toBeGreaterThan(
      0,
    );
    expect(root!.getAttribute('data-degree')).toBe(
      String(DEFAULT_CHART_LINE_SPLINE_BSPLINE_DEGREE),
    );
    expect(
      Number(root!.getAttribute('data-dominant-control-count')),
    ).toBeGreaterThan(0);
    expect(
      Number(root!.getAttribute('data-dominant-segment-count')),
    ).toBeGreaterThan(0);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineSplineBspline series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-spline-bspline-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(grp!.getAttribute('data-series-clamp')).toBe('true');
    expect(Number(grp!.getAttribute('data-series-control-count'))).toBe(5);
    expect(Number(grp!.getAttribute('data-series-segment-count'))).toBe(6);
    expect(
      Number(grp!.getAttribute('data-series-finite-count')),
    ).toBeGreaterThan(0);
    expect(
      Number(grp!.getAttribute('data-series-curve-sample-count')),
    ).toBeGreaterThan(0);
  });

  it('tooltip appears on dot hover with raw + smoothed + residual + config rows', () => {
    render(<ChartLineSplineBspline series={series} showDots={true} />);
    const dot = document.querySelector(
      '[data-section="chart-line-spline-bspline-dot"]',
    );
    expect(dot).not.toBeNull();
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip-raw"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip-smoothed"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip-residual"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip-config"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineSplineBspline
        series={series}
        showDots={true}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-spline-bspline-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineSplineBspline
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-spline-bspline-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
    expect(captured!.pointIndex).toBeGreaterThanOrEqual(0);
  });

  it('legend shows clamp + segment + rmse stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineSplineBspline
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-spline-bspline-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toMatch(/clamped|open/);
    expect(stats!.textContent).toContain('seg=');
    expect(stats!.textContent).toContain('rmse');
    const btn = document.querySelector(
      '[data-section="chart-line-spline-bspline-legend-item"]',
    );
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineSplineBspline series={series} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-spline-bspline-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineSplineBspline series={series} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-spline-bspline"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineSplineBspline series={series} animate={false} />);
    const root2 = document.querySelector(
      '[data-section="chart-line-spline-bspline"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSplineBspline ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-spline-bspline',
    );
  });

  it('has displayName', () => {
    expect(ChartLineSplineBspline.displayName).toBe('ChartLineSplineBspline');
  });

  it('ariaLabel applied to root and svg', () => {
    render(
      <ChartLineSplineBspline
        series={series}
        ariaLabel="Custom B-spline label"
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-spline-bspline"]',
    );
    expect(root!.getAttribute('aria-label')).toBe('Custom B-spline label');
    const svg = document.querySelector(
      '[data-section="chart-line-spline-bspline-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom B-spline label');
  });

  it('formatX and formatValue customise tick labels', () => {
    render(
      <ChartLineSplineBspline
        series={series}
        formatX={(n) => `x:${n}`}
        formatValue={(n) => `v:${n}`}
      />,
    );
    const xLabel = document.querySelector(
      '[data-section="chart-line-spline-bspline-tick-label"][data-axis="x"]',
    );
    expect(xLabel!.textContent?.startsWith('x:')).toBe(true);
    const yLabel = document.querySelector(
      '[data-section="chart-line-spline-bspline-tick-label"][data-axis="y"]',
    );
    expect(yLabel!.textContent?.startsWith('v:')).toBe(true);
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineSplineBspline
        series={series}
        xLabel="time"
        yLabel="value"
      />,
    );
    expect(
      screen.getByText('time').getAttribute('data-section'),
    ).toBe('chart-line-spline-bspline-x-label');
    expect(
      screen.getByText('value').getAttribute('data-section'),
    ).toBe('chart-line-spline-bspline-y-label');
  });
});
