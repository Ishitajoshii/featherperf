import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { compareResults } from "./compare.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const runLocalBenchmarkScript = path.join(__dirname, "run-local-benchmark.mjs");
const defaultResultsRoot = path.join(packageRoot, "results");

function parseArgs(argv) {
  const args = {
    offLabel: "local-featherperf-off-fresh-5x",
    onLabel: "local-featherperf-on-fresh-5x",
    host: "127.0.0.1",
    port: 4321,
    route: "/",
    runs: 5,
    chromePath: process.env.LIGHTHOUSE_CHROME_PATH ?? null,
    resultsDir: defaultResultsRoot,
    saveAssets: true,
    screenshots: true,
    freshProfile: true,
    build: true
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
    } else if (arg === "--skip-assets") {
      args.saveAssets = false;
    } else if (arg === "--skip-screenshots") {
      args.screenshots = false;
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
}

function toBenchmarkArgs(args, label) {
  const benchmarkArgs = [
    runLocalBenchmarkScript,
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
    args.resultsDir
  ];

  if (args.chromePath) {
    benchmarkArgs.push("--chrome-path", args.chromePath);
  }

  if (!args.saveAssets) {
    benchmarkArgs.push("--skip-assets");
  }

  if (!args.screenshots) {
    benchmarkArgs.push("--skip-screenshots");
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

function toComparableMedian(summary) {
  return {
    performanceScore: summary.medians.performanceScore,
    metrics: {
      fcpMs: summary.medians.fcpMs,
      lcpMs: summary.medians.lcpMs,
      tbtMs: summary.medians.tbtMs
    },
    byteWeight: {
      totalMb: summary.medians.totalMb
    }
  };
}

function formatDelta(delta, unit = "", invert = false) {
  if (delta === null || delta === undefined) {
    return "n/a";
  }

  const sign = delta > 0 ? "+" : "";
  const normalizedValue = invert ? delta * -1 : delta;
  const normalizedSign = normalizedValue > 0 ? "+" : "";
  return `${normalizedSign}${normalizedValue}${unit}`;
}

function formatMetric(label, before, after, delta, unit = "", invert = false) {
  const formattedBefore = before === null ? "n/a" : `${before}${unit}`;
  const formattedAfter = after === null ? "n/a" : `${after}${unit}`;
  const formattedDelta = formatDelta(delta, unit, invert);
  return `${label.padEnd(18)} ${formattedBefore.padStart(10)} -> ${formattedAfter.padStart(10)}   delta ${formattedDelta}`;
}

function printSummary(offSummary, onSummary, comparison, resultsDir) {
  console.log("");
  console.log("FeatherPerf local proof");
  console.log("=======================");
  console.log(`Off label: ${offSummary.label}`);
  console.log(`On label:  ${onSummary.label}`);
  console.log(`Runs:      ${offSummary.method.runs}`);
  console.log(`Method:    ${offSummary.method.aggregation} of fresh-profile Lighthouse runs`);
  console.log("");
  console.log("Median metrics");
  console.log("--------------");
  console.log(
    formatMetric(
      "Performance",
      comparison.performanceScore.before,
      comparison.performanceScore.after,
      comparison.performanceScore.delta
    )
  );
  console.log(
    formatMetric(
      "FCP",
      comparison.fcpMs.before,
      comparison.fcpMs.after,
      comparison.fcpMs.delta,
      " ms",
      true
    )
  );
  console.log(
    formatMetric(
      "LCP",
      comparison.lcpMs.before,
      comparison.lcpMs.after,
      comparison.lcpMs.delta,
      " ms",
      true
    )
  );
  console.log(
    formatMetric(
      "TBT",
      comparison.tbtMs.before,
      comparison.tbtMs.after,
      comparison.tbtMs.delta,
      " ms",
      true
    )
  );
  console.log(
    formatMetric(
      "Total bytes",
      comparison.totalMb.before,
      comparison.totalMb.after,
      comparison.totalMb.delta,
      " MB",
      true
    )
  );
  console.log("");
  console.log("Readout");
  console.log("-------");

  const fcpDelta = comparison.fcpMs.delta;
  const tbtDelta = comparison.tbtMs.delta;
  const lcpDelta = comparison.lcpMs.delta;

  if (typeof fcpDelta === "number" && fcpDelta < 0) {
    console.log(`- First paint improved by ${Math.abs(fcpDelta)} ms.`);
  } else {
    console.log("- First paint did not improve in this run.");
  }

  if (typeof lcpDelta === "number" && lcpDelta < 0) {
    console.log(`- Largest contentful paint improved by ${Math.abs(lcpDelta)} ms.`);
  } else {
    console.log("- Largest contentful paint did not improve in this run.");
  }

  if (typeof tbtDelta === "number" && tbtDelta > 0) {
    console.log(`- Total blocking time regressed by ${tbtDelta} ms, so main-thread improvement is not proven yet.`);
  } else if (typeof tbtDelta === "number" && tbtDelta < 0) {
    console.log(`- Total blocking time improved by ${Math.abs(tbtDelta)} ms.`);
  } else {
    console.log("- Total blocking time comparison is unavailable.");
  }

  console.log("");
  console.log(`Artifacts: ${resultsDir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  console.log(`Running local proof with FEATHERPERF=off (${args.offLabel})...`);
  await runProcess(
    process.execPath,
    toBenchmarkArgs(args, args.offLabel),
    "local proof off run",
    {
      ...process.env,
      FEATHERPERF: "off"
    }
  );

  console.log(`Running local proof with FEATHERPERF=on (${args.onLabel})...`);
  await runProcess(
    process.execPath,
    toBenchmarkArgs(args, args.onLabel),
    "local proof on run",
    {
      ...process.env,
      FEATHERPERF: "on"
    }
  );

  const offSummary = await loadSummary(args.resultsDir, args.offLabel);
  const onSummary = await loadSummary(args.resultsDir, args.onLabel);
  const comparison = compareResults(toComparableMedian(offSummary), toComparableMedian(onSummary));
  printSummary(offSummary, onSummary, comparison, args.resultsDir);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
