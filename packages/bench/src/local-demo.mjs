import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(__dirname, "..");
export const repoRoot = path.resolve(packageRoot, "..", "..");
export const demoSiteRoot = path.join(repoRoot, "demo", "site");
export const demoDistRoot = path.join(demoSiteRoot, "dist");

export function getPnpmCommand() {
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

export function runProcess(command, args, label, cwd = repoRoot, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      ...options
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

export async function buildDemoSite() {
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

export async function startStaticServer(host, port) {
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
