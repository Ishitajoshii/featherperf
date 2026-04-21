function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function percentDelta(before, after) {
  if (!Number.isFinite(before) || before === 0 || !Number.isFinite(after)) {
    return null;
  }

  return round(((after - before) / before) * 100, 1);
}

export function compareResults(before, after) {
  return {
    performanceScore: {
      before: before.performanceScore,
      after: after.performanceScore,
      delta: round(after.performanceScore - before.performanceScore, 1),
      percentDelta: percentDelta(before.performanceScore, after.performanceScore)
    },
    fcpMs: {
      before: before.metrics.fcpMs,
      after: after.metrics.fcpMs,
      delta: round(after.metrics.fcpMs - before.metrics.fcpMs, 0),
      percentDelta: percentDelta(before.metrics.fcpMs, after.metrics.fcpMs)
    },
    lcpMs: {
      before: before.metrics.lcpMs,
      after: after.metrics.lcpMs,
      delta: round(after.metrics.lcpMs - before.metrics.lcpMs, 0),
      percentDelta: percentDelta(before.metrics.lcpMs, after.metrics.lcpMs)
    },
    tbtMs: {
      before: before.metrics.tbtMs,
      after: after.metrics.tbtMs,
      delta: round(after.metrics.tbtMs - before.metrics.tbtMs, 0),
      percentDelta: percentDelta(before.metrics.tbtMs, after.metrics.tbtMs)
    },
    totalMb: {
      before: before.byteWeight.totalMb,
      after: after.byteWeight.totalMb,
      delta: round(after.byteWeight.totalMb - before.byteWeight.totalMb, 1),
      percentDelta: percentDelta(before.byteWeight.totalMb, after.byteWeight.totalMb)
    }
  };
}
