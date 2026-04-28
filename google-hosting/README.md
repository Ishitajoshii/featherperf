# FeatherPerf Google Hosting

This folder is an isolated deployment workspace for the Google hackathon version of FeatherPerf.

It does **not** modify the existing plugin, benchmark, or demo files elsewhere in the repo. Everything here is generated from the current repo state and published separately.

## What it contains

- `build-hosting.mjs`: builds the hosted Benchmark Lab and compare routes
- `firebase.json`: Firebase Hosting config
- `public/`: generated static site output for Hosting
- `analyze-api/`: Cloud Run service that calls Vertex AI Gemini and falls back safely if Vertex is unavailable

## Hosted routes

- `/` benchmark lab landing page
- `/compare/off/` baseline demo build with `FEATHERPERF=off`
- `/compare/on/` optimized demo build with `FEATHERPERF=on`
- `/api/analyze` Cloud Run API rewritten from Firebase Hosting

## Build the hosted site

Run this from the repo root or from this folder:

```powershell
node .\google-hosting\build-hosting.mjs
```

That command will:

- read the committed benchmark summaries in `packages/bench/results`
- copy the current `demo/site` into a temporary local build sandbox under `google-hosting/.build`
- build the copied demo twice without touching the original demo files
- publish the compare variants into `google-hosting/public/compare/off` and `google-hosting/public/compare/on`
- generate the root Benchmark Lab page and supporting JSON payloads

## Deploy Firebase Hosting

From `google-hosting`:

```powershell
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
node .\build-hosting.mjs
firebase deploy --only hosting
```

## Deploy Cloud Run

From the repo root:

```powershell
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud run deploy featherperf-analyze `
  --source .\google-hosting\analyze-api `
  --region asia-south1 `
  --allow-unauthenticated `
  --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_GCP_PROJECT_ID,FEATHERPERF_VERTEX_LOCATION=asia-south1,FEATHERPERF_VERTEX_MODEL=gemini-2.5-flash
```

After Cloud Run is live, deploy Firebase Hosting so the `/api/analyze` rewrite resolves.

## Notes

- The hosted page uses the real local benchmark artifacts already committed in the repo.
- The Cloud Run service supports both `benchmark-summary` and `config-hints` modes.
- If Vertex AI is unavailable or not configured yet, the API returns a deterministic fallback analysis instead of failing the demo.
