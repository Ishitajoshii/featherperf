# FeatherPerf Analyze API

This service is meant to run on Cloud Run and be reached through Firebase Hosting via the `/api/analyze` rewrite.

## Endpoints

- `GET /health`
- `POST /api/analyze`

## Supported modes

- `benchmark-summary`
- `config-hints`

## Required environment variables

- `GOOGLE_CLOUD_PROJECT` or `GCP_PROJECT`
- `FEATHERPERF_VERTEX_LOCATION` (defaults to `asia-south1`)
- `FEATHERPERF_VERTEX_MODEL` (defaults to `gemini-2.5-flash`)

Optional for local testing:

- `VERTEX_ACCESS_TOKEN`

## Example deploy

```powershell
gcloud run deploy featherperf-analyze `
  --source .\google-hosting\analyze-api `
  --region asia-south1 `
  --allow-unauthenticated `
  --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_GCP_PROJECT_ID,FEATHERPERF_VERTEX_LOCATION=asia-south1,FEATHERPERF_VERTEX_MODEL=gemini-2.5-flash
```
