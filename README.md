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

Use ACM-VIT only as secondary validation that the same approach still applies to a real motion-heavy Astro site:

```powershell
corepack pnpm bench:acmvit
```
