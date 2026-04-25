# Benchmark Results

## Benchmark Policy

- Primary proof: local demo site benchmark via `corepack pnpm bench:local`
- Why primary: stable, repeatable, and focused on JavaScript scheduling instead of internet or CDN variance
- Secondary proof: ACM-VIT homepage benchmark via `corepack pnpm bench:acmvit`
- Why secondary: validates category fit on a real Astro site, but its numbers are materially affected by heavy media payloads and remote delivery

The committed metrics below are the current ACM-VIT secondary-validation baseline captured on `2026-04-21`.

## Primary Local Baseline

- Date: `2026-04-24`
- Target: `http://127.0.0.1:4321/`
- Source: production build of `demo/site`
- Browser: local Chrome
- Lighthouse mode: mobile defaults
- Storage reset: enabled
- Browser isolation: fresh Chrome profile per run
- Run count: `5`
- Reported aggregate: `median`

| Metric | Median |
| --- | --- |
| Performance | `89` |
| FCP | `2.705 s` |
| LCP | `2.944 s` |
| TBT | `136 ms` |
| Speed Index | `2.705 s` |
| CLS | `0` |
| Total Bytes | `0.4 MB` |

### Local Readout

- Requests: `3` total
- Dominant transfer: one hoisted client bundle at about `384.6 KB`
- Images: `0 MB`
- Media: `0 MB`
- Fonts: `0 KB`
- Bootup time band: about `730 ms` to `768 ms`
- Script evaluation band: about `731 ms` to `768 ms`

### Local Artifacts

- Reports: `packages/bench/results/local-baseline-fresh-5x/run-{1,2,3,4,5}.report.{html,json}`
- Summary: `packages/bench/results/local-baseline-fresh-5x/summary.json`
- Screenshots:
  `packages/bench/results/local-baseline-fresh-5x/screenshots/desktop-home.png`
  `packages/bench/results/local-baseline-fresh-5x/screenshots/mobile-home.png`

## Secondary Validation Baseline: ACM-VIT Homepage

- Chosen demo site: `https://www.acmvit.in/`
- Stack fit: Astro site with many client-side islands and `_astro/*.js` bundles
- Why it fits: the homepage ships GSAP across multiple sections, uses `ScrollTrigger`, and includes a Lottie-based preloader
- Why it is not a clean-only-JS benchmark: transfer weight is dominated by rich media, especially the hero video and gallery images

## Tightened Baseline Method

This baseline supersedes the earlier 3-run snapshot.

- Date: `2026-04-21`
- Target: `https://www.acmvit.in/`
- Browser: local Chrome
- Lighthouse mode: mobile defaults
- Storage reset: enabled
- Browser isolation: fresh Chrome profile per run
- Run count: `5`
- Reported aggregate: `median`

## 5x Lighthouse Baseline

| Run | Performance | FCP | LCP | TBT | Speed Index | CLS | Total Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 70 | 3.27 s | 4.71 s | 225 ms | 3.70 s | 0.079 | 90.0 MB |
| 2 | 58 | 3.92 s | 5.44 s | 371 ms | 5.61 s | 0.079 | 89.2 MB |
| 3 | 66 | 2.43 s | 5.04 s | 419 ms | 3.18 s | 0.079 | 89.8 MB |
| 4 | 68 | 3.26 s | 4.45 s | 322 ms | 3.66 s | 0.087 | 89.6 MB |
| 5 | 70 | 3.00 s | 4.64 s | 273 ms | 3.45 s | 0.079 | 90.0 MB |
| Median | 68 | 3.26 s | 4.71 s | 322 ms | 3.66 s | 0.079 | 89.8 MB |

## Bottleneck Readout

### Transfer mix from the median baseline band

- Images: about `74.2 MB`
- Media: about `15.5 MB`
- Scripts: 123.5 KB
- Fonts: 97.2 KB

### Main-thread cost from the median baseline band

- Bootup time: about `2.2 s` to `2.5 s`
- Total task time: about `4.0 s` to `4.2 s`
- Script evaluation: about `2.2 s` to `2.5 s`
- Style and layout: about `4.7 s` to `5.1 s`
- Rendering: about `2.0 s` to `2.2 s`

## What This Means for Framing

- Fonts are not the bottleneck here.
- Heavy JS is present and category-aligned, but it is not the dominant transfer bottleneck by bytes.
- The honest story is mixed resource pressure:
  the page front-loads animation JS and also ships extremely heavy media.
- Featherperf should stay framed as **smart resource allocation for motion-heavy Astro/Vite pages**, not generic performance optimization.
- For the MVP, the measurable first win should be moving non-critical GSAP/Lottie/ScrollTrigger work off the critical path and tracking FCP plus TBT as primary proof points.
- LCP gains on ACM-VIT may be capped unless the site also changes how the hero video and below-the-fold media are scheduled.
- The tightened method reduces the “warm browser” objection:
  each Lighthouse pass used a fresh Chrome profile and the recorded baseline is the median of 5 runs, not a single favorable sample.

## Verified Animation Assets

Observed in the baseline page source and first-load script graph:

- `Preloader...js` references `gsap` and `lottie`
- `hero...js`, `Domains...js`, `SWork...js`, `About...js`, `ContactUs...js`, and other section bundles reference `gsap` and `ScrollTrigger`
- Largest script requests in run 1:
  `lottie_light...js` at 45.9 KB, `index...js` at 27.2 KB, `ScrollTrigger...js` at 18.1 KB

## Saved Artifacts

- Reports: `packages/bench/results/acmvit-baseline-fresh-5x/run-{1,2,3,4,5}.report.{html,json}`
- Summary: `packages/bench/results/acmvit-baseline-fresh-5x/summary.json`
- Screenshots:
  `packages/bench/results/acmvit-baseline-fresh-5x/screenshots/desktop-home.png`
  `packages/bench/results/acmvit-baseline-fresh-5x/screenshots/mobile-home.png`
