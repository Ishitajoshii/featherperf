# Benchmark Results

## Baseline Locked: ACM-VIT Homepage

- Chosen demo site: `https://www.acmvit.in/`
- Stack fit: Astro site with many client-side islands and `_astro/*.js` bundles
- Why it fits: the homepage ships GSAP across multiple sections, uses `ScrollTrigger`, and includes a Lottie-based preloader
- Why it is not a clean-only-JS benchmark: transfer weight is dominated by rich media, especially the hero video and gallery images

## 3x Lighthouse Baseline

All runs were captured on 2026-04-21 with Lighthouse mobile defaults and local Chrome.

| Run | Performance | FCP | LCP | TBT | Speed Index | CLS | Total Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 45 | 3.76 s | 5.42 s | 912 ms | 6.45 s | 0.079 | 108.9 MB |
| 2 | 40 | 4.75 s | 5.68 s | 578 ms | 8.41 s | 0.169 | 108.1 MB |
| 3 | 49 | 4.20 s | 5.49 s | 593 ms | 6.63 s | 0.079 | 108.9 MB |
| Avg | 44.7 | 4.24 s | 5.53 s | 694 ms | 7.16 s | 0.109 | 108.6 MB |

## Bottleneck Readout

### Transfer mix from run 1

- Images: 93.1 MB
- Media: 15.5 MB
- Scripts: 123.5 KB
- Fonts: 97.2 KB

### Main-thread cost from run 1

- Bootup time: 6.3 s
- Total task time: 12.5 s
- Script evaluation: 6343.6 ms
- Style and layout: 14510.2 ms
- Rendering: 5839.2 ms

## What This Means for Framing

- Fonts are not the bottleneck here.
- Heavy JS is present and category-aligned, but it is not the dominant transfer bottleneck by bytes.
- The honest story is mixed resource pressure:
  the page front-loads animation JS and also ships extremely heavy media.
- Featherperf should stay framed as **smart resource allocation for motion-heavy Astro/Vite pages**, not generic performance optimization.
- For the MVP, the measurable first win should be moving non-critical GSAP/Lottie/ScrollTrigger work off the critical path and tracking FCP plus TBT as primary proof points.
- LCP gains on ACM-VIT may be capped unless the site also changes how the hero video and below-the-fold media are scheduled.

## Verified Animation Assets

Observed in the baseline page source and first-load script graph:

- `Preloader...js` references `gsap` and `lottie`
- `hero...js`, `Domains...js`, `SWork...js`, `About...js`, `ContactUs...js`, and other section bundles reference `gsap` and `ScrollTrigger`
- Largest script requests in run 1:
  `lottie_light...js` at 45.9 KB, `index...js` at 27.2 KB, `ScrollTrigger...js` at 18.1 KB

## Saved Artifacts

- Reports: `packages/bench/results/acmvit-baseline/run-{1,2,3}.report.{html,json}`
- Summary: `packages/bench/results/acmvit-baseline/summary.json`
- Screenshots:
  `packages/bench/results/acmvit-baseline/screenshots/desktop-home.png`
  `packages/bench/results/acmvit-baseline/screenshots/mobile-home.png`
