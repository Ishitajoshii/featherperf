import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const demoSiteRoot = path.join(repoRoot, "demo", "site");
const demoDistRoot = path.join(demoSiteRoot, "dist");
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

function getPnpmCommand() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      baseArgs: [process.env.npm_execpath]
    };
  }

  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    baseArgs: []
  };
}

function runProcess(command, args, label, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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

async function buildDemoSite() {
  const pnpm = getPnpmCommand();
  await runProcess(
    pnpm.command,
    [...pnpm.baseArgs, "--dir", demoSiteRoot, "build"],
    "demo site build"
  );
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".map":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function resolveFilePath(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname);
  const normalizedPath = path.posix.normalize(decodedPath);
  const relativePath = normalizedPath === "/" ? "/index.html" : normalizedPath;
  const candidatePath = path.join(demoDistRoot, relativePath);
  const resolvedPath = path.resolve(candidatePath);
  const distRootPath = path.resolve(demoDistRoot);

  if (path.relative(distRootPath, resolvedPath).startsWith("..")) {
    return null;
  }

  try {
    const fileStats = await stat(resolvedPath);
    if (fileStats.isDirectory()) {
      const indexPath = path.join(resolvedPath, "index.html");
      await stat(indexPath);
      return indexPath;
    }

    return resolvedPath;
  } catch {
    if (!path.extname(resolvedPath)) {
      const htmlPath = `${resolvedPath}.html`;

      try {
        await stat(htmlPath);
        return htmlPath;
      } catch {
        return null;
      }
    }

    return null;
  }
}

async function startStaticServer(host, port) {
  const server = http.createServer(async (request, response) => {
    try {
      if (!request.url || !["GET", "HEAD"].includes(request.method ?? "GET")) {
        response.writeHead(405);
        response.end();
        return;
      }

      const requestUrl = new URL(request.url, `http://${host}:${port}`);
      const filePath = await resolveFilePath(requestUrl.pathname);

      if (!filePath) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const fileBuffer = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "no-store"
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      response.end(fileBuffer);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Server error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
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
