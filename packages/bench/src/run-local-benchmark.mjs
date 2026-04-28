import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoSite, packageRoot, demoDistRoot, runProcess, startStaticServer } from "./local-demo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const benchmarkScript = path.join(__dirname, "run-benchmark.mjs");

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 4321,
    route: "/",
    label: "local-baseline-fresh-5x",
    runs: 5,
    chromePath: process.env.LIGHTHOUSE_CHROME_PATH ?? null,
    resultsDir: null,
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

async function runBenchmark(args) {
  const benchmarkArgs = [
    benchmarkScript,
    "--url",
    new URL(args.route, `http://${args.host}:${args.port}`).toString(),
    "--label",
    args.label,
    "--runs",
    String(args.runs)
  ];

  if (args.chromePath) {
    benchmarkArgs.push("--chrome-path", args.chromePath);
  }

  if (args.resultsDir) {
    benchmarkArgs.push("--results-dir", args.resultsDir);
  }

  if (!args.saveAssets) {
    benchmarkArgs.push("--skip-assets");
  }

  if (!args.screenshots) {
    benchmarkArgs.push("--skip-screenshots");
  }

  if (args.freshProfile) {
    benchmarkArgs.push("--fresh-profile");
  }

  await runProcess(process.execPath, benchmarkArgs, "local benchmark", packageRoot);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.build) {
    console.log("Building demo site for local benchmark...");
    await buildDemoSite();
  }

  console.log(`Serving ${demoDistRoot} on http://${args.host}:${args.port} ...`);
  const server = await startStaticServer(args.host, args.port);

  try {
    await runBenchmark(args);
  } finally {
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
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
