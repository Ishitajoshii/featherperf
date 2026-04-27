# FeatherPerf PRD

## Product Summary

FeatherPerf is a conservative Vite plugin for deferring safe, below-the-fold motion code in modern websites so critical content paints sooner and non-critical animation work moves off the first-load path.

The first version is intentionally narrow:

- Vite-first
- Astro-compatible through Vite
- focused on `gsap`, `ScrollTrigger`, and `lottie-web`
- only rewrites importer patterns that look safe

## Problem

Motion-heavy sites often initialize expensive animation modules before users ever reach the section that needs them. That creates avoidable first-load pressure:

- earlier script evaluation
- more main-thread work during initial render
- worse first paint on pages where motion is not above the fold

Teams know this is bad, but they usually do not want to rewrite motion code by hand or maintain custom lazy-loading wrappers across every project.

## Target User

- frontend teams building marketing or editorial sites on Vite or Astro
- agencies shipping showcase-heavy pages with GSAP or Lottie
- developers who know some motion is non-critical but need safe automation

## Core Product Promise

FeatherPerf should help developers defer non-critical motion code without introducing fragile, broad rewrites.

V1 promise:

- improve first-paint scheduling for supported patterns
- keep the safety model conservative
- provide measurable before/after proof on a local reproducible demo

Non-promise in V1:

- universal byte reduction
- framework-agnostic support
- automatic wins on every performance metric
- safe rewriting of arbitrary client code

## Goals

1. Be installable as a normal npm package in Vite-based projects.
2. Detect and defer supported importer patterns with a conservative AST pass.
3. Provide a built-in runtime that schedules loading near viewport or on idle.
4. Give users a credible evaluation flow with reproducible local comparison commands.
5. Make the benchmark story honest enough for hackathon judging and real developer evaluation.

## Non-Goals

1. Rewriting all JavaScript lazy-loading opportunities.
2. Solving oversized image, font, or media delivery in V1.
3. Shipping production support for every framework in the ecosystem.
4. Rewriting import patterns whose semantics are uncertain.

## User Experience Requirements

The product should feel like this:

1. Install package from npm.
2. Add one plugin entry to the Vite config.
3. Point motion-heavy non-critical sections at supported importer patterns.
4. Run one command to compare local off/on behavior.
5. See a clear, believable result summary.

## Technical Requirements

- plugin package must work after publish, not just inside the monorepo
- importer analysis should be AST-based for supported patterns
- runtime must be small and dependency-free
- default behavior should skip risky patterns instead of trying to be clever
- benchmark results should be stored as committed summary artifacts

## Supported Patterns In Scope

- direct named import calls
- aliased named import calls
- namespace member calls

Only when:

- the trigger argument is a static selector string
- the target is not obviously critical
- the deferred module imports supported motion libraries
- the module passes safety checks

## Success Metrics

Primary success signal:

- measurable FCP improvement on the controlled local demo benchmark

Secondary signals:

- equal or better LCP
- eventual TBT and INP improvement as scheduler behavior matures
- low false-positive rewrite rate
- clear developer understanding of why modules were skipped

## Current Product Truth

As of `2026-04-28`:

- the local demo shows a strong FCP improvement
- the current committed benchmark story still shows worse TBT in the `on` run
- FeatherPerf should therefore be described as a strong scheduling prototype with real product shape, not as a universally faster production solution yet

## Roadmap

1. Broaden AST support to more real-world code shapes.
2. Reduce regex-heavy safety heuristics.
3. Add starter examples for plain Vite, Astro, and React.
4. Add explicit config-file support and clearer opt-in annotations.
5. Improve proof on TBT and INP.
6. Add CI and publish workflow.
