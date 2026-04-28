import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const runInteractionBenchmarkScript = path.join(__dirname, "run-interaction-benchmark.mjs");
const defaultResultsRoot = path.join(packageRoot, "results");

function parseArgs(argv) {
  const args = {
    offLabel: "local-interaction-featherperf-off-fresh-5x",
    onLabel: "local-interaction-featherperf-on-fresh-5x",
    host: "127.0.0.1",
    port: 4321,
    route: "/",
    runs: 5,
    chromePath: process.env.LIGHTHOUSE_CHROME_PATH ?? null,
    resultsDir: defaultResultsRoot,
    freshProfile: true,
    build: true,
    interactionDelayMs: 110,
    settleDelayMs: 400
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    } else if (arg === "--off-label") {
      args.offLabel = next;
      index += 1;
    } else if (arg === "--host") {
      args.host = next;
      index += 1;
    } else if (arg === "--port") {
      args.port = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--route") {
      args.route = next;
      index += 1;
    } else if (arg === "--on-label") {
      args.onLabel = next;
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

function validatePositiveInteger(value, flagName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
}

function validateArgs(args) {
  validatePositiveInteger(args.port, "--port");
  validatePositiveInteger(args.runs, "--runs");
  validatePositiveInteger(args.interactionDelayMs, "--interaction-delay-ms");
  validatePositiveInteger(args.settleDelayMs, "--settle-delay-ms");
}

function toBenchmarkArgs(args, label) {
  const benchmarkArgs = [
    runInteractionBenchmarkScript,
    "--host",
    args.host,
    "--port",
    String(args.port),
    "--route",
    args.route,
    "--label",
    label,
    "--runs",
    String(args.runs),
    "--results-dir",
    args.resultsDir,
    "--interaction-delay-ms",
    String(args.interactionDelayMs),
    "--settle-delay-ms",
    String(args.settleDelayMs)
  ];

  if (args.chromePath) {
    benchmarkArgs.push("--chrome-path", args.chromePath);
  }

  if (args.freshProfile) {
    benchmarkArgs.push("--fresh-profile");
  } else {
    benchmarkArgs.push("--no-fresh-profile");
  }

  if (!args.build) {
    benchmarkArgs.push("--no-build");
  }

  return benchmarkArgs;
}

function runProcess(command, args, label, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function loadSummary(resultsDir, label) {
  const summaryPath = path.join(resultsDir, label, "summary.json");
  const summaryRaw = await readFile(summaryPath, "utf8");
  return JSON.parse(summaryRaw);
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function compareMetric(before, after, digits = 0) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return { before, after, delta: null };
  }

  return {
    before,
    after,
    delta: round(after - before, digits)
  };
}

function formatDelta(delta, unit = "", invert = false) {
  if (delta === null || delta === undefined) {
    return "n/a";
  }

  const normalizedValue = invert ? delta * -1 : delta;
  const normalizedSign = normalizedValue > 0 ? "+" : "";
  return `${normalizedSign}${normalizedValue}${unit}`;
}

function formatMetric(label, before, after, delta, unit = "", invert = false) {
  const formattedBefore = before === null ? "n/a" : `${before}${unit}`;
  const formattedAfter = after === null ? "n/a" : `${after}${unit}`;
  const formattedDelta = formatDelta(delta, unit, invert);
  return `${label.padEnd(24)} ${formattedBefore.padStart(10)} -> ${formattedAfter.padStart(10)}   delta ${formattedDelta}`;
}

function printSummary(offSummary, onSummary, resultsDir) {
  const comparisons = {
    inpMs: compareMetric(offSummary.medians.inpMs, onSummary.medians.inpMs, 0),
    eventTimingDurationMs: compareMetric(
      offSummary.medians.eventTimingDurationMs,
      onSummary.medians.eventTimingDurationMs,
      0
    ),
    processingDelayMs: compareMetric(
      offSummary.medians.processingDelayMs,
      onSummary.medians.processingDelayMs,
      0
    ),
    manualLatencyMs: compareMetric(
      offSummary.medians.manualLatencyMs,
      onSummary.medians.manualLatencyMs,
      0
    )
  };

  console.log("");
  console.log("FeatherPerf interaction proof");
  console.log("============================");
  console.log(`Off label: ${offSummary.label}`);
  console.log(`On label:  ${onSummary.label}`);
  console.log(`Runs:      ${offSummary.method.runs}`);
  console.log(`Method:    ${offSummary.method.aggregation} of hero-click timespan runs`);
  console.log("");
  console.log("Median metrics");
  console.log("--------------");
  console.log(
    formatMetric(
      "Lighthouse INP",
      comparisons.inpMs.before,
      comparisons.inpMs.after,
      comparisons.inpMs.delta,
      " ms",
      true
    )
  );
  console.log(
    formatMetric(
      "Event Timing click",
      comparisons.eventTimingDurationMs.before,
      comparisons.eventTimingDurationMs.after,
      comparisons.eventTimingDurationMs.delta,
      " ms",
      true
    )
  );
  console.log(
    formatMetric(
      "Processing delay",
      comparisons.processingDelayMs.before,
      comparisons.processingDelayMs.after,
      comparisons.processingDelayMs.delta,
      " ms",
      true
    )
  );
  console.log(
    formatMetric(
      "Manual latency",
      comparisons.manualLatencyMs.before,
      comparisons.manualLatencyMs.after,
      comparisons.manualLatencyMs.delta,
      " ms",
      true
    )
  );
  console.log("");
  console.log(`Artifacts: ${resultsDir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  console.log(`Running interaction proof with FEATHERPERF=off (${args.offLabel})...`);
  await runProcess(
    process.execPath,
    toBenchmarkArgs(args, args.offLabel),
    "interaction proof off run",
    {
      ...process.env,
      FEATHERPERF: "off"
    }
  );

  console.log(`Running interaction proof with FEATHERPERF=on (${args.onLabel})...`);
  await runProcess(
    process.execPath,
    toBenchmarkArgs(args, args.onLabel),
    "interaction proof on run",
    {
      ...process.env,
      FEATHERPERF: "on"
    }
  );

  const offSummary = await loadSummary(args.resultsDir, args.offLabel);
  const onSummary = await loadSummary(args.resultsDir, args.onLabel);
  printSummary(offSummary, onSummary, args.resultsDir);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
