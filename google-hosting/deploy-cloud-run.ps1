param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,
  [string]$Region = 'asia-south1',
  [string]$ServiceName = 'featherperf-analyze'
)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
try {
  gcloud config set project $ProjectId
  gcloud run deploy $ServiceName `
    --source .\analyze-api `
    --region $Region `
    --allow-unauthenticated `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$ProjectId,FEATHERPERF_VERTEX_LOCATION=$Region,FEATHERPERF_VERTEX_MODEL=gemini-2.5-flash"
}
finally {
  Pop-Location
}
