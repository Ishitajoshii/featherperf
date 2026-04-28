import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateReport, startTimespan } from "lighthouse";
import { buildDemoSite, packageRoot, demoDistRoot, startStaticServer } from "./local-demo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsRoot = path.join(packageRoot, "results");
const require = createRequire(import.meta.url);
const lighthousePackagePath = require.resolve("lighthouse/package.json");
const lighthouseRequire = createRequire(lighthousePackagePath);
const puppeteerModulePath = lighthouseRequire.resolve("puppeteer-core");
const { default: puppeteer } = await import(pathToFileURL(puppeteerModulePath).href);

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 4321,
    route: "/",
    label: "local-interaction-fresh-5x",
    runs: 5,
    chromePath: process.env.LIGHTHOUSE_CHROME_PATH ?? null,
    resultsDir: resultsRoot,
    freshProfile: true,
    build: true,
    interactionDelayMs: 110,
    settleDelayMs: 400,
    motionOverlapTimeoutMs: 250
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    } else if (arg === "--host") {
      args.host = next;
      index += 1;
    } else if (arg === "--port") {
      args.port = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--route") {
      args.route = next;
      index += 1;
    } else if (arg === "--label") {
      args.label = next;
      index += 1;
    } else if (arg === "--runs") {
      args.runs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--chrome-path") {
      args.chromePath = next;
      index += 1;
    } else if (arg === "--results-dir") {
      args.resultsDir = path.resolve(next);
      index += 1;
    } else if (arg === "--interaction-delay-ms") {
      args.interactionDelayMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--settle-delay-ms") {
      args.settleDelayMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--motion-overlap-timeout-ms") {
      args.motionOverlapTimeoutMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--fresh-profile") {
      args.freshProfile = true;
    } else if (arg === "--no-fresh-profile") {
      args.freshProfile = false;
    } else if (arg === "--no-build") {
      args.build = false;
    }
  }

  return args;
}

function getDefaultChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function getAverage(numbers, digits = 2) {
  const validNumbers = numbers.filter((value) => Number.isFinite(value));
  if (!validNumbers.length) {
    return null;
  }

  const total = validNumbers.reduce((sum, value) => sum + value, 0);
  return round(total / validNumbers.length, digits);
}

function getMedian(numbers, digits = 2) {
  const validNumbers = numbers.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!validNumbers.length) {
    return null;
  }

  const middle = Math.floor(validNumbers.length / 2);
  if (validNumbers.length % 2 === 1) {
    return round(validNumbers[middle], digits);
  }

  return round((validNumbers[middle - 1] + validNumbers[middle]) / 2, digits);
}

function getAuditNumericValue(report, auditId) {
  const numericValue = report?.audits?.[auditId]?.numericValue;
  return Number.isFinite(numericValue) ? numericValue : null;
}

function delay(durationMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

async function createFreshProfileDir() {
  const tempRoot = path.join(os.tmpdir(), "featherperf-interaction-");
  return mkdtemp(tempRoot);
}

async function waitForServerClose(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function summarizeInteractionRun(report, interactionState, alignedToDeferredWork) {
  const benchmarkState = interactionState?.benchmark ?? null;
  const clickEntries = Array.isArray(benchmarkState?.entries)
    ? benchmarkState.entries.filter((entry) => entry?.name === "click")
    : [];
  const worstClickEntry =
    clickEntries.sort((a, b) => (b?.durationMs ?? 0) - (a?.durationMs ?? 0))[0] ??
    benchmarkState?.lastInteraction ??
    null;

  return {
    lighthouseVersion: report.lighthouseVersion,
    requestedUrl: report.requestedUrl,
    fetchTime: report.fetchTime,
    metrics: {
      inpMs: round(getAuditNumericValue(report, "interaction-to-next-paint"), 0),
      cls: round(getAuditNumericValue(report, "cumulative-layout-shift"), 3)
    },
    interactionMetrics: {
      interactionCount: benchmarkState?.interactionCount ?? 0,
      alignedToDeferredWork,
      eventTimingDurationMs: worstClickEntry?.durationMs ?? null,
      processingDelayMs: worstClickEntry?.processingDelayMs ?? null,
      processingDurationMs: worstClickEntry?.processingDurationMs ?? null,
      manualLatencyMs: benchmarkState?.lastInteraction?.manualLatencyMs ?? null
    }
  };
}

function summarizeRuns(runs) {
  return {
    runs,
    averages: {
      inpMs: getAverage(runs.map((run) => run.metrics.inpMs), 0),
      cls: getAverage(runs.map((run) => run.metrics.cls), 3),
      eventTimingDurationMs: getAverage(
        runs.map((run) => run.interactionMetrics.eventTimingDurationMs),
        0
      ),
      processingDelayMs: getAverage(runs.map((run) => run.interactionMetrics.processingDelayMs), 0),
      processingDurationMs: getAverage(
        runs.map((run) => run.interactionMetrics.processingDurationMs),
        0
      ),
      manualLatencyMs: getAverage(runs.map((run) => run.interactionMetrics.manualLatencyMs), 0)
    },
    medians: {
      inpMs: getMedian(runs.map((run) => run.metrics.inpMs), 0),
      cls: getMedian(runs.map((run) => run.metrics.cls), 3),
      eventTimingDurationMs: getMedian(
        runs.map((run) => run.interactionMetrics.eventTimingDurationMs),
        0
      ),
      processingDelayMs: getMedian(runs.map((run) => run.interactionMetrics.processingDelayMs), 0),
      processingDurationMs: getMedian(
        runs.map((run) => run.interactionMetrics.processingDurationMs),
        0
      ),
      manualLatencyMs: getMedian(runs.map((run) => run.interactionMetrics.manualLatencyMs), 0)
    }
  };
}

async function runSingleInteractionBenchmark({
  url,
  chromePath,
  freshProfile,
  interactionDelayMs,
  settleDelayMs,
  motionOverlapTimeoutMs
}) {
  let browser = null;
  let freshProfileDir = null;

  try {
    if (freshProfile) {
      freshProfileDir = await createFreshProfileDir();
    }

    const launchArgs = [
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check"
    ];

    if (freshProfileDir) {
      launchArgs.push(`--user-data-dir=${freshProfileDir}`);
    }

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: launchArgs
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);

    const navigationPromise = page.goto(url);

    await page.waitForSelector("#interaction-benchmark-button", {
      visible: true,
      timeout: 15_000
    });
    await page.waitForFunction(
      () => window.__featherperfInteractionBenchmark?.isReady === true,
      { timeout: 15_000 }
    );

    const alignedToDeferredWork = await page
      .waitForFunction(
        () => window.__featherperfDemoMotionState?.phase === "follow-up-scheduled",
        { timeout: motionOverlapTimeoutMs }
      )
      .then(() => true)
      .catch(() => false);

    const timespan = await startTimespan(page);
    await delay(interactionDelayMs);
    await page.click("#interaction-benchmark-button");
    await page.waitForFunction(
      () =>
        window.__featherperfInteractionBenchmark?.interactionCount >= 1 &&
        window.__featherperfInteractionBenchmark?.lastInteraction?.paintSettled === true,
      { timeout: 15_000 }
    );
    await delay(settleDelayMs);

    const runnerResult = await timespan.endTimespan();
    await navigationPromise;

    const interactionState = await page.evaluate(() => {
      return JSON.parse(
        JSON.stringify({
          benchmark: window.__featherperfInteractionBenchmark ?? null,
          motionState: window.__featherperfDemoMotionState ?? null
        })
      );
    });

    return {
      lhr: runnerResult?.lhr ?? null,
      interactionState,
      alignedToDeferredWork
    };
  } finally {
    if (browser) {
      await browser.close();
    }

    if (freshProfileDir) {
      await rm(freshProfileDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chromePath = args.chromePath ?? getDefaultChromePath();

  if (!chromePath) {
    throw new Error("Unable to determine Chrome path. Pass --chrome-path explicitly.");
  }

  if (args.build) {
    console.log("Building demo site for interaction benchmark...");
    await buildDemoSite();
  }

  const outputDir = path.join(args.resultsDir, args.label);
  await mkdir(outputDir, { recursive: true });

  console.log(`Serving ${demoDistRoot} on http://${args.host}:${args.port} ...`);
  const server = await startStaticServer(args.host, args.port);
  const url = new URL(args.route, `http://${args.host}:${args.port}`).toString();
  const parsedRuns = [];

  try {
    for (let runNumber = 1; runNumber <= args.runs; runNumber += 1) {
      console.log(`Running interaction pass ${runNumber}/${args.runs}...`);

      const { lhr, interactionState, alignedToDeferredWork } = await runSingleInteractionBenchmark({
        url,
        chromePath,
        freshProfile: args.freshProfile,
        interactionDelayMs: args.interactionDelayMs,
        settleDelayMs: args.settleDelayMs,
        motionOverlapTimeoutMs: args.motionOverlapTimeoutMs
      });

      if (!lhr) {
        throw new Error(`Missing Lighthouse report for interaction pass ${runNumber}.`);
      }

      const outputBasePath = path.join(outputDir, `run-${runNumber}`);
      const htmlReport = generateReport(lhr, "html");
      const summarizedRun = summarizeInteractionRun(lhr, interactionState, alignedToDeferredWork);

      await writeFile(`${outputBasePath}.report.json`, `${JSON.stringify(lhr, null, 2)}\n`, "utf8");
      await writeFile(`${outputBasePath}.report.html`, htmlReport, "utf8");
      await writeFile(
        `${outputBasePath}.interaction.json`,
        `${JSON.stringify(interactionState, null, 2)}\n`,
        "utf8"
      );

      parsedRuns.push(summarizedRun);
    }
  } finally {
    await waitForServerClose(server);
  }

  const summary = {
    label: args.label,
    url,
    chromePath,
    generatedAt: new Date().toISOString(),
    method: {
      runs: args.runs,
      freshProfilePerRun: args.freshProfile,
      aggregation: "median",
      benchmark: "hero-click-timespan",
      measurement: "Lighthouse INP + Event Timing",
      interactionDelayMs: args.interactionDelayMs,
      settleDelayMs: args.settleDelayMs,
      motionOverlapTimeoutMs: args.motionOverlapTimeoutMs
    },
    ...summarizeRuns(parsedRuns)
  };

  const summaryPath = path.join(outputDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Saved summary to ${summaryPath}`);
  console.log(JSON.stringify(summary.medians, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
