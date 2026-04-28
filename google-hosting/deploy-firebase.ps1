param(
  [Parameter(Mandatory = $true)]
  [string]$FirebaseProjectId
)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
try {
  node .\build-hosting.mjs
  firebase use $FirebaseProjectId
  firebase deploy --only hosting
}
finally {
  Pop-Location
}
