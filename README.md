# FeatherPerf

Performance-focused Vite plugin and runtime for modern web applications.

Primary benchmark target: local demo site built from `demo/site`

Secondary validation target: `https://www.acmvit.in/`

The project is being framed around smart resource allocation for motion-heavy Astro/Vite sites, starting with GSAP, ScrollTrigger, and Lottie deferral backed by Lighthouse baselines.

Current locked MVP scope:

- target only `gsap`, `ScrollTrigger`, and `lottie-web`
- only defer safe, non-critical client modules
- ignore everything else for now

## Benchmark Workflow

Use the local benchmark as the default proof because it removes CDN, network, and remote-server variance while keeping Lighthouse's mobile throttling model.

```powershell
corepack pnpm bench:local
```

That command:

- builds `demo/site` in production mode
- serves the generated `dist` folder locally on `127.0.0.1:4321`
- runs the existing Lighthouse benchmark with a fresh Chrome profile per run
- writes artifacts under `packages/bench/results/local-baseline-fresh-5x`

For an actual FeatherPerf comparison, run the demo in both modes with explicit labels:

```powershell
$env:FEATHERPERF='off'
corepack pnpm --filter @featherperf/bench bench:local -- --label local-featherperf-off-fresh-5x

$env:FEATHERPERF='on'
corepack pnpm --filter @featherperf/bench bench:local -- --label local-featherperf-on-fresh-5x

Remove-Item Env:FEATHERPERF
```

Recorded local medians on `2026-04-25`:

- `off`: Performance `91`, FCP `2.708 s`, LCP `2.914 s`, TBT `64 ms`
- `on`: Performance `93`, FCP `1.804 s`, LCP `2.854 s`, TBT `132 ms`

That means the current prototype improves first paint materially, but it does not yet beat the `off` run on TBT. The benchmark story should stay framed that way.

Use ACM-VIT only as secondary validation that the same approach still applies to a real motion-heavy Astro site:

```powershell
corepack pnpm bench:acmvit
```

Detailed benchmark method, labels, and committed result sets live in [docs/benchmark-results.md](docs/benchmark-results.md).
