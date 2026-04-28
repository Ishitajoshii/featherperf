# Benchmark Results

## Benchmark Policy

- Primary proof is the local demo benchmark from `demo/site`.
- Secondary proof is the ACM-VIT homepage baseline.
- Benchmark claims should cite a committed `summary.json`, not a single Lighthouse screenshot.
- Use medians from 5 fresh-profile runs as the default comparison unit.

The benchmark story is intentionally narrow: FeatherPerf is trying to improve scheduling for motion-heavy Astro/Vite pages. It is not claiming to solve every transfer or media bottleneck.

## Reproduction Method

### Recommended proof flow

If you want the fastest before/after evaluation path for the repo, run:

```powershell
corepack pnpm demo:compare
```

That command runs the local demo twice under the same benchmark method:

- `FEATHERPERF=off`
- `FEATHERPERF=on`

Then it prints a readable comparison based on the saved median summaries.

### Local demo default run

```powershell
corepack pnpm bench:local
```

What that does:

- builds `demo/site` in production mode
- serves `demo/site/dist` on `http://127.0.0.1:4321/`
- runs Lighthouse with mobile defaults
- uses a fresh Chrome profile for each pass
- saves HTML, JSON, screenshots, and `summary.json` under `packages/bench/results/<label>`

### Local FeatherPerf off/on comparison

The local demo is controlled by `FEATHERPERF` in `demo/site/astro.config.mjs`.

```powershell
$env:FEATHERPERF='off'
corepack pnpm --filter @featherperf/bench bench:local -- --label local-featherperf-off-fresh-5x

$env:FEATHERPERF='on'
corepack pnpm --filter @featherperf/bench bench:local -- --label local-featherperf-on-fresh-5x

Remove-Item Env:FEATHERPERF
```

Useful runner flags:

- `--label <name>` to keep result sets separate
- `--runs <count>` to change pass count
- `--chrome-path <path>` to override browser detection
- `--results-dir <path>` to write outside the default results folder
- `--skip-assets` to skip Lighthouse asset capture
- `--skip-screenshots` to skip screenshot capture
- `--no-build` for local reruns against an already-built demo
- `--no-fresh-profile` only if you explicitly want a warm-browser run

### Secondary validation run

```powershell
corepack pnpm bench:acmvit
```

That runs Lighthouse directly against `https://www.acmvit.in/` with 5 fresh-profile passes and stores artifacts under `packages/bench/results/acmvit-baseline-fresh-5x`.

## Current Local Result Sets

### Plain local baseline

- Date: `2026-04-24`
- Label: `local-baseline-fresh-5x`
- Target: `http://127.0.0.1:4321/`
- Aggregate: `median of 5`

| Metric | Median |
| --- | --- |
| Performance | `89` |
| FCP | `2.705 s` |
| LCP | `2.944 s` |
| TBT | `136 ms` |
| Speed Index | `2.705 s` |
| CLS | `0` |
| Total Bytes | `0.4 MB` |

Readout:

- Requests: `3`
- Dominant transfer: one client bundle at `384.6 KB`
- Images: `0 MB`
- Media: `0 MB`
- Bootup time band: `730 ms` to `768 ms`
- Script evaluation band: `731 ms` to `768 ms`

Artifacts:

- Reports: `packages/bench/results/local-baseline-fresh-5x/run-{1,2,3,4,5}.report.{html,json}`
- Summary: `packages/bench/results/local-baseline-fresh-5x/summary.json`
- Screenshots: `packages/bench/results/local-baseline-fresh-5x/screenshots/*`

### Local comparison: FeatherPerf off vs on

- Date: `2026-04-28`
- Labels: `local-featherperf-off-fresh-5x` and `local-featherperf-on-fresh-5x`
- Aggregate: `median of 5`

| Mode | Performance | FCP | LCP | TBT | Speed Index | CLS | Total Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Off | `90` | `2.754 s` | `2.840 s` | `125 ms` | `2.754 s` | `0` | `0.4 MB` |
| On | `100` | `0.797 s` | `0.947 s` | `0 ms` | `0.797 s` | `0` | `0 MB` |
| Delta | `+10` | `-1957 ms` | `-1893 ms` | `-125 ms` | `-1957 ms` | `0` | `-0.4 MB` |

What this means:

- The current scheduler fix improves first paint and TBT on the controlled demo.
- The deferred motion bundle is moved out of the initial navigation window, which is why the `on` run reports `0 MB` during the navigation benchmark.
- This is still a scheduling story, not a claim that the app's motion bundle vanished forever.
- The controlled demo proof is now much stronger, but broader real-site validation is still necessary.

Artifacts:

- Off summary: `packages/bench/results/local-featherperf-off-fresh-5x/summary.json`
- On summary: `packages/bench/results/local-featherperf-on-fresh-5x/summary.json`

## Secondary Validation Baseline: ACM-VIT Homepage

- Date: `2026-04-21`
- Label: `acmvit-baseline-fresh-5x`
- Target: `https://www.acmvit.in/`
- Aggregate: `median of 5`
- Why it fits: Astro site, multiple client islands, GSAP, `ScrollTrigger`, and a Lottie preloader
- Why it stays secondary: the page is dominated by heavy media delivery as well as animation JavaScript

| Run | Performance | FCP | LCP | TBT | Speed Index | CLS | Total Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `70` | `3.27 s` | `4.71 s` | `225 ms` | `3.70 s` | `0.079` | `90.0 MB` |
| 2 | `58` | `3.92 s` | `5.44 s` | `371 ms` | `5.61 s` | `0.079` | `89.2 MB` |
| 3 | `66` | `2.43 s` | `5.04 s` | `419 ms` | `3.18 s` | `0.079` | `89.8 MB` |
| 4 | `68` | `3.26 s` | `4.45 s` | `322 ms` | `3.66 s` | `0.087` | `89.6 MB` |
| 5 | `70` | `3.00 s` | `4.64 s` | `273 ms` | `3.45 s` | `0.079` | `90.0 MB` |
| Median | `68` | `3.26 s` | `4.71 s` | `322 ms` | `3.66 s` | `0.079` | `89.8 MB` |

Transfer mix from the median band:

- Images: about `74.2 MB`
- Media: about `15.5 MB`
- Scripts: `123.5 KB`
- Fonts: `97.2 KB`

Main-thread cost from the median band:

- Bootup time: about `2.2 s` to `2.5 s`
- Total task time: about `4.0 s` to `4.2 s`
- Script evaluation: about `2.2 s` to `2.5 s`
- Style and layout: about `4.7 s` to `5.1 s`
- Rendering: about `2.0 s` to `2.2 s`

Verified animation assets in the saved baseline:

- `Preloader...js` references `gsap` and `lottie`
- section bundles such as `hero...js`, `Domains...js`, and `SWork...js` reference `gsap` and `ScrollTrigger`
- largest script requests include `lottie_light...js` at `45.9 KB`, `index...js` at `27.2 KB`, and `ScrollTrigger...js` at `18.1 KB`

Framing guidance:

- This is category fit validation, not the primary proof of FeatherPerf's value.
- Heavy JS is present, but transfer bytes are overwhelmingly images and video.
- Any future ACM-VIT improvement should be described as mixed resource pressure unless media scheduling also changes.

Artifacts:

- Reports: `packages/bench/results/acmvit-baseline-fresh-5x/run-{1,2,3,4,5}.report.{html,json}`
- Summary: `packages/bench/results/acmvit-baseline-fresh-5x/summary.json`
- Screenshots: `packages/bench/results/acmvit-baseline-fresh-5x/screenshots/*`
