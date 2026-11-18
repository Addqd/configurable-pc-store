$ErrorActionPreference = 'Stop'
$openapi = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 20
$detail = $openapi.components.schemas.ProductDetailOut
Write-Output '--- ProductDetailOut.display_specs ---'
$detail.properties.display_specs | ConvertTo-Json -Depth 8 -Compress
Write-Output '--- ProductDisplaySpecOut ---'
$openapi.components.schemas.ProductDisplaySpecOut | ConvertTo-Json -Depth 8 -Compress
Write-Output '--- technical_specs (unchanged?) ---'
$detail.properties.technical_specs | ConvertTo-Json -Depth 8 -Compress
Write-Output '--- required fields ---'
($detail.required -join ', ')
