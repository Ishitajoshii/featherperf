import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { summarizeRuns } from "./parse-lighthouse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const resultsRoot = path.join(packageRoot, "results");
const lighthouseCli = path.join(packageRoot, "node_modules", "lighthouse", "cli", "index.js");

function parseArgs(argv) {
  const args = {
    url: null,
    label: "baseline",
    runs: 3,
    chromePath: process.env.LIGHTHOUSE_CHROME_PATH ?? null,
    resultsDir: resultsRoot,
    saveAssets: true,
    screenshots: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--url") {
      args.url = next;
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
    } else if (arg === "--skip-assets") {
      args.saveAssets = false;
    } else if (arg === "--skip-screenshots") {
      args.screenshots = false;
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

function runProcess(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      stdio: "inherit"
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

async function loadReport(reportPath) {
  const rawReport = await readFile(reportPath, "utf8");
  return JSON.parse(rawReport);
}

async function saveScreenshots(chromePath, url, outputDir) {
  const screenshotsDir = path.join(outputDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const desktopScreenshot = path.join(screenshotsDir, "desktop-home.png");
  const mobileScreenshot = path.join(screenshotsDir, "mobile-home.png");

  await runProcess(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1440,2200",
      `--screenshot=${desktopScreenshot}`,
      url
    ],
    "desktop screenshot"
  );

  await runProcess(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=390,1600",
      `--screenshot=${mobileScreenshot}`,
      url
    ],
    "mobile screenshot"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url) {
    throw new Error("Missing required --url argument.");
  }

  const chromePath = args.chromePath ?? getDefaultChromePath();
  if (!chromePath) {
    throw new Error("Unable to determine Chrome path. Pass --chrome-path explicitly.");
  }

  const outputDir = path.join(args.resultsDir, args.label);
  await mkdir(outputDir, { recursive: true });

  for (let runNumber = 1; runNumber <= args.runs; runNumber += 1) {
    const outputBasePath = path.join(outputDir, `run-${runNumber}`);
    const lighthouseArgs = [
      lighthouseCli,
      args.url,
      `--chrome-path=${chromePath}`,
      "--output=json",
      "--output=html",
      `--output-path=${outputBasePath}`,
      "--quiet"
    ];

    if (args.saveAssets) {
      lighthouseArgs.push("--save-assets");
    }

    console.log(`Running Lighthouse pass ${runNumber}/${args.runs}...`);
    await runProcess(process.execPath, lighthouseArgs, `lighthouse run ${runNumber}`);
  }

  if (args.screenshots) {
    console.log("Capturing baseline screenshots...");
    await saveScreenshots(chromePath, args.url, outputDir);
  }

  const reports = [];
  for (let runNumber = 1; runNumber <= args.runs; runNumber += 1) {
    const reportPath = path.join(outputDir, `run-${runNumber}.report.json`);
    reports.push(await loadReport(reportPath));
  }

  const summary = {
    label: args.label,
    url: args.url,
    chromePath,
    generatedAt: new Date().toISOString(),
    ...summarizeRuns(reports)
  };

  const summaryPath = path.join(outputDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Saved summary to ${summaryPath}`);
  console.log(JSON.stringify(summary.averages, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
