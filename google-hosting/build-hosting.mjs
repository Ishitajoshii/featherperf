import { access, cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hostingRoot = __dirname;
const repoRoot = path.resolve(hostingRoot, "..");
const publicRoot = path.join(hostingRoot, "public");
const buildRoot = path.join(hostingRoot, ".build");
const sandboxSiteRoot = path.join(buildRoot, "demo-site");
const sourceDemoRoot = path.join(repoRoot, "demo", "site");
const resultsRoot = path.join(repoRoot, "packages", "bench", "results");
const compareRoot = path.join(publicRoot, "compare");
const dataRoot = path.join(publicRoot, "assets", "data");
const screenshotRoot = path.join(publicRoot, "assets", "screenshots");
const repoRequire = createRequire(path.join(repoRoot, "package.json"));

const NAV_LABELS = { off: "local-featherperf-off-fresh-5x", on: "local-featherperf-on-fresh-5x" };
const INT_LABELS = { off: "local-interaction-featherperf-off-fresh-5x", on: "local-interaction-featherperf-on-fresh-5x" };

const round = (v, d = 1) => Number.isFinite(v) ? Number(v.toFixed(d)) : null;
const pct = (before, after) => Number.isFinite(before) && before !== 0 && Number.isFinite(after)
  ? round(((after - before) / before) * 100, 1)
  : null;

const fmtMs = (v) => `${v} ms`;
const fmtSec = (v) => `${(v / 1000).toFixed(3)} s`;
const trend = (value) => value === null ? "n/a" : value < 0 ? `${Math.abs(value)}% faster` : value > 0 ? `${Math.abs(value)}% slower` : "flat";

function run(cmd, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`)));
  });
}

async function json(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadSummary(label) {
  return json(path.join(resultsRoot, label, "summary.json"));
}

function comparable(summary) {
  return {
    performanceScore: summary.medians.performanceScore,
    metrics: { fcpMs: summary.medians.fcpMs, lcpMs: summary.medians.lcpMs, tbtMs: summary.medians.tbtMs },
    byteWeight: { totalMb: summary.medians.totalMb }
  };
}

function compareNav(before, after) {
  return {
    performanceScore: { before: before.performanceScore, after: after.performanceScore, delta: round(after.performanceScore - before.performanceScore, 1), percentDelta: pct(before.performanceScore, after.performanceScore) },
    fcpMs: { before: before.metrics.fcpMs, after: after.metrics.fcpMs, delta: round(after.metrics.fcpMs - before.metrics.fcpMs, 0), percentDelta: pct(before.metrics.fcpMs, after.metrics.fcpMs) },
    lcpMs: { before: before.metrics.lcpMs, after: after.metrics.lcpMs, delta: round(after.metrics.lcpMs - before.metrics.lcpMs, 0), percentDelta: pct(before.metrics.lcpMs, after.metrics.lcpMs) },
    tbtMs: { before: before.metrics.tbtMs, after: after.metrics.tbtMs, delta: round(after.metrics.tbtMs - before.metrics.tbtMs, 0), percentDelta: pct(before.metrics.tbtMs, after.metrics.tbtMs) },
    totalMb: { before: before.byteWeight.totalMb, after: after.byteWeight.totalMb, delta: round(after.byteWeight.totalMb - before.byteWeight.totalMb, 1), percentDelta: pct(before.byteWeight.totalMb, after.byteWeight.totalMb) }
  };
}

function compareMetric(before, after, digits = 0) {
  return Number.isFinite(before) && Number.isFinite(after)
    ? { before, after, delta: round(after - before, digits), percentDelta: pct(before, after) }
    : { before, after, delta: null, percentDelta: null };
}

function buildPayloads(nav, interaction) {
  const benchmarkPayload = {
    narrative: {
      product: "FeatherPerf",
      theme: "Smart Resource Allocation",
      problem: "below-the-fold motion code steals early browser budget from useful content",
      safetyModel: "defer only safe, non-critical motion entrypoints tied to below-the-fold selectors",
      crisisUseCase: "In a crisis-response page, alerts and instructions should render before decorative motion bundles."
    },
    routes: { baseline: "/compare/off/", optimized: "/compare/on/" },
    navigation: { off: nav.off, on: nav.on, comparison: compareNav(comparable(nav.off), comparable(nav.on)) },
    interaction: {
      off: interaction.off,
      on: interaction.on,
      comparison: {
        inpMs: compareMetric(interaction.off.medians.inpMs, interaction.on.medians.inpMs, 0),
        eventTimingDurationMs: compareMetric(interaction.off.medians.eventTimingDurationMs, interaction.on.medians.eventTimingDurationMs, 0),
        processingDelayMs: compareMetric(interaction.off.medians.processingDelayMs, interaction.on.medians.processingDelayMs, 0),
        manualLatencyMs: compareMetric(interaction.off.medians.manualLatencyMs, interaction.on.medians.manualLatencyMs, 0)
      }
    }
  };

  const pluginPayload = {
    importerPath: "src/pages/index.astro",
    deferredModulePath: "src/scripts/baseline.ts",
    triggerSelector: "#deferred-showcase",
    relatedMounts: ["#deferred-panel", "#deferred-grid", "#lottie-host"],
    supportedPackages: ["gsap", "lottie-web"],
    currentConfig: {
      include: ["src/pages/", "src/scripts/"],
      exclude: ["/hero/i"],
      criticalSelectors: ["body", "main", ".hero"],
      postLoadDelayMs: 2000,
      interactionQuietWindowMs: 1000,
      lookaheadPx: 0
    }
  };

  const fallbackSummary = {
    headline: "FeatherPerf reallocates early browser work away from non-critical motion code.",
    bullets: [
      `FCP improved from ${benchmarkPayload.navigation.comparison.fcpMs.before} ms to ${benchmarkPayload.navigation.comparison.fcpMs.after} ms (${trend(benchmarkPayload.navigation.comparison.fcpMs.percentDelta)}).`,
      `LCP improved from ${benchmarkPayload.navigation.comparison.lcpMs.before} ms to ${benchmarkPayload.navigation.comparison.lcpMs.after} ms (${trend(benchmarkPayload.navigation.comparison.lcpMs.percentDelta)}).`,
      `TBT moved from ${benchmarkPayload.navigation.comparison.tbtMs.before} ms to ${benchmarkPayload.navigation.comparison.tbtMs.after} ms, so the current demo should be framed as an FCP-first win whenever blocking time does not improve.`,
      `Hero-click INP improved from ${benchmarkPayload.interaction.comparison.inpMs.before} ms to ${benchmarkPayload.interaction.comparison.inpMs.after} ms while processing delay moved from ${benchmarkPayload.interaction.comparison.processingDelayMs.before} ms to ${benchmarkPayload.interaction.comparison.processingDelayMs.after} ms.`
    ]
  };

  const fallbackConfig = {
    headline: "Start with a narrow, conservative config around the known-safe motion entrypoint.",
    bullets: [
      "Keep include limited to src/pages/ and src/scripts/ while the importer lives at the page layer.",
      "Continue excluding hero-like selectors so above-the-fold content stays on the critical path.",
      "Use explicit criticalSelectors for body, main, and .hero before broadening rollout."
    ],
    configHints: {
      include: pluginPayload.currentConfig.include,
      exclude: pluginPayload.currentConfig.exclude,
      criticalSelectors: pluginPayload.currentConfig.criticalSelectors
    }
  };

  return { benchmarkPayload, pluginPayload, fallbackSummary, fallbackConfig };
}

async function resolvePnpmPackageEntry(packageName, relativeEntry) {
  const pnpmRoot = path.join(repoRoot, "node_modules", ".pnpm");
  const entries = await readdir(pnpmRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmRoot, entry.name, "node_modules", packageName, ...relativeEntry));

  for (const candidate of candidates.sort((left, right) => left.localeCompare(right))) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }

  throw new Error(`Unable to resolve ${packageName}/${relativeEntry.join("/")} from the repo pnpm store.`);
}

async function loadViteBuild() {
  const viteModulePath = await resolvePnpmPackageEntry("vite", ["dist", "node", "index.js"]);
  const viteModule = await import(pathToFileURL(viteModulePath).href);
  if (typeof viteModule.build !== "function") {
    throw new Error("Unable to load Vite build API from repo dependencies.");
  }
  return viteModule.build;
}

async function loadFeatherperfPlugin() {
  const pluginEntryPath = path.join(repoRoot, "packages", "vite-plugin", "dist", "index.js");
  const pluginModule = await import(pathToFileURL(pluginEntryPath).href);
  if (typeof pluginModule.featherperf !== "function") {
    throw new Error("Unable to load featherperf() from packages/vite-plugin/dist/index.js.");
  }
  return pluginModule.featherperf;
}

async function loadSandboxConfig(mode) {
  const configPath = path.join(sandboxSiteRoot, "featherperf.config.mjs");
  const loaded = await import(`${pathToFileURL(configPath).href}?mode=${mode}&t=${Date.now()}`);
  return loaded.default ?? {};
}

async function prepareSandbox() {
  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(buildRoot, { recursive: true });
  await cp(sourceDemoRoot, sandboxSiteRoot, { recursive: true });
  await rm(path.join(sandboxSiteRoot, "dist"), { recursive: true, force: true });

  const sandboxIndexPath = path.join(sandboxSiteRoot, "src", "pages", "index.astro");
  const sandboxConfigPath = path.join(sandboxSiteRoot, "featherperf.config.mjs");
  const sandboxEntryPath = path.join(sandboxSiteRoot, "src", "scripts", "demo-entry.ts");
  const sandboxBaselinePath = path.join(sandboxSiteRoot, "src", "scripts", "baseline.ts");

  const indexSource = await readFile(sandboxIndexPath, "utf8");
  const patchedIndex = indexSource.replace(
    /<script>\s*import \{ runBaselineAnimations \} from '\.\.\/scripts\/baseline';\s*runBaselineAnimations\('#deferred-panel'\);\s*<\/script>/,
    "<!-- featherperf-motion-entry -->"
  );
  await writeFile(sandboxIndexPath, patchedIndex, "utf8");

  const configSource = await readFile(sandboxConfigPath, "utf8");
  const patchedConfig = configSource.replace("include: ['src/pages/']", "include: ['src/pages/', 'src/scripts/']");
  await writeFile(sandboxConfigPath, patchedConfig, "utf8");

  await writeFile(sandboxEntryPath, "import { runBaselineAnimations } from './baseline';\n\nrunBaselineAnimations('#deferred-showcase');\n", "utf8");

  const sandboxBaselineSource = [
    "import { gsap } from 'gsap';",
    "import lottie from 'lottie-web';",
    "",
    "type DemoMotionState = {",
    "  phase: string;",
    "  initialChecksum?: number;",
    "  followUpChecksum?: number;",
    "};",
    "",
    "type DemoWindow = Window & {",
    "  __featherperfDemoMotionState?: DemoMotionState;",
    "};",
    "",
    "function runCpuWarmup(iterations = 1_500_000): number {",
    "  let checksum = 0;",
    "  for (let i = 1; i <= iterations; i += 1) {",
    "    checksum += Math.sin(i) * Math.cos(i / 3);",
    "  }",
    "  return checksum;",
    "}",
    "",
    "function getDemoWindow(): DemoWindow | null {",
    "  if (typeof window === 'undefined') {",
    "    return null;",
    "  }",
    "",
    "  return window as DemoWindow;",
    "}",
    "",
    "function setMotionPhase(phase: string, details: Partial<DemoMotionState> = {}): void {",
    "  const demoWindow = getDemoWindow();",
    "  if (!demoWindow) {",
    "    return;",
    "  }",
    "",
    "  demoWindow.__featherperfDemoMotionState = {",
    "    ...(demoWindow.__featherperfDemoMotionState ?? {}),",
    "    ...details,",
    "    phase",
    "  };",
    "}",
    "",
    "export function runBaselineAnimations(rootSelector = '#deferred-showcase'): void {",
    "  const root = document.querySelector<HTMLElement>(rootSelector);",
    "  const scope = root?.parentElement?.parentElement ?? document;",
    "  const tiles = Array.from(scope.querySelectorAll<HTMLElement>('.orb'));",
    "  const host = scope.querySelector<HTMLElement>('#lottie-host');",
    "",
    "  if (!root || tiles.length === 0 || !host) {",
    "    return;",
    "  }",
    "",
    "  setMotionPhase('initial-warmup');",
    "  const checksum = runCpuWarmup();",
    "  setMotionPhase('initial-ready', { initialChecksum: checksum });",
    "",
    "  gsap.set(tiles, { opacity: 0, y: 26, rotateZ: -1.5 });",
    "  const tl = gsap.timeline();",
    "  tiles.forEach((tile, index) => {",
    "    tl.to(",
    "      tile,",
    "      {",
    "        opacity: 1,",
    "        y: 0,",
    "        rotateZ: 0,",
    "        duration: 0.38,",
    "        ease: 'power2.out'",
    "      },",
    "      index * 0.016",
    "    );",
    "  });",
    "",
    "  lottie.setQuality('high');",
    "  lottie.freeze();",
    "  lottie.unfreeze();",
    "",
    "  if (host) {",
    "    host.textContent = 'Lottie ' + lottie.version + ' initialized | checksum ' + checksum.toFixed(2);",
    "  }",
    "",
    "  setMotionPhase('follow-up-scheduled', { initialChecksum: checksum });",
    "  window.setTimeout(() => {",
    "    setMotionPhase('follow-up-running', { initialChecksum: checksum });",
    "    const followUpChecksum = runCpuWarmup(3_000_000);",
    "    setMotionPhase('ready', {",
    "      initialChecksum: checksum,",
    "      followUpChecksum",
    "    });",
    "",
    "    if (host) {",
    "      host.textContent = 'Lottie ' + lottie.version + ' ready | initial ' + checksum.toFixed(2) + ' | follow-up ' + followUpChecksum.toFixed(2);",
    "    }",
    "  }, 90);",
    "}",
    ""
  ].join("\n");

  await writeFile(sandboxBaselinePath, sandboxBaselineSource, "utf8");
}

function patchHtml(html) {
  return html
    .replaceAll('src="/_astro/', 'src="./_astro/')
    .replaceAll('href="/_astro/', 'href="./_astro/')
    .replaceAll('src="/assets/', 'src="../assets/')
    .replaceAll('href="/assets/', 'href="../assets/');
}

async function buildPageShell() {
  await rm(path.join(sandboxSiteRoot, "dist"), { recursive: true, force: true });
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const args = process.platform === "win32" ? ["/c", "corepack", "pnpm", "build"] : ["pnpm", "build"];
  await run(command, args, sandboxSiteRoot, { ...process.env, FEATHERPERF: "off" });
}

async function listJavaScriptFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(absolute));
    } else if (entry.isFile() && absolute.endsWith('.js')) {
      files.push(absolute);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function buildVariant(mode) {
  const distMotionDir = path.join(sandboxSiteRoot, mode === "on" ? "dist-motion-on" : "dist-motion-off");
  await rm(distMotionDir, { recursive: true, force: true });

  const viteBuild = await loadViteBuild();
  const featherperf = await loadFeatherperfPlugin();
  const featherperfOptions = await loadSandboxConfig(mode);
  const previousFeatherperf = process.env.FEATHERPERF;
  const previousDebug = process.env.FEATHERPERF_DEBUG;
  process.env.FEATHERPERF = mode;
  process.env.FEATHERPERF_DEBUG = mode === "on" ? "on" : "off";

  try {
    await viteBuild({
      configFile: false,
      root: sandboxSiteRoot,
      logLevel: "info",
      plugins: mode === "on" ? [featherperf({ ...featherperfOptions, lookaheadPx: 0, debug: true })] : [],
      build: {
        outDir: distMotionDir,
        emptyOutDir: true,
        copyPublicDir: false,
        rollupOptions: {
          input: path.join(sandboxSiteRoot, "src", "scripts", "demo-entry.ts"),
          output: {
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash][extname]"
          }
        }
      }
    });
  } finally {
    if (previousFeatherperf === undefined) {
      delete process.env.FEATHERPERF;
    } else {
      process.env.FEATHERPERF = previousFeatherperf;
    }

    if (previousDebug === undefined) {
      delete process.env.FEATHERPERF_DEBUG;
    } else {
      process.env.FEATHERPERF_DEBUG = previousDebug;
    }
  }

  const jsFiles = await listJavaScriptFiles(distMotionDir);
  const entryFile = jsFiles.find((filePath) => path.basename(filePath).startsWith("demo-entry-")) ?? jsFiles[0];
  if (!entryFile) {
    throw new Error(`No motion bundle generated for ${mode}.`);
  }

  const target = path.join(compareRoot, mode);
  await rm(target, { recursive: true, force: true });
  await cp(path.join(sandboxSiteRoot, "dist"), target, { recursive: true });
  await cp(distMotionDir, target, { recursive: true });

  const hostedEntry = path.join(target, path.relative(distMotionDir, entryFile));
  const relativeEntry = `./${path.relative(target, hostedEntry).replace(/\\/g, "/")}`;
  const indexPath = path.join(target, "index.html");
  const shell = patchHtml(await readFile(indexPath, "utf8"));
  const withMotion = shell.replace("<!-- featherperf-motion-entry -->", `<script type="module" src="${relativeEntry}"></script>`);
  await writeFile(indexPath, withMotion, "utf8");
}

async function copyScreenshots() {
  const jobs = [
    [path.join(resultsRoot, NAV_LABELS.off, "screenshots", "desktop-home.png"), path.join(screenshotRoot, "off-desktop-home.png")],
    [path.join(resultsRoot, NAV_LABELS.on, "screenshots", "desktop-home.png"), path.join(screenshotRoot, "on-desktop-home.png")],
    [path.join(resultsRoot, NAV_LABELS.off, "screenshots", "mobile-home.png"), path.join(screenshotRoot, "off-mobile-home.png")],
    [path.join(resultsRoot, NAV_LABELS.on, "screenshots", "mobile-home.png"), path.join(screenshotRoot, "on-mobile-home.png")]
  ];
  await Promise.all(jobs.map(([src, dest]) => copyFile(src, dest)));
}

function homepage({ benchmarkPayload, pluginPayload, fallbackSummary, fallbackConfig }) {
  const nav = benchmarkPayload.navigation.comparison;
  const interaction = benchmarkPayload.interaction.comparison;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FeatherPerf Benchmark Lab</title>
<meta name="description" content="FeatherPerf Benchmark Lab shows controlled benchmark proof for deferring non-critical GSAP and lottie-web work on Astro and Vite sites." />
<style>
:root{--bg:#f5efe3;--bg2:#dce8f5;--ink:#1f1b20;--muted:#5c5864;--paper:rgba(255,255,255,.86);--line:rgba(31,27,32,.12);--teal:#0f4c5c;--green:#2c6e49;--orange:#c76a1d;--shadow:0 22px 56px rgba(21,16,11,.14)}*{box-sizing:border-box}body{margin:0;font-family:Georgia,"Times New Roman",serif;color:var(--ink);background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.8),transparent 28%),radial-gradient(circle at 80% 12%,rgba(199,106,29,.16),transparent 22%),linear-gradient(180deg,var(--bg),var(--bg2) 54%,#f4efe6)}a{color:inherit}.page{width:min(1180px,calc(100vw - 28px));margin:0 auto;padding:28px 0 84px}.hero,.cards,.shots,.flow,.analysis{display:grid;gap:18px}.hero{grid-template-columns:1.3fr .9fr}.panel,.hero-copy,.hero-proof,.card{border-radius:28px;border:1px solid var(--line);box-shadow:var(--shadow);background:var(--paper)}.hero-copy,.panel,.card{padding:22px}.hero-proof{padding:24px;background:linear-gradient(140deg,rgba(15,76,92,.94),rgba(44,110,73,.88));color:#f8f7f2}.eyebrow{display:inline-flex;padding:.42rem .74rem;border-radius:999px;background:rgba(255,255,255,.78);border:1px solid rgba(31,27,32,.08);color:var(--muted);font-size:.78rem;letter-spacing:.08em;text-transform:uppercase}h1,h2,h3,p{margin:0}h1{margin-top:18px;margin-bottom:14px;font-size:clamp(2.6rem,6vw,4.7rem);line-height:.96}.lead,.body,.card span,.panel p,li{color:var(--muted);line-height:1.56}.buttons{margin-top:22px;display:flex;flex-wrap:wrap;gap:12px}.button{appearance:none;border:0;border-radius:999px;padding:.95rem 1.24rem;font:inherit;font-weight:700;font-size:.95rem;text-decoration:none;cursor:pointer}.primary{color:#fff9f2;background:linear-gradient(135deg,var(--teal),var(--green))}.secondary{color:var(--ink);background:rgba(255,255,255,.92);border:1px solid rgba(31,27,32,.1)}pre{margin:18px 0 0;padding:16px;overflow-x:auto;border-radius:18px;background:#1d1a1f;color:#f5f2eb;font-family:"Cascadia Code",Consolas,monospace;font-size:.92rem;line-height:1.45}.hero-proof p{color:rgba(248,247,242,.82)}.proof-stack{margin-top:18px;display:grid;gap:12px}.proof{padding:16px 18px;border-radius:20px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.12)}.proof strong{display:block;margin-top:6px;font-size:1.28rem;color:#fffdf8}.cards{margin-top:18px;grid-template-columns:repeat(3,minmax(0,1fr))}.proof-strip{margin-top:18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card strong{display:block;margin-top:10px;font-size:1.38rem}.shots,.analysis{margin-top:18px;grid-template-columns:repeat(2,minmax(0,1fr))}.shots img{width:100%;display:block;margin-top:12px;border-radius:18px;border:1px solid var(--line)}.flow{margin-top:18px;grid-template-columns:repeat(3,minmax(0,1fr))}.result{margin-top:16px;padding:16px;border-radius:18px;background:rgba(15,76,92,.06);border:1px solid rgba(15,76,92,.12)}.result strong{display:block;margin-bottom:10px}.status{margin-top:10px;font-size:.93rem;color:var(--muted)}.crisis{margin-top:18px;padding:22px;border-radius:24px;background:linear-gradient(145deg,rgba(199,106,29,.1),rgba(15,76,92,.08));border:1px solid rgba(199,106,29,.18)}ul{margin:12px 0 0;padding-left:18px}code{font-family:"Cascadia Code",Consolas,monospace}@media (max-width:980px){.hero,.cards,.proof-strip,.shots,.flow,.analysis{grid-template-columns:1fr}}
</style>
</head>
<body>
<main class="page">
<section class="hero"><div class="hero-copy"><div class="eyebrow">Google Hack � Smart Resource Allocation</div><h1>FeatherPerf Benchmark Lab</h1><p class="lead">FeatherPerf is a conservative Vite plugin for Astro and motion-heavy sites. It defers safe, below-the-fold GSAP and lottie-web work so the browser spends its early budget on useful content instead of decorative motion code.</p><div class="buttons"><a class="button primary" href="/compare/off/">Open baseline route</a><a class="button secondary" href="/compare/on/">Open optimized route</a></div><pre>npm install @featherperf/vite-plugin

import { featherperf } from '@featherperf/vite-plugin';

featherperf({
  include: ['src/pages/'],
  exclude: [/hero/i],
  criticalSelectors: ['body', 'main', '.hero']
});</pre></div><aside class="hero-proof"><h2>Controlled benchmark headline</h2><p>This hosted page reads the committed local benchmark artifacts and publishes the exact off/on demo routes from the repo. The proof is reproducible, not hand-waved.</p><div class="proof-stack"><div class="proof"><span>Median FCP</span><strong>${fmtSec(nav.fcpMs.before)} ? ${fmtSec(nav.fcpMs.after)}</strong></div><div class="proof"><span>Median TBT</span><strong>${fmtMs(nav.tbtMs.before)} ? ${fmtMs(nav.tbtMs.after)}</strong></div><div class="proof"><span>Median hero-click INP</span><strong>${fmtMs(interaction.inpMs.before)} ? ${fmtMs(interaction.inpMs.after)}</strong></div></div></aside></section>
<section class="panel"><h2>Navigation proof</h2><p class="body">The current FeatherPerf demo is strongest as a controlled proof of resource reallocation. It removes the heavy motion bundle from the initial navigation path and measures how that changes paint, blocking time, and early input responsiveness.</p><div class="cards"><article class="card"><small>Performance score</small><strong>${nav.performanceScore.before} ? ${nav.performanceScore.after}</strong><span>Lighthouse median score on the local proof benchmark.</span></article><article class="card"><small>First Contentful Paint</small><strong>${fmtSec(nav.fcpMs.before)} ? ${fmtSec(nav.fcpMs.after)}</strong><span>${trend(nav.fcpMs.percentDelta)} on the first visible render.</span></article><article class="card"><small>Largest Contentful Paint</small><strong>${fmtSec(nav.lcpMs.before)} ? ${fmtSec(nav.lcpMs.after)}</strong><span>${trend(nav.lcpMs.percentDelta)} while the hero remains stable.</span></article></div><div class="proof-strip"><article class="card"><small>Total Blocking Time</small><strong>${fmtMs(nav.tbtMs.before)} ? ${fmtMs(nav.tbtMs.after)}</strong><span>Main-thread pressure during navigation.</span></article><article class="card"><small>Total bytes</small><strong>${benchmarkPayload.navigation.off.medians.totalMb} MB ? ${benchmarkPayload.navigation.on.medians.totalMb} MB</strong><span>Measured on the controlled local route.</span></article><article class="card"><small>INP</small><strong>${fmtMs(interaction.inpMs.before)} ? ${fmtMs(interaction.inpMs.after)}</strong><span>Hero click responsiveness in the timespan benchmark.</span></article><article class="card"><small>Processing delay</small><strong>${fmtMs(interaction.processingDelayMs.before)} ? ${fmtMs(interaction.processingDelayMs.after)}</strong><span>Event Timing processing delay for the hero click.</span></article></div></section>
<section class="panel"><h2>Live compare routes</h2><p class="body">These screenshots come from the same committed result artifacts that power the numbers above. Judges can open the live routes directly and compare the page with FeatherPerf disabled and enabled.</p><div class="shots"><article class="card"><h3>Baseline: /compare/off</h3><p>The motion bundle runs during initial navigation.</p><img src="/assets/screenshots/off-desktop-home.png" alt="Baseline desktop screenshot" /></article><article class="card"><h3>Optimized: /compare/on</h3><p>The below-the-fold motion setup is deferred until it is relevant.</p><img src="/assets/screenshots/on-desktop-home.png" alt="Optimized desktop screenshot" /></article></div></section>
<section class="panel"><h2>How FeatherPerf reallocates work</h2><p class="body">The current implementation is deliberately conservative. It is not trying to rewrite arbitrary app logic; it is trying to safely move one category of work off the critical path.</p><div class="flow"><article class="card"><h3>1. Detect motion-heavy entrypoints</h3><p>Look for supported imports such as gsap and lottie-web in client-side importer shapes the plugin can rewrite safely.</p></article><article class="card"><h3>2. Preserve hero-critical selectors</h3><p>Body, main, hero, header, and app-shell selectors stay protected so useful content paints first.</p></article><article class="card"><h3>3. Wake motion later</h3><p>Defer the non-critical module until the below-the-fold section is near the viewport or the page is otherwise quiet.</p></article></div><div class="crisis"><h3>Rapid crisis example inside the Smart Resource Allocation track</h3><p>Imagine a hospital or campus emergency page built with rich motion. The browser should render the alert banner, status message, emergency number, and next instructions before it spends CPU on the decorative animation section. FeatherPerf makes that priority order explicit.</p></div></section>
<section class="panel"><h2>Gemini-powered analysis layer</h2><p class="body">Gemini is not part of the optimization engine. It sits beside the plugin as a developer-facing explanation layer that turns benchmark and config inputs into concise resource-allocation guidance.</p><div class="analysis"><article class="card"><h3>Explain the benchmark</h3><p>Send the real off/on payload to <code>POST /api/analyze</code> in <code>benchmark-summary</code> mode.</p><div class="buttons"><button class="button primary" id="benchmark-summary-button" type="button">Ask Gemini</button></div><div class="status" id="benchmark-summary-status">Ready.</div><div class="result" id="benchmark-summary-result"><strong>Benchmark explanation will appear here.</strong><p class="body">A deterministic fallback is preloaded so the page still works before Cloud Run or Vertex is wired up.</p></div></article><article class="card"><h3>Suggest config hints</h3><p>Send the demo plugin report payload to <code>POST /api/analyze</code> in <code>config-hints</code> mode.</p><div class="buttons"><button class="button primary" id="config-hints-button" type="button">Ask Gemini</button></div><div class="status" id="config-hints-status">Ready.</div><div class="result" id="config-hints-result"><strong>Config guidance will appear here.</strong><p class="body">The fallback keeps the suggestion narrow and conservative.</p></div></article></div></section>
<section class="panel"><h2>Reproduce the proof locally</h2><p class="body">The benchmark story is anchored in the repo. The hosted site is just a deployment wrapper around the existing controlled proof.</p><pre>corepack pnpm install
corepack pnpm demo:compare
corepack pnpm demo:interaction
node .\\google-hosting\\build-hosting.mjs</pre></section>
</main>
<script>
const benchmarkPayload=${JSON.stringify(benchmarkPayload)};
const benchmarkFallback=${JSON.stringify(fallbackSummary)};
const configPayload=${JSON.stringify(pluginPayload)};
const configFallback=${JSON.stringify(fallbackConfig)};
const escapeHtmlClient=(value)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function renderResult(id,data){const el=document.getElementById(id);if(!el)return;const bullets=Array.isArray(data?.bullets)?'<ul>'+data.bullets.map((bullet)=>'<li>'+escapeHtmlClient(bullet)+'</li>').join('')+'</ul>':'';const hints=data?.configHints?'<pre>'+escapeHtmlClient(JSON.stringify(data.configHints,null,2))+'</pre>':'';el.innerHTML='<strong>'+escapeHtmlClient(data?.headline??'Analysis')+'</strong>'+bullets+hints}
async function postAnalysis(body){const response=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('API returned '+response.status);return response.json()}
function wire(buttonId,statusId,resultId,body,fallback,pending){const button=document.getElementById(buttonId);const status=document.getElementById(statusId);if(!(button instanceof HTMLButtonElement)||!(status instanceof HTMLElement))return;renderResult(resultId,fallback);button.addEventListener('click',async()=>{button.disabled=true;status.textContent=pending;try{renderResult(resultId,await postAnalysis(body));status.textContent='Loaded from Cloud Run / Vertex AI.'}catch(error){renderResult(resultId,fallback);status.textContent='Using fallback because the API call failed: '+(error instanceof Error ? error.message : 'unknown error')+'.'}finally{button.disabled=false}})}
wire('benchmark-summary-button','benchmark-summary-status','benchmark-summary-result',{mode:'benchmark-summary',benchmarkSummary:benchmarkPayload},benchmarkFallback,'Requesting Gemini benchmark summary...');
wire('config-hints-button','config-hints-status','config-hints-result',{mode:'config-hints',pluginReport:configPayload,benchmarkSummary:benchmarkPayload},configFallback,'Requesting Gemini config guidance...');
</script>
</body>
</html>`;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const templateRoot = path.join(hostingRoot, "assets", "templates");

async function applyDesignOverrides(payloads) {
  // 1. Copy styles.css
  await copyFile(path.join(templateRoot, "styles.css"), path.join(publicRoot, "styles.css"));

  // 2. Apply themed landing page
  let indexHtml = await readFile(path.join(templateRoot, "index.html"), "utf8");
  indexHtml = indexHtml
    .replace('"%%BENCHMARK_PAYLOAD%%"', JSON.stringify(payloads.benchmarkPayload))
    .replace('"%%BENCHMARK_FALLBACK%%"', JSON.stringify(payloads.fallbackSummary))
    .replace('"%%CONFIG_PAYLOAD%%"', JSON.stringify(payloads.pluginPayload))
    .replace('"%%CONFIG_FALLBACK%%"', JSON.stringify(payloads.fallbackConfig))
    .replace('href="#">Docs</a>', 'class="docs-nav-link" href="/docs/">Docs</a>')
    .replace('<div class="hero-buttons"><a class="btn btn-primary" href="/compare/off/">Run a Live Comparison â†’</a><a class="btn btn-outline" href="/compare/on/">Explore Benchmark Lab</a></div>', '<div class="hero-buttons"><a class="btn btn-primary" href="/compare/off/">Run a Live Comparison â†’</a><a class="btn btn-outline" href="/compare/on/">Explore Benchmark Lab</a><a class="btn btn-outline docs-hero-link" href="/docs/">Read Docs</a></div>')
    .replace('href="#">Supported patterns', 'href="/docs/">Supported patterns');
  await writeFile(path.join(publicRoot, "index.html"), indexHtml, "utf8");

  // 3. Generate docs page with the same visual system
  await mkdir(path.join(publicRoot, "docs"), { recursive: true });
  const docsHtml = await readFile(path.join(templateRoot, "docs.html"), "utf8");
  await writeFile(path.join(publicRoot, "docs", "index.html"), docsHtml, "utf8");

  // 4. Apply themed compare pages
  const compareTemplate = await readFile(path.join(templateRoot, "compare.html"), "utf8");
  for (const mode of ["off", "on"]) {
    const builtHtml = await readFile(path.join(compareRoot, mode, "index.html"), "utf8");
    const scriptMatch = builtHtml.match(/src="([^"]*demo-entry[^"]*)"/);
    const scriptEntry = scriptMatch ? scriptMatch[1] : `./assets/demo-entry.js`;

    const isOff = mode === "off";
    const themed = compareTemplate
      .replaceAll("%%MODE%%", mode)
      .replace("%%TITLE%%", isOff ? "Baseline" : "Optimized")
      .replace("%%TAG_LABEL%%", isOff ? "Baseline \u00b7 FeatherPerf OFF" : "Optimized \u00b7 FeatherPerf ON")
      .replace("%%EYEBROW%%", isOff ? "Baseline Route \u00b7 JS-Heavy" : "Optimized Route \u00b7 FeatherPerf Active")
      .replace("%%OFF_ACTIVE%%", isOff ? "active" : "")
      .replace("%%ON_ACTIVE%%", isOff ? "" : "active")
      .replace("%%NOTICE%%", isOff ? "Used to force lottie-web runtime initialization in baseline mode." : "Used to force lottie-web runtime initialization only when the deferred section gets close.")
      .replace("%%SCRIPT_ENTRY%%", scriptEntry);

    await writeFile(path.join(compareRoot, mode, "index.html"), themed, "utf8");
  }

  console.log("Applied themed design overrides from assets/templates/.");
}

async function main() {
  await rm(publicRoot, { recursive: true, force: true });
  await mkdir(compareRoot, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  await mkdir(screenshotRoot, { recursive: true });

  const nav = { off: await loadSummary(NAV_LABELS.off), on: await loadSummary(NAV_LABELS.on) };
  const interaction = { off: await loadSummary(INT_LABELS.off), on: await loadSummary(INT_LABELS.on) };
  const payloads = buildPayloads(nav, interaction);

  await prepareSandbox();
  await buildPageShell();
  await buildVariant("off");
  await buildVariant("on");
  await copyScreenshots();

  await writeJson(path.join(dataRoot, "benchmark-payload.json"), payloads.benchmarkPayload);
  await writeJson(path.join(dataRoot, "demo-plugin-report.json"), payloads.pluginPayload);
  await writeJson(path.join(dataRoot, "official-analysis-fallback.json"), payloads.fallbackSummary);
  await writeJson(path.join(dataRoot, "config-hints-fallback.json"), payloads.fallbackConfig);

  // Apply themed design (replaces old homepage() call)
  await applyDesignOverrides(payloads);

  console.log(`Generated hosting output in ${publicRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
