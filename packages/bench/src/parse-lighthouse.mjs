function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function getAuditNumericValue(report, auditId) {
  const numericValue = report?.audits?.[auditId]?.numericValue;
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getResourceTotals(report) {
  const items = report?.audits?.["resource-summary"]?.details?.items ?? [];
  const summary = {};

  for (const item of items) {
    summary[item.resourceType] = {
      requestCount: item.requestCount,
      transferSize: item.transferSize
    };
  }

  return summary;
}

function getMainThreadBreakdown(report) {
  const items = report?.audits?.["mainthread-work-breakdown"]?.details?.items ?? [];

  return items
    .map((item) => ({
      groupLabel: item.groupLabel,
      durationMs: round(item.duration, 1)
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

function getTopNetworkRequests(report, predicate, limit = 10) {
  const items = report?.audits?.["network-requests"]?.details?.items ?? [];

  return items
    .filter(predicate)
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, limit)
    .map((item) => ({
      url: item.url,
      resourceType: item.resourceType,
      transferSizeKb: round(item.transferSize / 1024, 1),
      statusCode: item.statusCode ?? null,
      mimeType: item.mimeType ?? null
    }));
}

function getAverage(numbers, digits = 2) {
  const validNumbers = numbers.filter((value) => Number.isFinite(value));
  if (!validNumbers.length) {
    return null;
  }

  const total = validNumbers.reduce((sum, value) => sum + value, 0);
  return round(total / validNumbers.length, digits);
}

export function parseLighthouse(report) {
  const diagnostics = report?.audits?.diagnostics?.details?.items?.[0] ?? {};
  const resourceTotals = getResourceTotals(report);
  const scriptRequests = getTopNetworkRequests(report, (item) => item.resourceType === "Script");

  return {
    lighthouseVersion: report.lighthouseVersion,
    requestedUrl: report.requestedUrl,
    fetchTime: report.fetchTime,
    performanceScore: round((report?.categories?.performance?.score ?? 0) * 100, 0),
    metrics: {
      fcpMs: round(getAuditNumericValue(report, "first-contentful-paint"), 0),
      lcpMs: round(getAuditNumericValue(report, "largest-contentful-paint"), 0),
      speedIndexMs: round(getAuditNumericValue(report, "speed-index"), 0),
      tbtMs: round(getAuditNumericValue(report, "total-blocking-time"), 0),
      cls: round(getAuditNumericValue(report, "cumulative-layout-shift"), 3)
    },
    byteWeight: {
      totalMb: round((diagnostics.totalByteWeight ?? 0) / (1024 * 1024), 1),
      scriptKb: round((resourceTotals.script?.transferSize ?? 0) / 1024, 1),
      fontKb: round((resourceTotals.font?.transferSize ?? 0) / 1024, 1),
      imageMb: round((resourceTotals.image?.transferSize ?? 0) / (1024 * 1024), 1),
      mediaMb: round((resourceTotals.media?.transferSize ?? 0) / (1024 * 1024), 1)
    },
    requestCounts: {
      total: diagnostics.numRequests ?? null,
      scripts: diagnostics.numScripts ?? null,
      fonts: diagnostics.numFonts ?? null,
      stylesheets: diagnostics.numStylesheets ?? null
    },
    taskCounts: {
      totalTasks: diagnostics.numTasks ?? null,
      tasksOver10ms: diagnostics.numTasksOver10ms ?? null,
      tasksOver25ms: diagnostics.numTasksOver25ms ?? null,
      tasksOver50ms: diagnostics.numTasksOver50ms ?? null,
      totalTaskTimeMs: round(diagnostics.totalTaskTime ?? 0, 1)
    },
    bootupTimeMs: round(getAuditNumericValue(report, "bootup-time"), 0),
    mainThreadBreakdown: getMainThreadBreakdown(report),
    topRequests: getTopNetworkRequests(report, () => true),
    topScriptRequests: scriptRequests,
    animationScriptRequests: scriptRequests.filter((item) =>
      /(gsap|scrolltrigger|lottie)/i.test(item.url)
    )
  };
}

export function summarizeRuns(reports) {
  const parsedRuns = reports.map(parseLighthouse);

  return {
    runs: parsedRuns,
    averages: {
      performanceScore: getAverage(parsedRuns.map((run) => run.performanceScore), 1),
      fcpMs: getAverage(parsedRuns.map((run) => run.metrics.fcpMs), 0),
      lcpMs: getAverage(parsedRuns.map((run) => run.metrics.lcpMs), 0),
      speedIndexMs: getAverage(parsedRuns.map((run) => run.metrics.speedIndexMs), 0),
      tbtMs: getAverage(parsedRuns.map((run) => run.metrics.tbtMs), 0),
      cls: getAverage(parsedRuns.map((run) => run.metrics.cls), 3),
      totalMb: getAverage(parsedRuns.map((run) => run.byteWeight.totalMb), 1)
    }
  };
}
